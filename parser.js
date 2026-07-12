function parseMarkdown(mdContent) {
  if (typeof mdContent !== 'string') {
    return {
      success: false,
      data: [],
      decoy_pairs: [],
      errors: ['Input must be a string.']
    };
  }

  const lines = mdContent.split(/\r?\n/);
  const cards = [];
  const decoyPairs = [];
  const alacQuestions = [];
  const errors = [];
  
  let currentCard = null;
  let cardLineNum = 0;
  let currentDecoy = null;
  let decoyLineNum = 0;
  let currentAlac = null;
  let alacLineNum = 0;
  let parsingAlac = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('### ALAC QUESTIONS')) {
      if (currentCard) {
        validateAndPushCard(currentCard, cardLineNum, cards, errors);
        currentCard = null;
      }
      if (currentDecoy) {
        decoyPairs.push(currentDecoy);
        currentDecoy = null;
      }
      parsingAlac = true;
      continue;
    }

    if (line.startsWith('CARD ')) {
      if (currentCard) {
        validateAndPushCard(currentCard, cardLineNum, cards, errors);
        currentCard = null;
      }
      if (currentDecoy) {
        decoyPairs.push(currentDecoy);
        currentDecoy = null;
      }
      currentCard = {
        id: line.substring(5).trim(),
        shape: '',
        triggers: [],
        provision: '',
        elements: [],
        confusion: '',
        source: '',
        source_paragraph_id: null
      };
      cardLineNum = i + 1;
    } else if (line.startsWith('DECOY ')) {
      if (currentCard) {
        validateAndPushCard(currentCard, cardLineNum, cards, errors);
        currentCard = null;
      }
      if (currentDecoy) {
        decoyPairs.push(currentDecoy);
        currentDecoy = null;
      }
      currentDecoy = {
        id: line.substring(6).trim(),
        subject_id: '',
        shape_a_id: '',
        shape_b_id: '',
        shared_trigger: '',
        distinguishing_fact: ''
      };
      decoyLineNum = i + 1;
    } else if (parsingAlac) {
      if (line.startsWith('QUESTION ')) {
        if (currentAlac) {
          alacQuestions.push(currentAlac);
        }
        currentAlac = {
          id: line.substring(9).trim(),
          subject_id: '',
          question_text: '',
          linked_flashcard_ids: []
        };
        alacLineNum = i + 1;
      } else if (currentAlac) {
        if (line.startsWith('SUBJECT:')) {
          currentAlac.subject_id = line.replace('SUBJECT:', '').trim();
        } else if (line.startsWith('QUESTION_TEXT:')) {
          currentAlac.question_text = line.replace('QUESTION_TEXT:', '').trim();
        } else if (line.startsWith('LINKED_FLASHCARDS:')) {
          currentAlac.linked_flashcard_ids = line.replace('LINKED_FLASHCARDS:', '').split(',').map(s => s.trim()).filter(Boolean);
        }
      }
    } else if (currentDecoy) {
      if (line.startsWith('SUBJECT:')) {
        currentDecoy.subject_id = line.replace('SUBJECT:', '').trim();
      } else if (line.startsWith('SHAPE_A:')) {
        currentDecoy.shape_a_id = line.replace('SHAPE_A:', '').trim();
      } else if (line.startsWith('SHAPE_B:')) {
        currentDecoy.shape_b_id = line.replace('SHAPE_B:', '').trim();
      } else if (line.startsWith('SHARED_TRIGGER:')) {
        currentDecoy.shared_trigger = line.replace('SHARED_TRIGGER:', '').trim();
      } else if (line.startsWith('DISTINQUISHING_FACT:')) {
        currentDecoy.distinguishing_fact = line.replace('DISTINQUISHING_FACT:', '').trim();
      } else if (line.startsWith('DISTINGUISHING_FACT:')) {
        currentDecoy.distinguishing_fact = line.replace('DISTINGUISHING_FACT:', '').trim();
      }
    } else if (currentCard) {
      if (line.startsWith('FRONT (shape):')) {
        currentCard.shape = line.replace('FRONT (shape):', '').trim();
      } else if (line.startsWith('FRONT (trigger words):')) {
        currentCard.triggers = line.replace('FRONT (trigger words):', '').split(',').map(t => t.trim()).filter(Boolean);
      } else if (line.startsWith('BACK (provision):')) {
        currentCard.provision = line.replace('BACK (provision):', '').trim();
      } else if (line.startsWith('BACK (elements):')) {
        // Parse lines following it until another section starts
        let j = i + 1;
        while (j < lines.length && !lines[j].startsWith('BACK (') && !lines[j].startsWith('CARD ') && !lines[j].startsWith('DECOY ') && !lines[j].startsWith('SOURCE:')) {
          const listLine = lines[j].trim();
          if (listLine.match(/^\d+\./)) {
            currentCard.elements.push(listLine.replace(/^\d+\./, '').trim());
          }
          j++;
        }
        i = j - 1;
      } else if (line.startsWith('BACK (common confusion):')) {
        currentCard.confusion = line.replace('BACK (common confusion):', '').trim();
      } else if (line.startsWith('SOURCE_PARAGRAPH:')) {
        currentCard.source_paragraph_id = line.replace('SOURCE_PARAGRAPH:', '').trim();
      } else if (line.startsWith('SOURCE:')) {
        currentCard.source = line.replace('SOURCE:', '').trim();
      }
    }
  }
  
  if (currentCard) {
    validateAndPushCard(currentCard, cardLineNum, cards, errors);
  }
  if (currentDecoy) {
    decoyPairs.push(currentDecoy);
  }
  if (currentAlac) {
    alacQuestions.push(currentAlac);
  }

  return {
    success: errors.length === 0,
    data: cards,
    decoy_pairs: decoyPairs,
    alac_questions: alacQuestions,
    errors
  };
}

function validateAndPushCard(card, lineNum, cards, errors) {
  const cardErrors = [];
  if (!card.id) {
    cardErrors.push(`Line ${lineNum}: Missing card ID.`);
  }
  if (!card.shape) {
    cardErrors.push(`Line ${lineNum}: Missing shape description.`);
  }
  if (!card.triggers || card.triggers.length === 0) {
    cardErrors.push(`Line ${lineNum}: Missing trigger words.`);
  }
  if (!card.provision) {
    cardErrors.push(`Line ${lineNum}: Missing controlling provision.`);
  }
  if (!card.elements || card.elements.length === 0) {
    cardErrors.push(`Line ${lineNum}: Elements checklist must be a numbered list.`);
  }
  if (!card.source) {
    cardErrors.push(`Line ${lineNum}: Missing source citation.`);
  }
  
  if (cardErrors.length === 0) {
    cards.push(card);
  } else {
    errors.push(...cardErrors);
  }
}

module.exports = { parseMarkdown };
