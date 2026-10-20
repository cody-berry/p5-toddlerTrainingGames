const grid = document.querySelector('#numberGrid');
const addition = document.querySelector('#addition');
const feedback = document.querySelector('#feedback');
const instruction = document.querySelector('#instruction');
const startingCount = document.querySelector('#startingCount');
const startStop = document.querySelector('#startStop');
const resetButton = document.querySelector('#reset');
const timer = document.querySelector('#timer');
const stopwatch = document.querySelector('#stopwatch');
const shakeFill = document.querySelector('#shakeFill');
const shakeGlass = document.querySelector('.shake-glass');
const bubbles = [...document.querySelectorAll('.bubble')];
const difficultySelect = document.querySelector('#difficulty');

const DIFFICULTIES = {
  easy: { label: 'Easy', startingTime: 60, maximumTime: 80, failPenalty: 0, scoreMultiplier: 1.5 },
  medium: { label: 'Medium', startingTime: 40, maximumTime: 60, failPenalty: 1, scoreMultiplier: 1 },
  hard: { label: 'Hard', startingTime: 30, maximumTime: 48, failPenalty: 2, scoreMultiplier: 0.75 },
  supreme: { label: 'Supreme', startingTime: 20, maximumTime: 35, failPenalty: 3, scoreMultiplier: 0.5 }
};

let numbers = [1n, 1n];
let column = 0;
let carry = 0;
let typed = '';
let solvedDigits = [];
let running = false;
let transitioning = false;
let advanceTimer = null;
let milkshakeArrivalTimer = null;
let difficulty = 'easy';
let timeRemaining = 0;
let elapsedSeconds = 0;
let countdownInterval = null;
let lastCountdownTime = null;
const FULL_SHAKE_HEIGHT = 92;
const LOW_FILL_THRESHOLD = 0.05;

function difficultySettings() {
  return DIFFICULTIES[difficulty] ?? DIFFICULTIES.easy;
}

function startingNumbers(count) {
  return Array.from({ length: count }, () => 1n);
}

function chosenCount() {
  const value = Number(startingCount.value);
  return Number.isSafeInteger(value) && value >= 2 ? value : null;
}

function paddedProblem() {
  const width = Math.max(...numbers.map(number => number.toString().length)) + 1;
  return {
    rows: numbers.map(number => number.toString().padStart(width, '0')),
    width
  };
}

function cell(text, className, row, col, extra = '') {
  return `<div class="cell ${className} ${extra}" style="grid-row:${row};grid-column:${col}">${text}</div>`;
}

function render(justAdded = -1) {
  const problem = paddedProblem();
  const lineRow = numbers.length + 2;
  const resultRow = lineRow + 1;
  grid.style.setProperty('--digits', problem.width);
  grid.style.gridTemplateRows = `40px repeat(${numbers.length}, var(--cell)) 8px var(--cell)`;
  let html = '';

  for (let i = 0; i < problem.width; i++) {
    const gridColumn = i + 2;
    const shownCarry = i === column && carry ? carry : '';
    html += cell(shownCarry, 'carry', 1, gridColumn);

    problem.rows.forEach((number, index) => {
      html += cell(number[i], `digit operand operand-${index}`, index + 2, gridColumn);
    });

    html += cell('', 'line', lineRow, gridColumn);
    const solved = solvedDigits[i];
    const isCurrent = running && !transitioning && i === column;
    const displayed = solved ?? (isCurrent ? typed : '');
    const resultClass = solved === undefined && !isCurrent ? 'pending' : '';
    const typedClass = isCurrent && typed ? 'typed' : '';
    const popClass = i === justAdded ? 'just-added' : '';
    html += cell(displayed, `result ${resultClass} ${typedClass}`, resultRow, gridColumn, popClass);
  }

  html += cell('+', 'operator', numbers.length + 1, 1);
  html += `<div class="line" style="grid-row:${lineRow};grid-column:1 / -1"></div>`;
  grid.innerHTML = html;
}

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle('error', isError);
}

