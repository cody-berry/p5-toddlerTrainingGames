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
const phoneMode = document.querySelector('#phoneMode');
const phoneAnswerForm = document.querySelector('#phoneAnswerForm');
const phoneAnswer = document.querySelector('#phoneAnswer');
const keyboardHint = document.querySelector('#keyboardHint');
const highlightColumn = document.querySelector('#highlightColumn');
let columnHighlighted = false;

const DIFFICULTIES = {
  easy: { label: 'Easy', startingTime: 60, maximumTime: 80, failPenalty: 0, scoreMultiplier: 1.5 },
  medium: { label: 'Medium', startingTime: 40, maximumTime: 60, failPenalty: 1, scoreMultiplier: 1 },
  hard: { label: 'Hard', startingTime: 30, maximumTime: 48, failPenalty: 2, scoreMultiplier: 0.75 },
  supreme: { label: 'Supreme', startingTime: 20, maximumTime: 35, failPenalty: 3, scoreMultiplier: 0.5 }
};

let numbers = [1n, 1n];
let column = 0;
let topDigits = [];
let borrowed = [];
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

function startingNumbers(index) {
  let previous = 1n;
  let current = 1n;
  for (let step = 1; step < index; step++) {
    [previous, current] = [current, previous + current];
  }
  return [current, previous];
}

function chosenCount() {
  const value = Number(startingCount.value);
  return Number.isInteger(value) && value >= 3 && value <= 100 ? value : null;
}

function loadProblem(pair) {
  numbers = pair;
  const { rows, width } = paddedProblem();
  topDigits = Array.from(rows[0], Number);
  borrowed = Array(width).fill(false);
  column = width - 1;
  typed = '';
  solvedDigits = [];
}

function paddedProblem() {
  const width = Math.max(...numbers.map(number => number.toString().length));
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
    if (phoneMode.checked && columnHighlighted && i === column) {
      html += `<div class="column-highlight" aria-hidden="true" style="grid-row:2 / ${resultRow + 1};grid-column:${gridColumn}"></div>`;
    }
    const canBorrow = running && !transitioning && i > 0 && i <= column;
    const label = borrowed[i] ? 'Undo carry' : 'Carry';
    const button = i > 0
      ? `<button type="button" class="borrow-button" data-column="${i}" ${canBorrow ? '' : 'disabled'}>${label}</button>`
      : '';
    html += `<div class="borrow-control" style="grid-row:1;grid-column:${gridColumn}">${button}</div>`;
    html += cell(topDigits[i], 'digit', 2, gridColumn);
    html += cell(problem.rows[1][i], 'digit', 3, gridColumn);

    html += cell('', 'line', lineRow, gridColumn);
    const solved = solvedDigits[i];
    const isCurrent = running && !transitioning && i === column;
    const displayed = solved ?? (isCurrent ? typed : '');
    const resultClass = solved === undefined && !isCurrent ? 'pending' : '';
    const typedClass = isCurrent && typed ? 'typed' : '';
    const popClass = i === justAdded ? 'just-added' : '';
    html += cell(displayed, `result ${resultClass} ${typedClass}`, resultRow, gridColumn, popClass);
  }

  html += cell('−', 'operator', numbers.length + 1, 1);
  html += `<div class="line" style="grid-row:${lineRow};grid-column:1 / -1"></div>`;
  grid.innerHTML = html;
  phoneAnswer.disabled = !running;
  phoneAnswerForm.querySelector('button').disabled = !running || transitioning;
  highlightColumn.disabled = !running || transitioning || columnHighlighted;
  if (phoneAnswer.value !== typed) phoneAnswer.value = typed;
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
  columnHighlighted = false;
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
  columnHighlighted = false;
  window.clearTimeout(advanceTimer);
  stopCountdown();
  const count = chosenCount() ?? 8;
  startingCount.value = String(count);
  loadProblem(startingNumbers(count));
  running = false;
  transitioning = false;
  timeRemaining = difficultySettings().startingTime;
  elapsedSeconds = 0;
  startStop.textContent = 'Start';
  startingCount.disabled = false;
  difficultySelect.disabled = false;
  instruction.textContent = 'Choose a difficulty and starting Fibonacci index';
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
        setFeedback('Enter a Fibonacci index from 3 to 100.', true);
        startingCount.focus();
        return;
      }
      loadProblem(startingNumbers(count));
      timeRemaining = difficultySettings().startingTime;
      columnHighlighted = false;
      elapsedSeconds = 0;
      renderTimer();
    }
    running = true;
    startStop.textContent = 'Stop';
    startingCount.disabled = true;
    difficultySelect.disabled = true;
    instruction.textContent = 'Subtract in the current column';
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
  const expected = topDigits[column] - Number(rows[1][column]);

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
  columnHighlighted = false;
  solvedDigits[column] = String(expected % 10);
  const nonzeroOperands = rows.filter(number => Number(number[column]) !== 0).length;
  let carryCount = 0;
  for (let index = column; borrowed[index]; index--) {
    carryCount++;
    // A zero had to borrow before it could lend to the column on its right.
    if (rows[0][index - 1] !== '0') break;
  }
  const earnedTime = (4 * carryCount + 1) * Math.max(nonzeroOperands, 0.2);
  changeTime(earnedTime * difficultySettings().scoreMultiplier, true);
  typed = '';
  setFeedback('Great job!');

  if (column > 0) {
    column--;
    render(previousColumn);
    return;
  }

  const [first, second] = numbers;
  const difference = first - second;
  setFeedback(`${first} − ${second} = ${difference}`);
  if (first === 3n) {
    stopCountdown();
    running = false;
    startStop.textContent = 'Start';
    startingCount.disabled = false;
    difficultySelect.disabled = false;
    instruction.textContent = 'Finished!';
    render(previousColumn);
    return;
  }

  transitioning = true;
  render(previousColumn);
  advanceTimer = window.setTimeout(() => {
    loadProblem([second, difference]);
    transitioning = false;
    setFeedback('');
    render();
  }, 430);
}

