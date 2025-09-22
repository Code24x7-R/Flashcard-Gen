/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI, Type} from '@google/genai';
import {marked} from 'marked';
import DOMPurify from 'dompurify';

const topicInput = document.getElementById('topicInput');
const generateButton = document.getElementById('generateButton');
const importButton = document.getElementById('importButton');
const clearButton = document.getElementById('clearButton');
const buttonContainer = document.getElementById('buttonContainer');
const flashcardsContainer = document.getElementById('flashcardsContainer');
const errorMessage = document.getElementById('errorMessage');
const zoomOverlay = document.getElementById('zoomOverlay');

// Quiz Mode elements
const quizOverlay = document.getElementById('quizOverlay');
const quizModal = document.getElementById('quizModal');

// README Modal elements
const readmeModalOverlay = document.getElementById('readmeModalOverlay');
const readmeContent = document.getElementById('readmeContent');
const closeReadmeModalButton = document.getElementById('closeReadmeModalButton');
const openReadmeLink = document.getElementById('openReadmeLink');

// API Key Modal elements
const settingsButton = document.getElementById('settingsButton');
const apiKeyModalOverlay = document.getElementById('apiKeyModalOverlay');
const closeApiKeyModalButton = document.getElementById('closeApiKeyModalButton');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyButton = document.getElementById('saveApiKeyButton');
const modalErrorMessage = document.getElementById('modalErrorMessage');

let currentFlashcards = [];
let currentLocation = null;
let isLocationBased = false;
const editIconSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
`;
const speakerIconSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>
`;

let zoomedCardState = {element: null, parent: null, nextSibling: null};

// Quiz state
let isQuizActive = false;
let quizCards = [];
let currentQuizCardIndex = 0;
let quizScore = 0;

// Cache for README content
let readmeHtml = null;

// --- API Key Management ---
function getApiKey() {
  return localStorage.getItem('geminiApiKey');
}

function saveApiKey(key) {
  localStorage.setItem('geminiApiKey', key);
}

function openApiKeyModal() {
  apiKeyInput.value = getApiKey() || '';
  modalErrorMessage.textContent = '';
  apiKeyModalOverlay.classList.add('visible');
  apiKeyInput.focus();
}

function closeApiKeyModal() {
  apiKeyModalOverlay.classList.remove('visible');
}

settingsButton.addEventListener('click', openApiKeyModal);
closeApiKeyModalButton.addEventListener('click', closeApiKeyModal);
apiKeyModalOverlay.addEventListener('click', (e) => {
  if (e.target === apiKeyModalOverlay) {
    closeApiKeyModal();
  }
});

saveApiKeyButton.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (key && key.length > 5) {
    // Basic validation
    saveApiKey(key);
    closeApiKeyModal();
    const oldError = errorMessage.textContent;
    errorMessage.textContent = 'API Key saved successfully.';
    setTimeout(() => {
      if (errorMessage.textContent === 'API Key saved successfully.') {
        errorMessage.textContent = oldError;
      }
    }, 3000);
  } else {
    modalErrorMessage.textContent = 'Please enter a valid API key.';
  }
});

// --- README Modal ---
async function openReadmeModal() {
  readmeModalOverlay.classList.add('visible');
  if (readmeHtml) {
    readmeContent.innerHTML = readmeHtml;
    return;
  }

  try {
    readmeContent.innerHTML = '<p>Loading...</p>';
    const response = await fetch('README.md');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const markdown = await response.text();
    const dirtyHtml = marked.parse(markdown);
    readmeHtml = DOMPurify.sanitize(dirtyHtml); // Cache the sanitized HTML
    readmeContent.innerHTML = readmeHtml;
  } catch (error) {
    console.error('Error fetching or rendering README:', error);
    readmeContent.innerHTML =
      '<p class="error-message">Could not load README. Please try again later.</p>';
  }
}

function closeReadmeModal() {
  readmeModalOverlay.classList.remove('visible');
}

openReadmeLink.addEventListener('click', (e) => {
  e.preventDefault();
  openReadmeModal();
});
closeReadmeModalButton.addEventListener('click', closeReadmeModal);
readmeModalOverlay.addEventListener('click', (e) => {
  if (e.target === readmeModalOverlay) {
    closeReadmeModal();
  }
});