function beginMilkshakeArrival() {
  window.clearTimeout(milkshakeArrivalTimer);
  shakeFill.classList.add('arriving-fill');
  milkshakeArrivalTimer = window.setTimeout(() => {
    shakeFill.classList.remove('arriving-fill');
    milkshakeArrivalTimer = null;
  }, 900);
}

function shuffleBubbles() {
  bubbles.forEach(bubble => {
    const size = 6 + Math.random() * 7;
    bubble.style.setProperty('--bubble-size', `${size.toFixed(1)}px`);
    bubble.style.left = `${8 + Math.random() * 78}%`;
  });
}

function renderMilkshake() {
  const { maximumTime } = difficultySettings();
  const ratio = Math.min(1, Math.max(0, timeRemaining / maximumTime));
  const glassHeight = shakeGlass.clientHeight;
  const ellipseHeight = parseFloat(getComputedStyle(shakeGlass).getPropertyValue('--pitcher-ellipse')) || 28;
  const fullHeight = glassHeight * (FULL_SHAKE_HEIGHT / 100);
  const lowFill = ratio < LOW_FILL_THRESHOLD;
  const surfaceScale = lowFill ? ratio / LOW_FILL_THRESHOLD : 1;
  const fillHeight = lowFill
    ? ellipseHeight
    : ellipseHeight + ((ratio - LOW_FILL_THRESHOLD) / (1 - LOW_FILL_THRESHOLD)) * (fullHeight - ellipseHeight);

  shakeFill.style.height = `${Math.max(ellipseHeight, fillHeight)}px`;
  shakeFill.style.setProperty('--surface-scale', String(surfaceScale));
  shakeFill.classList.toggle('low-fill', lowFill);

  const surfaceTop = glassHeight - fillHeight + (ellipseHeight * (1 - surfaceScale) / 2);
  const surfaceBottom = surfaceTop + (ellipseHeight * surfaceScale);
  bubbles.forEach(bubble => {
    const bubbleTop = bubble.offsetTop;
    const isSubmerged = ratio > 0 && surfaceBottom <= bubbleTop;
    bubble.classList.toggle('hidden-bubble', !isSubmerged);
  });
}

function renderTimer(bump = false) {
  timer.textContent = String(Math.ceil(timeRemaining));
  timer.classList.toggle('low', timeRemaining <= 10);
  renderMilkshake();
  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(elapsedSeconds % 60).toString().padStart(2, '0');
  stopwatch.textContent = `${minutes}:${seconds}`;
  if (bump) {
    timer.classList.remove('bump');
    void timer.offsetWidth;
    timer.classList.add('bump');
  }
}

function stopCountdown() {
  window.clearInterval(countdownInterval);
  countdownInterval = null;
  lastCountdownTime = null;
}

function timeUp() {
  stopCountdown();
  window.clearTimeout(advanceTimer);
  running = false;
  transitioning = false;
  typed = '';
  startStop.textContent = 'Start';
  startingCount.disabled = false;
  difficultySelect.disabled = false;
  instruction.textContent = "Time's up!";
  addition.classList.remove('advance', 'shake');
  setFeedback('Press Start to play again.');
  render();
}

function startCountdown() {
  stopCountdown();
  lastCountdownTime = performance.now();
  countdownInterval = window.setInterval(() => {
    const now = performance.now();
    const elapsed = (now - lastCountdownTime) / 1000;
    lastCountdownTime = now;
    timeRemaining = Math.max(0, timeRemaining - elapsed);
    elapsedSeconds += elapsed;
    renderTimer();
    if (timeRemaining === 0) {
      timeUp();
      return;
    }
  }, 50);
}

function changeTime(amount, bump = false) {
  if (amount > 0) beginMilkshakeArrival();
  timeRemaining = Math.min(difficultySettings().maximumTime, Math.max(0, timeRemaining + amount));
  renderTimer(bump);
  if (timeRemaining === 0) timeUp();
}

