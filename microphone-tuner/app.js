const microphoneButton = document.querySelector('#microphoneButton');
const status = document.querySelector('#status');
const targetSelect = document.querySelector('#targetNote');
const detectedNote = document.querySelector('#detectedNote');
const frequencyReadout = document.querySelector('#frequency');
const centsReadout = document.querySelector('#centsReadout');
const noteRuler = document.querySelector('#noteRuler');
const pitchPin = document.querySelector('#pitchPin');
const tuningScale = document.querySelector('#tuningScale');
const scaleHelp = document.querySelector('#scaleHelp');
const spectrum = document.querySelector('#spectrum');
const spectrumContext = spectrum.getContext('2d');

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MIN_TARGET_MIDI = 36;
const MAX_TARGET_MIDI = 96;

let audioContext = null;
let analyser = null;
let microphoneStream = null;
let animationFrame = null;
let timeData = null;
let frequencyData = null;
let lastPitchAnalysis = 0;
let rulerTargetMidi = null;
let recentDetectedMidi = [];
let smoothedMidi = null;
let pendingNote = null;
let pendingNoteFrames = 0;
let missedPitchAnalyses = 0;
let displayedTargetMidi = 69;
let toneContext = null;
let activeTone = null;

function noteName(midi) {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

function midiFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function populateTargets() {
  for (let midi = MIN_TARGET_MIDI; midi <= MAX_TARGET_MIDI; midi++) {
    const option = document.createElement('option');
    option.value = String(midi);
    option.textContent = `${noteName(midi)} — ${midiFrequency(midi).toFixed(1)} Hz`;
    targetSelect.append(option);
  }
}

function renderNoteRuler(targetMidi) {
  displayedTargetMidi = targetMidi;
  if (targetMidi === rulerTargetMidi) return;
  rulerTargetMidi = targetMidi;
  noteRuler.innerHTML = '';
  for (let offset = -12; offset <= 12; offset++) {
    const label = document.createElement('span');
    label.textContent = noteName(targetMidi + offset);
    if (offset === 0) label.className = 'target-note';
    noteRuler.append(label);
  }
}

function playSineAtMidi(midi) {
  if (!toneContext) toneContext = new AudioContext();
  if (toneContext.state === 'suspended') toneContext.resume();
  if (activeTone) {
    try { activeTone.stop(); } catch (error) { /* The previous tone already ended. */ }
  }

  const frequency = midiFrequency(midi);
  const oscillator = toneContext.createOscillator();
  const gain = toneContext.createGain();
  const now = toneContext.currentTime;
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.025);
  gain.gain.setValueAtTime(0.16, now + 0.55);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
  oscillator.connect(gain).connect(toneContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.74);
  activeTone = oscillator;

  const nearestMidi = Math.round(midi);
  const centsFromNearest = Math.round((midi - nearestMidi) * 100);
  const centsText = centsFromNearest === 0
    ? ''
    : ` (${Math.abs(centsFromNearest)}¢ ${centsFromNearest < 0 ? 'flat' : 'sharp'})`;
  scaleHelp.textContent = `Playing ${noteName(nearestMidi)}${centsText} — ${frequency.toFixed(1)} Hz`;
  oscillator.addEventListener('ended', () => {
    if (activeTone === oscillator) activeTone = null;
  });
}

function playScalePosition(horizontalPortion) {
  const clampedPortion = Math.max(0, Math.min(1, horizontalPortion));
  const semitoneOffset = (clampedPortion * 24) - 12;
  playSineAtMidi(displayedTargetMidi + semitoneOffset);
}

