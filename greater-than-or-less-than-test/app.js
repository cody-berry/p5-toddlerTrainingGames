const numberOne = document.querySelector('#numberOne');
const numberTwo = document.querySelector('#numberTwo');
const comparison = document.querySelector('#comparison');
const feedback = document.querySelector('#feedback');
const nextPattern = document.querySelector('#nextPattern');

let correctRelationship = '';

function makePattern() {
  const first = Math.floor(1.1 ** (Math.random() * 72));
  const minimum = first * 0.1;
  const maximum = first * 1.9;
  let second;

  if (Math.random() < 0.2) {
    second = first;
  } else {
    do {
      second = Math.floor(minimum + (Math.random() * (maximum - minimum)));
    } while (second === first);
  }

  correctRelationship = first > second
    ? 'greater-than'
    : first < second
      ? 'less-than'
      : 'equal-to';

  numberOne.textContent = String(first);
  numberTwo.textContent = String(second);
  comparison.value = '';
  feedback.textContent = '';
  feedback.className = '';
}

comparison.addEventListener('change', () => {
  const isCorrect = comparison.value === correctRelationship;
  feedback.textContent = isCorrect ? 'correct' : 'incorrect, try again';
  feedback.className = isCorrect ? 'correct' : 'incorrect';
});

nextPattern.addEventListener('click', makePattern);

makePattern();
