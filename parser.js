function parseMarkdown(mdContent) {
  if (typeof mdContent !== 'string') {
    return {
      success: false,
      data: [],
      errors: ['Input must be a string.']
    };
  }

  const lines = mdContent.split(/\r?\n/);
  const cards = [];
  const errors = [];
  
  let currentCard = null;
  let cardLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('CARD ')) {
      if (currentCard) {
        validateAndPushCard(currentCard, cardLineNum, cards, errors);
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
        while (j < lines.length && !lines[j].startsWith('BACK (') && !lines[j].startsWith('CARD ') && !lines[j].startsWith('SOURCE:')) {
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

  return {
    success: errors.length === 0,
    data: cards,
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