function estimatePitch(buffer, sampleRate) {
  let squareSum = 0;
  for (const sample of buffer) squareSum += sample * sample;
  const rms = Math.sqrt(squareSum / buffer.length);
  if (rms < 0.012) return null;

  const minimumLag = Math.floor(sampleRate / 1200);
  const maximumLag = Math.min(Math.floor(sampleRate / 55), Math.floor(buffer.length / 2));
  const windowLength = Math.min(buffer.length - maximumLag, 2048);
  const difference = new Float32Array(maximumLag + 1);
  const normalizedDifference = new Float32Array(maximumLag + 1);

  // YIN's difference function penalizes similar-looking harmonic multiples.
  for (let lag = 1; lag <= maximumLag; lag++) {
    let sum = 0;
    for (let index = 0; index < windowLength; index++) {
      const delta = buffer[index] - buffer[index + lag];
      sum += delta * delta;
    }
    difference[lag] = sum;
  }

  // Cumulative mean normalization makes the first true period preferable to
  // the deeper minima at two or three times that period.
  normalizedDifference[0] = 1;
  let runningSum = 0;
  for (let lag = 1; lag <= maximumLag; lag++) {
    runningSum += difference[lag];
    normalizedDifference[lag] = runningSum === 0
      ? 1
      : difference[lag] * lag / runningSum;
  }

  let period = -1;
  const threshold = 0.16;
  for (let lag = minimumLag; lag < maximumLag; lag++) {
    if (normalizedDifference[lag] < threshold) {
      period = lag;
      while (
        period + 1 <= maximumLag
        && normalizedDifference[period + 1] < normalizedDifference[period]
      ) {
        period++;
      }
      break;
    }
  }

  if (period < 0) {
    let bestValue = 1;
    for (let lag = minimumLag; lag <= maximumLag; lag++) {
      if (normalizedDifference[lag] < bestValue) {
        bestValue = normalizedDifference[lag];
        period = lag;
      }
    }
    if (bestValue > 0.3) return null;
  }

  const previous = normalizedDifference[period - 1] ?? normalizedDifference[period];
  const current = normalizedDifference[period];
  const next = normalizedDifference[period + 1] ?? normalizedDifference[period];
  const denominator = previous - (2 * current) + next;
  const adjustment = denominator === 0 ? 0 : 0.5 * (previous - next) / denominator;
  return sampleRate / (period + adjustment);
}

function stabilizePitch(frequency) {
  const midi = 69 + (12 * Math.log2(frequency / 440));
  recentDetectedMidi.push(midi);
  if (recentDetectedMidi.length > 7) recentDetectedMidi.shift();
  const sorted = [...recentDetectedMidi].sort((left, right) => left - right);
  const medianMidi = sorted[Math.floor(sorted.length / 2)];

  if (smoothedMidi === null) {
    smoothedMidi = medianMidi;
    return midiFrequency(smoothedMidi);
  }

  const difference = medianMidi - smoothedMidi;
  if (Math.abs(difference) > 0.6) {
    const candidateNote = Math.round(medianMidi);
    if (candidateNote === pendingNote) pendingNoteFrames++;
    else {
      pendingNote = candidateNote;
      pendingNoteFrames = 1;
    }

    if (pendingNoteFrames >= 4) {
      smoothedMidi = medianMidi;
      pendingNote = null;
      pendingNoteFrames = 0;
    }
  } else {
    pendingNote = null;
    pendingNoteFrames = 0;
    // Ignore motion below two cents, and heavily damp everything else.
    if (Math.abs(difference) >= 0.02) smoothedMidi += difference * 0.1;
  }

  return midiFrequency(smoothedMidi);
}

function drawSpectrum() {
  analyser.getByteFrequencyData(frequencyData);
  const width = spectrum.width;
  const height = spectrum.height;
  const nyquist = audioContext.sampleRate / 2;
  const minimumFrequency = 40;
  const maximumFrequency = Math.min(12000, nyquist);

  spectrumContext.clearRect(0, 0, width, height);
  const gradient = spectrumContext.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#78c4ff');
  gradient.addColorStop(1, '#1769aa');
  spectrumContext.fillStyle = gradient;

  for (let x = 0; x < width; x += 3) {
    const portion = x / width;
    const frequency = minimumFrequency * ((maximumFrequency / minimumFrequency) ** portion);
    const bin = Math.min(frequencyData.length - 1, Math.round((frequency / nyquist) * frequencyData.length));
    const magnitude = frequencyData[bin] / 255;
    const barHeight = Math.max(1, magnitude * height);
    spectrumContext.fillRect(x, height - barHeight, 2, barHeight);
  }
}

