const brightColors = [
  '#FF0040',  // Hot Pink
  '#FF6B35',  // Bright Orange
  '#FFD600',  // Bright Yellow
  '#00D084',  // Bright Green
  '#0095FF',  // Bright Blue
  '#FF006E',  // Bright Magenta
  '#00F5FF',  // Bright Cyan
  '#FF4500',  // Bright Red-Orange
  '#00FF41',  // Neon Green
  '#FF10F0',  // Neon Purple
];

function getRandomColor() {
  return brightColors[Math.floor(Math.random() * brightColors.length)];
}

function changePageColor() {
  document.body.style.backgroundColor = getRandomColor();
}

// Set initial random color
changePageColor();

// Add click event to button
document.getElementById('change').addEventListener('click', changePageColor);
