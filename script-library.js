// Library page logic — data is injected by admin.js via window.initLibraryText()
let _items = [];
let currentTexts = [];
let currentIndex = 0;

// Called by admin.js after content.json loads
window.initLibraryText = function (items) {
  _items = items;
};

// Called when a cover is clicked (idx is 0-based)
window.showText = function (idxOneBased) {
  const idx = idxOneBased - 1;
  if (!_items[idx]) return;
  currentIndex = 0;
  currentTexts = _items[idx].pages;
  updateTextArea();
};

function nextPage() {
  if (currentIndex < currentTexts.length - 1) {
    currentIndex++;
    updateTextArea();
  }
}

function previousPage() {
  if (currentIndex > 0) {
    currentIndex--;
    updateTextArea();
  }
}

function playMusic() {
  document.getElementById('background-music').play();
}

function updateTextArea() {
  if (currentTexts.length > 0) {
    document.getElementById('text-area').value = currentTexts[currentIndex];
  }
}