async function displayAppVersion() {
  try {
    const response = await fetch('metadata.json');
    const metadata = await response.json();
    const version = metadata.version;
    const footer = document.getElementById('appFooter');
    if (footer && version) {
      footer.textContent = `v${version}`;
    }
  } catch (error) {
    console.error('Could not load app version:', error);
  }
}

function saveStateToLocalStorage() {
  const state = {
    topic: topicInput.value,
    flashcards: currentFlashcards,
    location: currentLocation,
    isLocationBased: isLocationBased,
  };
  localStorage.setItem('flashcardAppState', JSON.stringify(state));
}

function loadStateFromLocalStorage() {
  const savedState = localStorage.getItem('flashcardAppState');
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      topicInput.value = state.topic || '';
      currentFlashcards = state.flashcards || [];
      currentLocation = state.location || null;
      isLocationBased = state.isLocationBased || false;
      renderFlashcards();
    } catch (e) {
      console.error('Failed to parse state from local storage', e);
      localStorage.removeItem('flashcardAppState');
    }
  }
}

function renderFlashcards() {
  flashcardsContainer.textContent = ''; // Clear existing cards
  currentFlashcards.forEach((flashcard, index) => {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('flashcard');
    cardDiv.dataset['index'] = index.toString();
    cardDiv.setAttribute(
      'aria-label',
      `Flashcard: ${flashcard.term}. Click to view details.`,
    );
    cardDiv.setAttribute('role', 'button');
    cardDiv.tabIndex = 0;

    const cardInner = document.createElement('div');
    cardInner.classList.add('flashcard-inner');

    const cardFront = document.createElement('div');
    cardFront.classList.add('flashcard-front');

    const termDiv = document.createElement('div');
    termDiv.classList.add('term');
    termDiv.innerHTML = DOMPurify.sanitize(
      marked.parse(flashcard.term || ''),
    );
    cardFront.appendChild(termDiv);

    if (flashcard.languageCode) {
      const speakerIcon = document.createElement('div');
      speakerIcon.classList.add('speaker-icon');
      speakerIcon.innerHTML = speakerIconSVG;
      speakerIcon.setAttribute('role', 'button');
      speakerIcon.setAttribute(
        'aria-label',
        `Pronounce term: ${flashcard.term}`,
      );
      speakerIcon.tabIndex = 0;

      const speak = () => {
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(flashcard.term);
          utterance.lang = flashcard.languageCode;
          window.speechSynthesis.speak(utterance);
        }
      };

      speakerIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        speak();
      });

      speakerIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          speak();
        }
      });
      cardFront.appendChild(speakerIcon);
    }

    const cardBack = document.createElement('div');
    cardBack.classList.add('flashcard-back');

    const definitionDiv = document.createElement('div');
    definitionDiv.classList.add('definition');
    definitionDiv.innerHTML = DOMPurify.sanitize(
      marked.parse(flashcard.definition || ''),
    );
    cardBack.appendChild(definitionDiv);

    const isMapSearch =
      isLocationBased === true &&
      currentLocation?.city &&
      currentLocation?.country;

    let linkText;
    let linkUrl;
    let linkAriaLabel;

    if (isMapSearch) {
      const query = `${flashcard.term}, ${currentLocation.city}, ${currentLocation.country}`;
      linkText = 'Search on Map';
      linkUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        query,
      )}`;
      linkAriaLabel = `Search for ${query} on Google Maps`;
    } else {
      let query = flashcard.term;
      if (flashcard.searchKeywords && flashcard.searchKeywords.length > 0) {
        query += ' ' + flashcard.searchKeywords.join(' ');
      }
      linkText = 'Google Search';
      linkUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      linkAriaLabel = `Search for ${query} on Google`;
    }

    const searchLink = document.createElement('a');
    searchLink.textContent = linkText;
    searchLink.href = linkUrl;
    searchLink.target = '_blank';
    searchLink.rel = 'noopener noreferrer';
    searchLink.classList.add('map-link'); // Re-use style
    searchLink.addEventListener('click', (e) => e.stopPropagation());
    searchLink.setAttribute('aria-label', linkAriaLabel);
    cardBack.appendChild(searchLink);

    const editIcon = document.createElement('div');
    editIcon.classList.add('edit-icon');
    editIcon.innerHTML = editIconSVG;
    editIcon.setAttribute('role', 'button');
    editIcon.setAttribute('aria-label', `Edit flashcard: ${flashcard.term}`);
    editIcon.tabIndex = 0;

    editIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      createEditForm(cardDiv, cardInner, index);
    });

    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardDiv.appendChild(cardInner);
    cardDiv.appendChild(editIcon);

    flashcardsContainer.appendChild(cardDiv);
  });
  updateActionButtons();
}

function createEditForm(cardDiv, cardInner, index) {
  cardDiv.classList.add('editing');
  const originalCard = currentFlashcards[index];

  const form = document.createElement('div');
  form.classList.add('edit-form');
  form.addEventListener('click', (e) => e.stopPropagation());

  const termLabel = document.createElement('label');
  termLabel.textContent = 'Term';
  termLabel.style.display = 'none';
  const termArea = document.createElement('textarea');
  termArea.value = originalCard.term;
  termArea.setAttribute('aria-label', 'Edit term');

  const defLabel = document.createElement('label');
  defLabel.textContent = 'Definition';
  defLabel.style.display = 'none';
  const defArea = document.createElement('textarea');
  defArea.value = originalCard.definition;
  defArea.setAttribute('aria-label', 'Edit definition');

  const buttonsDiv = document.createElement('div');
  buttonsDiv.classList.add('edit-buttons');

  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save';
  saveButton.addEventListener('click', () => {
    currentFlashcards[index] = {
      ...currentFlashcards[index],
      term: termArea.value.trim(),
      definition: defArea.value.trim(),
    };
    renderFlashcards();
    saveStateToLocalStorage();
  });

  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => {
    renderFlashcards();
  });

  buttonsDiv.appendChild(saveButton);
  buttonsDiv.appendChild(cancelButton);
  form.appendChild(termLabel);
  form.appendChild(termArea);
  form.appendChild(defLabel);
  form.appendChild(defArea);
  form.appendChild(buttonsDiv);

  cardInner.innerHTML = '';
  cardInner.appendChild(form);
}

function handleExportJson() {
  const topic = topicInput.value.trim();

  // Sanitize the topic to create a user-friendly filename
  const filenameSuffix = topic
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^a-z0-9_-]/g, '') // Remove invalid filename characters
    .substring(0, 30); // Truncate to a reasonable length

  const finalFilename = `flashcards_${filenameSuffix || 'export'}.json`;

  const dataToExport = {
    topic: topic,
    flashcards: currentFlashcards,
    location: currentLocation,
    isLocationBased: isLocationBased,
  };
  const content = JSON.stringify(dataToExport, null, 2);
  const blob = new Blob([content], {type: 'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function updateActionButtons() {
  let exportButton = document.getElementById('exportButton');
  let quizButton = document.getElementById('quizButton');

  if (currentFlashcards.length > 0) {
    if (!exportButton) {
      exportButton = document.createElement('button');
      exportButton.id = 'exportButton';
      exportButton.textContent = 'Export as JSON';
      exportButton.addEventListener('click', handleExportJson);
      buttonContainer.appendChild(exportButton);
    }
    if (!quizButton) {
      quizButton = document.createElement('button');
      quizButton.id = 'quizButton';
      quizButton.textContent = 'Start Quiz';
      quizButton.classList.add('button-secondary');
      quizButton.addEventListener('click', startQuiz);
      // Insert quiz button before the settings button for better layout
      settingsButton.parentNode.insertBefore(quizButton, settingsButton);
    }
  } else {
    if (exportButton) exportButton.remove();
    if (quizButton) quizButton.remove();
  }
}

function parseTxt(text) {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  let topic = '';
  const flashcards = [];

  if (lines.length > 0 && lines[0].toLowerCase().startsWith('topic:')) {
    topic = lines[0].substring(6).trim();
    lines.shift();
  }

  lines.forEach((line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex > 0) {
      const term = line.substring(0, separatorIndex).trim();
      const definition = line.substring(separatorIndex + 1).trim();
      flashcards.push({term, definition});
    }
  });
  return {topic, flashcards};
}

function parseJson(text) {
  try {
    const data = JSON.parse(text);
    const topic = data.topic || '';
    const flashcards = data.flashcards || [];
    const location = data.location || null;
    const isLocationBased = data.isLocationBased || false;

    if (!Array.isArray(flashcards)) {
      throw new Error("Invalid JSON: 'flashcards' is not an array.");
    }
    return {topic, flashcards, location, isLocationBased};
  } catch (e) {
    console.error('JSON parsing error:', e);
    throw new Error('Invalid JSON file format.');
  }
}

async function handleFileSelect(event) {
  const input = event.target;
  if (!input.files || input.files.length === 0) {
    return;
  }
  const file = input.files[0];
  const reader = new FileReader();

  reader.onload = (e) => {
    const text = e.target?.result;
    try {
      errorMessage.textContent = '';
      if (file.name.endsWith('.json')) {
        const {topic, flashcards, location, isLocationBased: locBased} =
          parseJson(text);
        topicInput.value = topic;
        currentFlashcards = flashcards;
        currentLocation = location;
        isLocationBased = locBased;
        if (flashcards.length > 0) {
          errorMessage.textContent = `Imported ${flashcards.length} flashcards from JSON.`;
        }
      } else if (file.name.endsWith('.txt')) {
        const {topic, flashcards} = parseTxt(text);
        topicInput.value = topic;
        currentFlashcards = flashcards;
        currentLocation = null;
        isLocationBased = false; // Default for TXT files
        if (flashcards.length > 0) {
          errorMessage.textContent = `Imported ${flashcards.length} flashcards from text file.`;
        }
      } else {
        throw new Error(
          'Unsupported file type. Please select a .txt or .json file.',
        );
      }
      renderFlashcards();
      saveStateToLocalStorage();
    } catch (error) {
      errorMessage.textContent = `Error importing file: ${error.message}`;
      currentFlashcards = [];
      currentLocation = null;
      isLocationBased = false;
      renderFlashcards();
      saveStateToLocalStorage();
    }
  };

  reader.onerror = () => {
    errorMessage.textContent = 'Error reading file.';
  };

  reader.readAsText(file);
  input.value = '';
}

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.txt,.json';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);

importButton.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', handleFileSelect);

generateButton.addEventListener('click', async () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    errorMessage.textContent =
      'Please provide your Gemini API key in the settings.';
    openApiKeyModal();
    return;
  }

  const topic = topicInput.value.trim();
  if (!topic) {
    errorMessage.textContent =
      'Please enter a topic or some terms and definitions.';
    return;
  }

  currentFlashcards = [];
  currentLocation = null;
  isLocationBased = false;
  renderFlashcards();

  errorMessage.textContent = 'Generating flashcards...';
  generateButton.disabled = true;

  try {
    const ai = new GoogleGenAI({apiKey});
    const prompt = `Generate flashcards for the topic: "${topic}".
    1.  The definition for each card must be comprehensive and detailed, ideally 2-3 sentences long.
    2.  Format both 'term' and 'definition' using simple Markdown (e.g., bolding, lists).
    3.  Critically, for each flashcard, you MUST determine if the 'term' is in a foreign (non-English) language. If it is, you MUST provide its BCP-47 language code (e.g., 'fr-FR' for 'Déjà vu', 'it-IT' for 'Adagio'). If the term is English, omit the languageCode field entirely or set it to null.
    4.  You must also determine if the topic is primarily location-based (e.g., 'Ancient Rome'). If it is, set isLocationBased to true and provide a representative city and country. If it is not (e.g., 'Quantum Physics'), set isLocationBased to false and the location to null.
    5.  For each flashcard, extract 2-4 of the most important keywords or proper nouns from the definition that would be useful for creating a more specific Google search. Provide them in a 'searchKeywords' array. For example, if the definition mentions Florey and Heatley, include them as keywords.`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            flashcards: {
              type: Type.ARRAY,
              description: 'A list of flashcards with terms and definitions.',
              items: {
                type: Type.OBJECT,
                properties: {
                  term: {
                    type: Type.STRING,
                    description:
                      'The word or phrase to be learned, formatted in Markdown.',
                  },
                  definition: {
                    type: Type.STRING,
                    description:
                      'A detailed, multi-sentence explanation of the term, formatted in Markdown. Should be comprehensive enough for learning.',
                  },
                  languageCode: {
                    type: Type.STRING,
                    description:
                      "CRITICAL: The BCP-47 language code of the term IF AND ONLY IF it is in a foreign language (e.g., 'fr-FR', 'es-ES'). If the term is English, this field MUST be omitted or null.",
                  },
                  searchKeywords: {
                    type: Type.ARRAY,
                    description:
                      "An array of 2-4 key entities or proper nouns from the definition to improve Google search results. For example: ['Florey', 'Heatley'].",
                    items: {
                      type: Type.STRING,
                    },
                  },
                },
                required: ['term', 'definition'],
              },
            },
            location: {
              type: Type.OBJECT,
              description:
                'A relevant city and country for the topic, if it is location-based. Otherwise, this MUST be null.',
              properties: {
                city: {
                  type: Type.STRING,
                  description: 'A relevant city for the topic.',
                },
                country: {
                  type: Type.STRING,
                  description: 'A relevant country for the topic.',
                },
              },
            },
            isLocationBased: {
              type: Type.BOOLEAN,
              description:
                'True if the topic is primarily about geographical locations, otherwise false.',
            },
          },
        },
      },
    });

    const responseText = result.text;
    if (responseText) {
      try {
        const data = JSON.parse(responseText);
        const flashcards = data.flashcards;
        const location = data.location;
        const locBased = data.isLocationBased;

        if (flashcards && Array.isArray(flashcards) && flashcards.length > 0) {
          errorMessage.textContent = '';
          currentFlashcards = flashcards;
          isLocationBased = locBased === true;
          if (
            isLocationBased &&
            location &&
            typeof location.city === 'string' &&
            typeof location.country === 'string'
          ) {
            currentLocation = location;
          } else {
            currentLocation = null;
          }
          renderFlashcards();
        } else {
          errorMessage.textContent =
            'No valid flashcards could be generated. Please try a different topic or phrasing.';
        }
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError, responseText);
        errorMessage.textContent =
          'Could not understand the response from the AI. Please try again.';
      }
    } else {
      errorMessage.textContent =
        'Failed to generate flashcards or received an empty response. Please try again.';
    }
  } catch (error) {
    console.error('Error generating content:', error);
    const detailedError =
      error?.message || 'An unknown error occurred';
    errorMessage.textContent = `An error occurred: ${detailedError}`;
  } finally {
    generateButton.disabled = false;
    saveStateToLocalStorage();
  }
});

clearButton.addEventListener('click', () => {
  topicInput.value = '';
  currentFlashcards = [];
  currentLocation = null;
  isLocationBased = false;
  errorMessage.textContent = '';
  renderFlashcards();
  localStorage.removeItem('flashcardAppState');
});

// --- Zoom Logic ---

function zoomOut() {
  if (!zoomedCardState.element) return;

  const {element, parent, nextSibling} = zoomedCardState;

  const handleTransitionEnd = () => {
    zoomOverlay.removeEventListener('transitionend', handleTransitionEnd);
    // Ensure the element is still in the overlay before moving it
    if (parent && element.parentElement === zoomOverlay) {
      parent.insertBefore(element, nextSibling);
    }
    // Clear state after the element is safely back in the grid
    zoomedCardState = {element: null, parent: null, nextSibling: null};
  };

  zoomOverlay.addEventListener('transitionend', handleTransitionEnd);
  zoomOverlay.classList.remove('visible');
}

function zoomIn(cardElement) {
  if (zoomedCardState.element) return;

  // Store original position so we can return it later
  zoomedCardState = {
    element: cardElement,
    parent: cardElement.parentElement,
    nextSibling: cardElement.nextSibling,
  };

  // Move card to overlay and make it visible
  zoomOverlay.appendChild(cardElement);
  // Use rAF to ensure the transition is applied correctly
  requestAnimationFrame(() => {
    zoomOverlay.classList.add('visible');
  });
}

flashcardsContainer.addEventListener('click', (e) => {
  const card = e.target.closest('.flashcard:not(.editing)');
  if (card) {
    zoomIn(card);
  }
});

zoomOverlay.addEventListener('pointerup', (e) => {
  // A click or tap on the card content should not close the overlay, but one
  // on the background should. We detect a background interaction by checking
  // if the event target is the overlay element itself.
  // Using 'pointerup' for better mobile compatibility over 'click'.
  if (e.target === zoomOverlay) {
    zoomOut();
  }
});

// --- Quiz Mode Logic ---

function shuffleArray(array) {
  // Fisher-Yates shuffle
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function startQuiz() {
  if (currentFlashcards.length === 0) return;
  isQuizActive = true;
  quizCards = shuffleArray([...currentFlashcards]);
  currentQuizCardIndex = 0;
  quizScore = 0;
  quizOverlay.classList.add('visible');
  renderQuizQuestion();
}

function endQuiz() {
  isQuizActive = false;
  quizOverlay.classList.remove('visible');
  quizModal.innerHTML = ''; // Clear content
}

function renderQuizQuestion() {
  quizModal.innerHTML = ''; // Clear previous question
  const card = quizCards[currentQuizCardIndex];

  const header = document.createElement('div');
  header.className = 'quiz-header';
  header.innerHTML = `
    <span class="quiz-header-info" id="quizProgress">Card ${
      currentQuizCardIndex + 1
    } of ${quizCards.length}</span>
    <span class="quiz-header-info" id="quizScore">Score: ${quizScore} / ${currentQuizCardIndex}</span>
  `;

  const termContainer = document.createElement('div');
  termContainer.className = 'quiz-term-container';
  const termDiv = document.createElement('div');
  termDiv.id = 'quizTerm';
  termDiv.className = 'term';
  termDiv.innerHTML = DOMPurify.sanitize(marked.parse(card.term));
  termContainer.appendChild(termDiv);

  const answerArea = document.createElement('textarea');
  answerArea.id = 'quizAnswer';
  answerArea.placeholder = 'Type the definition here...';
  answerArea.setAttribute('aria-label', 'Your answer for the definition');

  const feedbackDiv = document.createElement('div');
  feedbackDiv.className = 'quiz-feedback';
  feedbackDiv.id = 'quizFeedback';

  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'quiz-buttons';
  const submitButton = document.createElement('button');
  submitButton.id = 'submitAnswerButton';
  submitButton.textContent = 'Submit Answer';

  const endQuizButton = document.createElement('button');
  endQuizButton.textContent = 'End Quiz';
  endQuizButton.className = 'button-secondary';
  endQuizButton.addEventListener('click', endQuiz);

  buttonsDiv.appendChild(submitButton);
  buttonsDiv.appendChild(endQuizButton);

  quizModal.append(header, termContainer, answerArea, feedbackDiv, buttonsDiv);
  answerArea.focus();

  submitButton.addEventListener('click', async () => {
    const userAnswer = answerArea.value.trim();
    if (!userAnswer) {
      feedbackDiv.textContent = 'Please enter an answer.';
      feedbackDiv.className = 'quiz-feedback incorrect';
      return;
    }
    submitButton.disabled = true;
    feedbackDiv.textContent = 'Checking...';
    feedbackDiv.className = 'quiz-feedback';

    try {
      const result = await checkAnswerWithAI(
        card.term,
        card.definition,
        userAnswer,
      );
      feedbackDiv.textContent = result.feedback;
      if (result.isCorrect) {
        quizScore++;
        feedbackDiv.classList.add('correct');
      } else {
        feedbackDiv.classList.add('incorrect');
      }
      document.getElementById('quizScore').textContent =
        `Score: ${quizScore} / ${currentQuizCardIndex + 1}`;

      // Replace submit with next/reveal buttons
      const nextButton = document.createElement('button');
      nextButton.textContent = 'Next Question';
      nextButton.addEventListener('click', () => {
        currentQuizCardIndex++;
        if (currentQuizCardIndex < quizCards.length) {
          renderQuizQuestion();
        } else {
          showQuizSummary();
        }
      });

      buttonsDiv.innerHTML = ''; // Clear old buttons
      if (!result.isCorrect) {
        const revealButton = document.createElement('button');
        revealButton.textContent = 'Reveal Answer';
        revealButton.className = 'button-secondary';
        revealButton.addEventListener('click', () => {
          const correctAnswerDiv = document.createElement('div');
          correctAnswerDiv.className = 'correct-answer';
          correctAnswerDiv.innerHTML = `<b>Correct Answer:</b> ${DOMPurify.sanitize(
            marked.parse(card.definition),
          )}`;
          feedbackDiv.appendChild(correctAnswerDiv);
          revealButton.disabled = true;
        });
        buttonsDiv.appendChild(revealButton);
      }
      buttonsDiv.appendChild(nextButton);
      buttonsDiv.appendChild(endQuizButton);
    } catch (error) {
      console.error('Quiz answer check error:', error);
      feedbackDiv.textContent = `Error checking answer: ${error.message}`;
      feedbackDiv.className = 'quiz-feedback incorrect';
      submitButton.disabled = false;
    }
  });
}

async function checkAnswerWithAI(term, definition, userAnswer) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API Key is missing.');
  const ai = new GoogleGenAI({apiKey});

  const prompt = `You are an expert quiz evaluator. Your task is to determine if a user's answer is correct based on a provided definition.