function showNoPitch() {
  detectedNote.textContent = '—';
  frequencyReadout.textContent = '— Hz';
  centsReadout.textContent = 'Listening…';
  pitchPin.classList.remove('visible');
  recentDetectedMidi = [];
  smoothedMidi = null;
  pendingNote = null;
  pendingNoteFrames = 0;
}

function renderPitch(frequency) {
  const detectedMidi = 69 + (12 * Math.log2(frequency / 440));
  const nearestMidi = Math.round(detectedMidi);
  const targetMidi = targetSelect.value === 'auto' ? nearestMidi : Number(targetSelect.value);
  const cents = 100 * (detectedMidi - targetMidi);
  const roundedCents = Math.round(cents);

  detectedNote.textContent = noteName(nearestMidi);
  frequencyReadout.textContent = `${frequency.toFixed(1)} Hz`;
  renderNoteRuler(targetMidi);

  if (Math.abs(cents) <= 8) {
    centsReadout.textContent = 'In tune';
  } else {
    centsReadout.textContent = `${Math.abs(roundedCents)}¢ ${cents < 0 ? 'flat' : 'sharp'}`;
  }

  const pinPosition = Math.max(0, Math.min(100, ((cents + 1200) / 2400) * 100));
  pitchPin.style.left = `${pinPosition}%`;
  pitchPin.classList.add('visible');
}

function update(timestamp) {
  drawSpectrum();
  if (timestamp - lastPitchAnalysis >= 70) {
    analyser.getFloatTimeDomainData(timeData);
    const estimatedFrequency = estimatePitch(timeData, audioContext.sampleRate);
    if (estimatedFrequency) {
      renderPitch(stabilizePitch(estimatedFrequency));
      missedPitchAnalyses = 0;
    }
    else {
      missedPitchAnalyses++;
      if (missedPitchAnalyses >= 8) showNoPitch();
    }
    lastPitchAnalysis = timestamp;
  }
  animationFrame = requestAnimationFrame(update);
}

async function startMicrophone() {
  try {
    status.textContent = 'Requesting microphone access…';
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false
      }
    });
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.72;
    audioContext.createMediaStreamSource(microphoneStream).connect(analyser);
    timeData = new Float32Array(analyser.fftSize);
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    lastPitchAnalysis = 0;
    recentDetectedMidi = [];
    smoothedMidi = null;
    pendingNote = null;
    pendingNoteFrames = 0;
    missedPitchAnalyses = 0;
    microphoneButton.textContent = 'Stop microphone';
    status.textContent = 'Listening to the connected microphone.';
    update();
  } catch (error) {
    status.textContent = 'Microphone access was unavailable. Check the browser permission and try again.';
  }
}

function stopMicrophone() {
  cancelAnimationFrame(animationFrame);
  microphoneStream?.getTracks().forEach(track => track.stop());
  audioContext?.close();
  microphoneStream = null;
  audioContext = null;
  analyser = null;
  microphoneButton.textContent = 'Start microphone';
  status.textContent = 'Microphone stopped.';
  showNoPitch();
  spectrumContext.clearRect(0, 0, spectrum.width, spectrum.height);
}

microphoneButton.addEventListener('click', () => {
  if (microphoneStream) stopMicrophone();
  else startMicrophone();
});

targetSelect.addEventListener('change', () => {
  if (targetSelect.value !== 'auto') {
    const targetMidi = Number(targetSelect.value);
    renderNoteRuler(targetMidi);
  }
});

tuningScale.addEventListener('click', event => {
  const bounds = tuningScale.getBoundingClientRect();
  playScalePosition((event.clientX - bounds.left) / bounds.width);
});

tuningScale.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    playScalePosition(0.5);
  }
});

populateTargets();
renderNoteRuler(69);