function toggleCarry(index) {
  if (!running || transitioning) return;
  if (index < 1 || index > column) return;

  if (borrowed[index]) {
    if (topDigits[index] < 10) {
      setFeedback('This column already lent its ten.', true);
      return;
    }
    topDigits[index] -= 10;
    topDigits[index - 1]++;
  } else {
    if (topDigits[index - 1] === 0) {
      changeTime(-Math.max(1, difficultySettings().failPenalty));
      if (running) setFeedback('The digit to the left is 0. Carry into that column first.', true);
      return;
    }
    topDigits[index] += 10;
    topDigits[index - 1]--;
  }
  borrowed[index] = !borrowed[index];
  setFeedback('');
  render();
}

grid.addEventListener('click', event => {
  const button = event.target.closest('.borrow-button');
  if (!button) return;
  const index = Number(button.dataset.column);
  toggleCarry(index);
  grid.querySelector(`[data-column="${index}"]`)?.focus();
});

function updatePhoneMode() {
  phoneAnswerForm.hidden = !phoneMode.checked;
  keyboardHint.hidden = phoneMode.checked;
  renderTimer();
  render();
  if (phoneMode.checked && running) phoneAnswer.focus();
}

phoneMode.addEventListener('change', updatePhoneMode);
highlightColumn.addEventListener('click', () => {
  if (!phoneMode.checked || !running || transitioning || columnHighlighted) return;
  columnHighlighted = true;
  changeTime(-2);
  if (running) {
    render();
    phoneAnswer.focus();
  }
});
phoneAnswer.addEventListener('input', () => {
  if (!running || transitioning) {
    phoneAnswer.value = typed;
    return;
  }
  typed = phoneAnswer.value.replace(/[^0-9]/g, '').slice(0, 1);
  setFeedback('');
  render();
});
phoneAnswerForm.addEventListener('submit', event => {
  event.preventDefault();
  submit();
  if (running) phoneAnswer.focus();
});

startStop.addEventListener('click', () => {
  startOrToggle();
  if (phoneMode.checked && running) phoneAnswer.focus();
});
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
  if (phoneMode.checked || event.target === phoneMode) return;
  if (!running || transitioning) return;

  if (!event.metaKey && (event.code === 'KeyC' || event.key.toLowerCase() === 'c')) {
    event.preventDefault();
    if (event.repeat) return;
    const offset = Number(event.shiftKey) + Number(event.altKey) + Number(event.ctrlKey);
    toggleCarry(column - offset);
  } else if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    typed = event.key;
    setFeedback('');
    render();
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    typed = typed.slice(0, -1);
    render();
  } else if (event.key === 'Enter') {
    if (event.target instanceof HTMLButtonElement && !typed) return;
    event.preventDefault();
    submit();
  }
});

resetGame();
updatePhoneMode();