The term being quizzed is: "${term}".
The correct definition is: "${definition}".
The user's answer is: "${userAnswer}".
Evaluate the user's answer for correctness. The answer can be considered correct if it is semantically similar or captures the main points of the correct definition, even if it's not a word-for-word match. Provide a brief, one-sentence feedback explanation for why the answer is correct or incorrect. Respond ONLY with a JSON object.`;

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isCorrect: {
            type: Type.BOOLEAN,
            description:
              "True if the user's answer is semantically correct, false otherwise.",
          },
          feedback: {
            type: Type.STRING,
            description:
              "A brief, one-sentence explanation for why the answer is correct or incorrect, to be shown to the user (e.g., 'That's right! You captured the main idea.' or 'Not quite, you missed the key point about...')",
          },
        },
        required: ['isCorrect', 'feedback'],
      },
    },
  });

  return JSON.parse(result.text);
}

function showQuizSummary() {
  quizModal.innerHTML = '';
  const percentage =
    quizCards.length > 0 ? Math.round((quizScore / quizCards.length) * 100) : 0;

  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'quiz-summary';
  summaryDiv.innerHTML = `
    <h2>Quiz Complete!</h2>
    <div class="quiz-summary-score">${percentage}%</div>
    <div class="quiz-summary-details">You answered ${quizScore} out of ${quizCards.length} questions correctly.</div>
  `;

  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'quiz-buttons';

  const tryAgainButton = document.createElement('button');
  tryAgainButton.textContent = 'Try Again';
  tryAgainButton.addEventListener('click', startQuiz);

  const backButton = document.createElement('button');
  backButton.textContent = 'Back to Flashcards';
  backButton.className = 'button-secondary';
  backButton.addEventListener('click', endQuiz);

  buttonsDiv.appendChild(tryAgainButton);
  buttonsDiv.appendChild(backButton);
  summaryDiv.appendChild(buttonsDiv);
  quizModal.appendChild(summaryDiv);
}

// --- Global Event Handlers ---
document.addEventListener('keydown', (e) => {
  // Handle Escape key to close any open modal
  if (e.key === 'Escape') {
    if (readmeModalOverlay.classList.contains('visible')) {
      closeReadmeModal();
    } else if (apiKeyModalOverlay.classList.contains('visible')) {
      closeApiKeyModal();
    } else if (zoomOverlay.classList.contains('visible')) {
      zoomOut();
    }
    // Note: Quiz modal is not closed with Escape to prevent accidental progress loss.
  }

  // Handle Enter/Space to zoom in on a focused card, but only if no modals are open.
  if (e.key === 'Enter' || e.key === ' ') {
    const isModalOpen =
      readmeModalOverlay.classList.contains('visible') ||
      apiKeyModalOverlay.classList.contains('visible') ||
      quizOverlay.classList.contains('visible') ||
      zoomOverlay.classList.contains('visible');

    if (!isModalOpen) {
      const card = document.activeElement?.closest('.flashcard:not(.editing)');
      if (card) {
        e.preventDefault();
        zoomIn(card);
      }
    }
  }
});

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  loadStateFromLocalStorage();
  displayAppVersion();
  if (!getApiKey()) {
    setTimeout(openApiKeyModal, 500); // Open modal for first-time users
  }
});