function resetGame() {
  window.clearTimeout(advanceTimer);
  stopCountdown();
  const count = chosenCount() ?? 2;
  startingCount.value = String(count);
  numbers = startingNumbers(count);
  column = paddedProblem().width - 1;
  carry = 0;
  typed = '';
  solvedDigits = [];
  running = false;
  transitioning = false;
  timeRemaining = difficultySettings().startingTime;
  elapsedSeconds = 0;
  startStop.textContent = 'Start';
  startingCount.disabled = false;
  difficultySelect.disabled = false;
  instruction.textContent = 'Choose difficulty and starting numbers, then press Start';
  addition.classList.remove('celebrate', 'shake', 'advance');
  setFeedback('');
  shuffleBubbles();
  renderTimer();
  render();
}

function startOrToggle() {
  if (!running) {
    if (startStop.textContent === 'Start') {
      const count = chosenCount();
      if (count === null) {
        setFeedback('Enter a whole number of 2 or more.', true);
        startingCount.focus();
        return;
      }
      numbers = startingNumbers(count);
      column = paddedProblem().width - 1;
      carry = 0;
      typed = '';
      solvedDigits = [];
      timeRemaining = difficultySettings().startingTime;
      elapsedSeconds = 0;
      renderTimer();
    }
    running = true;
    startStop.textContent = 'Stop';
    startingCount.disabled = true;
    difficultySelect.disabled = true;
    instruction.textContent = 'Add the numbers in the current column';
    setFeedback('');
    startCountdown();
  } else {
    running = false;
    stopCountdown();
    startStop.textContent = 'Resume';
    instruction.textContent = 'Game paused';
    setFeedback('');
  }
  render();
}

function submit() {
  if (!running || transitioning || typed === '') return;
  const { rows } = paddedProblem();
  const expected = rows.reduce((sum, number) => sum + Number(number[column]), carry);

  if (Number(typed) !== expected) {
    typed = '';
    changeTime(-difficultySettings().failPenalty);
    if (timeRemaining === 0) return;
    setFeedback('Try again!', true);
    addition.classList.remove('shake');
    void addition.offsetWidth;
    addition.classList.add('shake');
    render();
    return;
  }

  const previousColumn = column;
  solvedDigits[column] = String(expected % 10);
  const nonzeroAddends = rows.filter(number => Number(number[column]) !== 0).length;
  const earnedTime = ((Math.floor(expected / 10) * 2) + 1) * Math.max(nonzeroAddends, 1);
  changeTime(earnedTime * difficultySettings().scoreMultiplier, true);
  carry = Math.floor(expected / 10);
  typed = '';
  setFeedback('Great job!');

  if (column > 0) {
    column--;
    render(previousColumn);
    return;
  }

  transitioning = true;
  render(previousColumn);
  const next = numbers.reduce((sum, number) => sum + number, 0n);
  setFeedback(`${numbers.join(' + ')} = ${next}`);

  requestAnimationFrame(() => addition.classList.add('advance'));
  advanceTimer = window.setTimeout(() => {
    numbers = [...numbers.slice(1), next];
    column = paddedProblem().width - 1;
    carry = 0;
    solvedDigits = [];
    transitioning = false;
    addition.classList.remove('celebrate', 'advance');
    setFeedback('');
    render();
  }, 430);
}

startStop.addEventListener('click', startOrToggle);
resetButton.addEventListener('click', resetGame);
difficultySelect.addEventListener('change', () => {
  const nextDifficulty = difficultySelect.value;
  shakeFill.classList.add('instant-fill');
  timeRemaining = 0;
  renderTimer();
  void shakeFill.offsetHeight;
  difficulty = nextDifficulty;
  shakeFill.classList.remove('instant-fill');
  beginMilkshakeArrival();
  resetGame();
});
startingCount.addEventListener('keydown', event => event.stopPropagation());

window.addEventListener('keydown', event => {
  if (!running || transitioning) return;

  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    typed += event.key;
    setFeedback('');
    render();
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    typed = typed.slice(0, -1);
    render();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    submit();
  }
});

resetGame();
