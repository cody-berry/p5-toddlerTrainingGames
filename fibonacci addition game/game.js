const grid = document.querySelector('#numberGrid');
const addition = document.querySelector('#addition');
const feedback = document.querySelector('#feedback');
const instruction = document.querySelector('#instruction');
const startingCount = document.querySelector('#startingCount');
const startStop = document.querySelector('#startStop');
const resetButton = document.querySelector('#reset');
const timer = document.querySelector('#timer');

let numbers = [1n, 1n];
let column = 0;
let carry = 0;
let typed = '';
let solvedDigits = [];
let running = false;
let transitioning = false;
let advanceTimer = null;
let timeRemaining = 60;
let countdownInterval = null;

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

function renderTimer(bump = false) {
  timer.textContent = String(timeRemaining);
  timer.classList.toggle('low', timeRemaining <= 10);
  if (bump) {
    timer.classList.remove('bump');
    void timer.offsetWidth;
    timer.classList.add('bump');
  }
}

function stopCountdown() {
  window.clearInterval(countdownInterval);
  countdownInterval = null;
}

function timeUp() {
  stopCountdown();
  window.clearTimeout(advanceTimer);
  running = false;
  transitioning = false;
  typed = '';
  startStop.textContent = 'Start';
  startingCount.disabled = false;
  instruction.textContent = "Time's up!";
  addition.classList.remove('advance', 'shake');
  setFeedback('Press Start to play again.');
  render();
}

function startCountdown() {
  stopCountdown();
  countdownInterval = window.setInterval(() => {
    timeRemaining = Math.max(0, timeRemaining - 1);
    renderTimer();
    if (timeRemaining === 0) timeUp();
  }, 1000);
}

function changeTime(amount, bump = false) {
  timeRemaining = Math.max(0, timeRemaining + amount);
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
  timeRemaining = 60;
  startStop.textContent = 'Start';
  startingCount.disabled = false;
  instruction.textContent = 'Choose how many numbers, then press Start';
  addition.classList.remove('celebrate', 'shake', 'advance');
  setFeedback('');
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
      timeRemaining = 60;
      renderTimer();
    }
    running = true;
    startStop.textContent = 'Stop';
    startingCount.disabled = true;
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
    changeTime(-1);
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
  changeTime(1 + (3 * Math.floor(expected / 10)), true);
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
