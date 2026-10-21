const numberOne = document.querySelector('#numberOne');
const numberTwo = document.querySelector('#numberTwo');
const comparisonButtons = [...document.querySelectorAll('[data-comparison]')];
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
  comparisonButtons.forEach(button => {
    button.classList.remove('correct-choice', 'incorrect-choice');
    button.disabled = false;
  });
  feedback.textContent = '';
  feedback.className = '';
}

comparisonButtons.forEach(button => {
  button.addEventListener('click', () => {
    const isCorrect = button.dataset.comparison === correctRelationship;
    button.classList.add(isCorrect ? 'correct-choice' : 'incorrect-choice');
    button.disabled = true;
    if (isCorrect) {
      comparisonButtons.forEach(choice => { choice.disabled = true; });
    }
    feedback.textContent = isCorrect ? 'correct' : 'incorrect, try again';
    feedback.className = isCorrect ? 'correct' : 'incorrect';
  });
});

nextPattern.addEventListener('click', makePattern);

makePattern();
