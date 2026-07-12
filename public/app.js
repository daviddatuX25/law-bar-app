document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.getElementById('subject-dropdown');
  const tier1Badge = document.getElementById('tier-1-badge');
  const tier2Badge = document.getElementById('tier-2-badge');
  const tier3Badge = document.getElementById('tier-3-badge');
  const tier1Content = document.getElementById('tier-1-content');
  const tier2Content = document.getElementById('tier-2-content');
  const tier3Content = document.getElementById('tier-3-content');
  const funnelTiers = document.querySelectorAll('.funnel-tier');

  if (dropdown) {
    // Initialize tier expand/collapse toggles
    funnelTiers.forEach(tier => {
      tier.addEventListener('click', (e) => {
        if (e.target.closest('.tier-body')) {
          return;
        }
        const isOpen = tier.classList.contains('open');
        if (!isOpen) {
          funnelTiers.forEach(t => t.classList.remove('open'));
          tier.classList.add('open');
        } else {
          tier.classList.remove('open');
        }
      });
    });

    // Load all subjects on startup
    fetch('/api/subjects')
      .then(res => res.json())
      .then(subjects => {
        dropdown.innerHTML = '<option value="">-- Select Subject --</option>';
        subjects.forEach(sub => {
          const opt = document.createElement('option');
          opt.value = sub.id;
          opt.textContent = sub.name;
          dropdown.appendChild(opt);
        });
        // Auto-select first subject
        if (subjects.length > 0) {
          dropdown.value = subjects[0].id;
          dropdown.dispatchEvent(new Event('change'));
        }
      })
      .catch(err => {
        console.error('Error loading subjects:', err);
        dropdown.innerHTML = '<option value="">Failed to load subjects</option>';
      });

    // Handle subject change
    dropdown.addEventListener('change', () => {
      const subjectId = dropdown.value;
      if (!subjectId) {
        resetDashboard();
        return;
      }

      Promise.all([
        fetch(`/api/subjects/${subjectId}/deck`).then(res => res.json()),
        fetch(`/api/subjects/${subjectId}/triggers`).then(res => res.json())
      ])
      .then(([deckData, triggersData]) => {
        updateDashboard(deckData, triggersData);
        updateQuickStats(deckData, triggersData);
      })
      .catch(err => {
        console.error('Error loading subject details:', err);
        showErrorState();
      });
    });
  }

  function resetDashboard() {
    if (tier1Badge) tier1Badge.textContent = '0 provisions';
    if (tier2Badge) tier2Badge.textContent = '0 shapes';
    if (tier3Badge) tier3Badge.textContent = '0 triggers';

    if (tier1Content) tier1Content.innerHTML = '<div class="empty-state">Select a subject to view mapped provisions.</div>';
    if (tier2Content) tier2Content.innerHTML = '<div class="empty-state">Select a subject to view case signatures.</div>';
    if (tier3Content) tier3Content.innerHTML = '<div class="empty-state">Select a subject to view trigger words.</div>';

    funnelTiers.forEach(t => t.classList.remove('open'));
    resetQuickStats();
  }

  function resetQuickStats() {
    const statShapes = document.getElementById('stat-total-shapes');
    const statTriggers = document.getElementById('stat-total-triggers');
    const statDecoys = document.getElementById('stat-total-decoys');
    const statProvisions = document.getElementById('stat-total-provisions');
    if (statShapes) statShapes.textContent = '—';
    if (statTriggers) statTriggers.textContent = '—';
    if (statDecoys) statDecoys.textContent = '—';
    if (statProvisions) statProvisions.textContent = '—';
  }

  function updateQuickStats(deckData, triggersData) {
    const flashcards = deckData.flashcards || [];
    const decoys = deckData.decoys || [];
    const triggers = triggersData || [];

    const provisionsSet = new Set();
    flashcards.forEach(card => {
      if (card.back_provision) provisionsSet.add(card.back_provision);
    });

    const statShapes = document.getElementById('stat-total-shapes');
    const statTriggers = document.getElementById('stat-total-triggers');
    const statDecoys = document.getElementById('stat-total-decoys');
    const statProvisions = document.getElementById('stat-total-provisions');

    if (statShapes) statShapes.textContent = flashcards.length;
    if (statTriggers) statTriggers.textContent = triggers.length;
    if (statDecoys) statDecoys.textContent = decoys.length;
    if (statProvisions) statProvisions.textContent = provisionsSet.size;
  }

  function showErrorState() {
    if (tier1Content) tier1Content.innerHTML = '<div class="empty-state" style="color: var(--red);">Error loading provisions.</div>';
    if (tier2Content) tier2Content.innerHTML = '<div class="empty-state" style="color: var(--red);">Error loading case signatures.</div>';
    if (tier3Content) tier3Content.innerHTML = '<div class="empty-state" style="color: var(--red);">Error loading trigger words.</div>';
  }

  function updateDashboard(deckData, triggersData) {
    const flashcards = deckData.flashcards || [];
    const triggers = triggersData || [];

    // --- Tier 1: Process Unique Provisions ---
    const provisionsMap = new Map();
    flashcards.forEach(card => {
      if (card.back_provision && !provisionsMap.has(card.back_provision)) {
        provisionsMap.set(card.back_provision, {
          title: card.back_provision,
          elements: card.back_elements || [],
          confusion: card.back_confusion || ''
        });
      }
    });

    const uniqueProvisions = Array.from(provisionsMap.values());
    if (tier1Badge) tier1Badge.textContent = `${uniqueProvisions.length} provision${uniqueProvisions.length === 1 ? '' : 's'}`;

    if (uniqueProvisions.length === 0) {
      if (tier1Content) tier1Content.innerHTML = '<div class="empty-state">No provisions found for this subject.</div>';
    } else {
      if (tier1Content) tier1Content.innerHTML = uniqueProvisions.map(prov => {
        const elementsHtml = prov.elements.length > 0
          ? `<div class="checklist-container">
              ${prov.elements.map(el => `<div class="checklist-item">${el}</div>`).join('')}
             </div>`
          : '';

        const confusionHtml = prov.confusion
          ? `<div style="margin-top: 8px; font-size: 13px; color: var(--red); font-style: italic;">
              <strong>Common Confusion:</strong> ${prov.confusion}
             </div>`
          : '';

        return `
          <div class="data-item">
            <div class="data-item-title">${prov.title}</div>
            ${elementsHtml}
            ${confusionHtml}
          </div>
        `;
      }).join('');
    }

    // --- Tier 2: Process Case Signatures / Shapes ---
    if (tier2Badge) tier2Badge.textContent = `${flashcards.length} shape${flashcards.length === 1 ? '' : 's'}`;

    if (flashcards.length === 0) {
      if (tier2Content) tier2Content.innerHTML = '<div class="empty-state">No case signatures found for this subject.</div>';
    } else {
      if (tier2Content) tier2Content.innerHTML = flashcards.map(card => {
        const triggersHtml = (card.front_triggers || [])
          .map(t => `<span class="badge badge-green">${t}</span>`)
          .join('');

        return `
          <div class="data-item">
            <div class="data-item-title">${card.front_shape}</div>
            <div class="data-item-meta">
              Source: ${card.source_citation || 'N/A'} &middot; Mapped to: ${card.back_provision || 'N/A'}
            </div>
            ${triggersHtml ? `<div style="margin-top: 6px;">${triggersHtml}</div>` : ''}
          </div>
        `;
      }).join('');
    }

    // --- Tier 3: Process Trigger Words ---
    if (tier3Badge) tier3Badge.textContent = `${triggers.length} trigger${triggers.length === 1 ? '' : 's'}`;

    if (triggers.length === 0) {
      if (tier3Content) tier3Content.innerHTML = '<div class="empty-state">No trigger words found for this subject.</div>';
    } else {
      if (tier3Content) tier3Content.innerHTML = triggers.map(t => {
        const ambiguousBadge = t.is_ambiguous
          ? `<span class="badge badge-blue" style="margin-top:0;">Ambiguous</span>`
          : '';

        const distFactHtml = t.distinguishing_fact
          ? `<div style="margin-top: 6px; font-size: 13px; color: var(--gold-deep);">
              <strong>Distinguishing Fact:</strong> ${t.distinguishing_fact}
             </div>`
          : '';

        return `
          <div class="data-item">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <strong style="font-family: 'IBM Plex Mono', monospace; font-size: 15px; color: var(--gold-deep);">${t.word}</strong>
              ${ambiguousBadge}
            </div>
            <div class="data-item-desc" style="font-size: 13px; color: #4a5049;">
              Signals shape: <em>"${t.shape_text}"</em>
            </div>
            ${distFactHtml}
          </div>
        `;
      }).join('');
    }
  }

  // ==========================================================================
  // Study Deck & Decoy Cards Drill routines
  // ==========================================================================
  let flashcards = [];
  let decoys = [];
  let currentIndex = 0;
  let showDecoy = false;
  let flipped = false;

  // Hint system state
  let currentTriggers = [];
  let hintsRevealed = 0;

  const studyDropdown = document.getElementById('subject-study-dropdown');
  if (studyDropdown) {
    const standardCard = document.getElementById('standard-card');
    const decoyContainer = document.getElementById('decoy-container');
    const toggleBtn = document.getElementById('toggle-decoy-btn');

    // --- Fix: Force initial visibility states ---
    standardCard.style.display = 'flex';
    decoyContainer.style.display = 'none';

    // Populate select
    fetch('/api/subjects')
      .then(res => res.json())
      .then(subjects => {
        studyDropdown.innerHTML = '<option value="">-- Choose subject --</option>';
        subjects.forEach(sub => {
          const opt = document.createElement('option');
          opt.value = sub.id;
          opt.textContent = sub.name;
          studyDropdown.appendChild(opt);
        });
        // Auto-select first subject
        if (subjects.length > 0) {
          studyDropdown.value = subjects[0].id;
          studyDropdown.dispatchEvent(new Event('change'));
        }
      })
      .catch(err => {
        console.error('Error loading subjects:', err);
        studyDropdown.innerHTML = '<option value="">Failed to load subjects</option>';
      });

    studyDropdown.addEventListener('change', (e) => {
      const subjectId = e.target.value;
      if (!subjectId) {
        flashcards = [];
        decoys = [];
        currentIndex = 0;
        flipped = false;
        updateModeIndicator();
        renderCard();
        return;
      }
      fetch(`/api/subjects/${subjectId}/deck`)
        .then(res => res.json())
        .then(data => {
          flashcards = data.flashcards || [];
          decoys = data.decoys || [];
          currentIndex = 0;
          flipped = false;
          updateModeIndicator();
          renderCard();
        })
        .catch(err => {
          console.error('Error loading deck:', err);
        });
    });

    // Card flip on click — also reveals all remaining hints
    standardCard.addEventListener('click', () => {
      if (showDecoy) return;
      const limit = flashcards.length;
      if (limit === 0) return;
      flipped = !flipped;
      document.getElementById('card-back-contents').style.display = flipped ? 'block' : 'none';
      document.querySelector('.card-front').style.display = flipped ? 'none' : 'block';

      // Reveal all remaining triggers when card is flipped
      if (flipped) {
        revealAllTriggers();
      }
    });

    // Toggle decoy drill
    toggleBtn.addEventListener('click', () => {
      showDecoy = !showDecoy;
      standardCard.style.display = showDecoy ? 'none' : 'flex';
      decoyContainer.style.display = showDecoy ? 'grid' : 'none';
      toggleBtn.classList.toggle('btn-toggle-active', showDecoy);
      // Update button text
      toggleBtn.textContent = showDecoy ? '📖 Standard Cards' : '⚔️ Decoy Drill';
      // Update decoy count label
      updateDecoyCountLabel();
      currentIndex = 0;
      updateModeIndicator();
      renderCard();
    });

    // Set initial toggle button text
    toggleBtn.textContent = '⚔️ Decoy Drill';

    document.getElementById('next-card-btn').addEventListener('click', () => {
      const limit = showDecoy ? decoys.length : flashcards.length;
      if (currentIndex < limit - 1) {
        currentIndex++;
        flipped = false;
        renderCard();
      }
    });

    document.getElementById('prev-card-btn').addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        flipped = false;
        renderCard();
      }
    });

    renderCard();
  }

  // ==========================================================================
  // Mode Indicator & Decoy Count Label
  // ==========================================================================
  function updateModeIndicator() {
    const modeIndicator = document.getElementById('mode-indicator');
    const cardCountLabel = document.getElementById('card-count-label');
    if (modeIndicator) {
      modeIndicator.textContent = showDecoy ? '⚔️ Decoy Drill' : '📖 Standard Review';
      modeIndicator.className = showDecoy ? 'mode-pill mode-pill-decoy' : 'mode-pill mode-pill-standard';
    }
    if (cardCountLabel) {
      const limit = showDecoy ? decoys.length : flashcards.length;
      if (limit > 0) {
        cardCountLabel.textContent = `Card ${currentIndex + 1} of ${limit}`;
        cardCountLabel.style.display = 'inline-block';
      } else {
        cardCountLabel.style.display = 'none';
      }
    }
  }

  function updateDecoyCountLabel() {
    const decoyCountLabel = document.getElementById('decoy-count-label');
    if (decoyCountLabel) {
      decoyCountLabel.textContent = `${decoys.length} decoy pair${decoys.length === 1 ? '' : 's'}`;
    }
  }

  // ==========================================================================
  // Hint System
  // ==========================================================================
  function resetHints() {
    currentTriggers = [];
    hintsRevealed = 0;
    const hintBtn = document.getElementById('hint-btn');
    const triggerChips = document.getElementById('trigger-chips');
    if (hintBtn) {
      hintBtn.textContent = 'Show Hint (0/0)';
      hintBtn.disabled = true;
    }
    if (triggerChips) triggerChips.innerHTML = '';
  }

  function initHints(triggers) {
    currentTriggers = triggers || [];
    hintsRevealed = 0;
    const hintBtn = document.getElementById('hint-btn');
    const triggerChips = document.getElementById('trigger-chips');
    if (hintBtn) {
      if (currentTriggers.length === 0) {
        hintBtn.textContent = 'No hints available';
        hintBtn.disabled = true;
      } else {
        hintBtn.textContent = `Show Hint (0/${currentTriggers.length})`;
        hintBtn.disabled = false;
      }
    }
    if (triggerChips) triggerChips.innerHTML = '';
  }

  function revealNextHint() {
    if (hintsRevealed >= currentTriggers.length) return;
    const triggerChips = document.getElementById('trigger-chips');
    const hintBtn = document.getElementById('hint-btn');
    if (!triggerChips || !hintBtn) return;

    const chip = document.createElement('span');
    chip.className = 'trigger-chip';
    chip.textContent = currentTriggers[hintsRevealed];
    triggerChips.appendChild(chip);
    hintsRevealed++;

    if (hintsRevealed >= currentTriggers.length) {
      hintBtn.textContent = 'All hints revealed';
      hintBtn.disabled = true;
    } else {
      hintBtn.textContent = `Show Hint (${hintsRevealed}/${currentTriggers.length})`;
    }
  }

  function revealAllTriggers() {
    if (!currentTriggers || currentTriggers.length === 0) return;
    const triggerChips = document.getElementById('trigger-chips');
    const hintBtn = document.getElementById('hint-btn');
    if (!triggerChips || !hintBtn) return;

    // Reveal only the ones not yet shown
    while (hintsRevealed < currentTriggers.length) {
      const chip = document.createElement('span');
      chip.className = 'trigger-chip';
      chip.textContent = currentTriggers[hintsRevealed];
      triggerChips.appendChild(chip);
      hintsRevealed++;
    }
    hintBtn.textContent = 'All hints revealed';
    hintBtn.disabled = true;
  }

  // Wire up hint button (it persists in DOM, we delegate)
  const hintBtnEl = document.getElementById('hint-btn');
  if (hintBtnEl) {
    hintBtnEl.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't flip the card
      revealNextHint();
    });
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // renderCard
  // ==========================================================================
  function renderCard() {
    flipped = false;

    const standardCard = document.getElementById('standard-card');
    const decoyContainer = document.getElementById('decoy-container');
    const nextBtn = document.getElementById('next-card-btn');
    const prevBtn = document.getElementById('prev-card-btn');
    const progressInd = document.getElementById('card-progress-indicator');

    if (!standardCard) return; // Not on deck page

    // Hide standard contents by default
    const cardBackEl = document.getElementById('card-back-contents');
    if (cardBackEl) cardBackEl.style.display = 'none';
    const cardFront = document.querySelector('.card-front');
    if (cardFront) cardFront.style.display = 'block';

    // Hide flip hint by default
    const flipHint = document.getElementById('card-flip-hint');
    if (flipHint) flipHint.style.display = 'none';

    // Reset hints for new card
    resetHints();

    const limit = showDecoy ? decoys.length : flashcards.length;

    if (limit === 0) {
      if (progressInd) progressInd.textContent = '';
      if (nextBtn) nextBtn.disabled = true;
      if (prevBtn) prevBtn.disabled = true;

      if (!studyDropdown.value) {
        if (showDecoy) {
          decoyContainer.innerHTML = `
            <div class="empty-deck-state">
              Select a subject to begin reviewing decoy drills.
            </div>`;
        } else {
          const shapeEl = document.getElementById('card-shape-text');
          if (shapeEl) shapeEl.textContent = 'Select a subject to begin reviewing shapes.';
          const hintArea = document.getElementById('trigger-hint-area');
          if (hintArea) hintArea.style.display = 'none';
        }
      } else {
        if (showDecoy) {
          decoyContainer.innerHTML = `
            <div class="empty-deck-state">
              No decoy pairs available for this subject.
            </div>`;
        } else {
          const shapeEl = document.getElementById('card-shape-text');
          if (shapeEl) shapeEl.textContent = 'No flashcards available for this subject.';
          const hintArea = document.getElementById('trigger-hint-area');
          if (hintArea) hintArea.style.display = 'none';
        }
      }
      updateModeIndicator();
      return;
    }

    if (progressInd) {
      progressInd.textContent = `${currentIndex + 1} of ${limit}`;
    }
    if (nextBtn) {
      nextBtn.disabled = (currentIndex >= limit - 1);
    }
    if (prevBtn) {
      prevBtn.disabled = (currentIndex <= 0);
    }

    if (showDecoy) {
      const currentDecoy = decoys[currentIndex];
      if (!currentDecoy) return;

      decoyContainer.innerHTML = `
        <div class="decoy-subcard">
          <h3>Shape A</h3>
          <p id="decoy-shape-a">${escapeHtml(currentDecoy.shape_a)}</p>
          <div>
            <strong id="decoy-provision-a">${escapeHtml(currentDecoy.provision_a)}</strong>
          </div>
        </div>
        <div class="decoy-subcard">
          <h3>Shape B</h3>
          <p id="decoy-shape-b">${escapeHtml(currentDecoy.shape_b)}</p>
          <div>
            <strong id="decoy-provision-b">${escapeHtml(currentDecoy.provision_b)}</strong>
          </div>
        </div>
        <div class="highlight-diff">
          <h4>Distinguishing Fact:</h4>
          <p id="decoy-diff-text">${escapeHtml(currentDecoy.distinguishing_fact)}</p>
        </div>
      `;
    } else {
      const currentFC = flashcards[currentIndex];
      if (!currentFC) return;

      const shapeEl = document.getElementById('card-shape-text');
      if (shapeEl) shapeEl.textContent = currentFC.front_shape;

      // Show hint area and initialize hints
      const hintArea = document.getElementById('trigger-hint-area');
      if (hintArea) hintArea.style.display = 'block';
      initHints(currentFC.front_triggers || []);

      // Back of card
      const provisionEl = document.getElementById('card-back-provision');
      if (provisionEl) provisionEl.textContent = currentFC.back_provision;

      const elementsHTML = currentFC.back_elements && currentFC.back_elements.length > 0
        ? currentFC.back_elements.map((el, i) => `<div>${i + 1}. ${el}</div>`).join('')
        : '<div>No elements checklist defined.</div>';
      const elementsEl = document.getElementById('card-back-elements');
      if (elementsEl) elementsEl.innerHTML = elementsHTML;

      const confusionText = currentFC.back_confusion
        ? `Common confusion: ${currentFC.back_confusion}`
        : 'No common confusion listed.';
      const confusionEl = document.getElementById('card-back-confusion');
      if (confusionEl) confusionEl.textContent = confusionText;

      if (flipHint) flipHint.style.display = 'block';
    }

    updateModeIndicator();
    updateDecoyCountLabel();
  }

  // ==========================================================================
  // ALAC Page Logic
  // ==========================================================================
  const alacSubjectDropdown = document.getElementById('alac-subject-dropdown');
  if (alacSubjectDropdown) {
    let alacQuestions = [];
    let alacIndex = 0;

    fetch('/api/subjects')
      .then(res => res.json())
      .then(subjects => {
        alacSubjectDropdown.innerHTML = '<option value="">-- Choose subject --</option>';
        subjects.forEach(sub => {
          const opt = document.createElement('option');
          opt.value = sub.id;
          opt.textContent = sub.name;
          alacSubjectDropdown.appendChild(opt);
        });
        // Auto-select first subject
        if (subjects.length > 0) {
          alacSubjectDropdown.value = subjects[0].id;
          alacSubjectDropdown.dispatchEvent(new Event('change'));
        }
      })
      .catch(err => {
        console.error('Error loading subjects for ALAC:', err);
      });

    alacSubjectDropdown.addEventListener('change', () => {
      const subjectId = alacSubjectDropdown.value;
      if (!subjectId) {
        alacQuestions = [];
        alacIndex = 0;
        renderAlacQuestion();
        return;
      }
      fetch(`/api/subjects/${subjectId}/alac-questions`)
        .then(res => {
          if (!res.ok) {
            return res.json().then(e => { throw new Error(e.error || 'Server error'); });
          }
          return res.json();
        })
        .then(data => {
          alacQuestions = data || [];
          alacIndex = 0;
          renderAlacQuestion();
        })
        .catch(err => {
          console.error('Error loading ALAC questions:', err);
          const factPanel = document.getElementById('alac-fact-display');
          if (factPanel) {
            factPanel.innerHTML = `<span style="color: var(--red);">Error loading questions: ${err.message}</span>`;
          }
        });
    });

    const alacRevealBtn = document.getElementById('alac-reveal-btn');
    const alacNextBtn = document.getElementById('alac-next-btn');
    const alacHintBtn = document.getElementById('alac-hint-btn');
    const alacHintBox = document.getElementById('alac-hint-box');
    const alacAnswerKey = document.getElementById('answer-key-panel');

    if (alacRevealBtn) {
      alacRevealBtn.addEventListener('click', () => {
        if (alacAnswerKey) {
          alacAnswerKey.classList.toggle('revealed');
          alacRevealBtn.textContent = alacAnswerKey.classList.contains('revealed')
            ? '🙈 Hide Answer Key'
            : '🔑 Reveal Answer Key';
        }
      });
    }

    if (alacHintBtn && alacHintBox) {
      alacHintBtn.addEventListener('click', () => {
        if (alacHintBox.style.display === 'none') {
          alacHintBox.style.display = 'block';
          alacHintBtn.textContent = '🙈 Hide Hint';
        } else {
          alacHintBox.style.display = 'none';
          alacHintBtn.textContent = '💡 Get Hint';
        }
      });
    }

    if (alacNextBtn) {
      alacNextBtn.addEventListener('click', () => {
        if (alacQuestions.length === 0) return;
        alacIndex = (alacIndex + 1) % alacQuestions.length;
        renderAlacQuestion();
      });
    }

    function renderAlacQuestion() {
      const factPanel = document.getElementById('alac-fact-display');
      const alacProgressEl = document.getElementById('alac-progress');
      // Clear textareas
      ['alac-answer-text', 'alac-law-text', 'alac-application-text', 'alac-conclusion-text'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      // Hide answer key & hint
      if (alacAnswerKey) alacAnswerKey.classList.remove('revealed');
      if (alacRevealBtn) alacRevealBtn.textContent = '🔑 Reveal Answer Key';
      if (alacHintBox) alacHintBox.style.display = 'none';
      if (alacHintBtn) alacHintBtn.textContent = '💡 Get Hint';

      // Reset evaluation panel
      resetEvalPanel();
      // Reset layout to 2-column
      const alacLayout = document.getElementById('alac-layout');
      if (alacLayout) alacLayout.classList.remove('alac-layout-3col');

      if (alacQuestions.length === 0) {
        if (factPanel) factPanel.textContent = 'Select a subject above to load a question.';
        if (alacProgressEl) alacProgressEl.textContent = '';
        const keyEl = document.getElementById('alac-key-provision');
        const keyElsEl = document.getElementById('alac-key-elements');
        const keyConfEl = document.getElementById('alac-key-confusion');
        if (keyEl) keyEl.textContent = '';
        if (keyElsEl) keyElsEl.innerHTML = '';
        if (keyConfEl) keyConfEl.textContent = '';
        if (alacHintBox) alacHintBox.innerHTML = '';
        if (alacHintBtn) alacHintBtn.style.display = 'none';
        alacCurrentQuestion = null;
        updateEvalButton();
        return;
      }

      const question = alacQuestions[alacIndex];
      alacCurrentQuestion = question;  // Store for evaluation
      if (factPanel) factPanel.textContent = question.question_text;
      if (alacProgressEl) alacProgressEl.textContent = `Question ${alacIndex + 1} of ${alacQuestions.length}`;

      // Populate hint box
      if (alacHintBox && alacHintBtn) {
        if (question.linked_cards && question.linked_cards.length > 0) {
          alacHintBox.innerHTML = question.linked_cards.map((c, i) => `
            <div style="margin-bottom: ${i < question.linked_cards.length - 1 ? '12px' : '0'}; border-bottom: ${i < question.linked_cards.length - 1 ? '1px dashed rgba(212, 175, 55, 0.2)' : 'none'}; padding-bottom: ${i < question.linked_cards.length - 1 ? '8px' : '0'};">
              <strong>Concept ${i + 1}:</strong> ${c.back_provision}<br/>
              <strong>Original Scenario:</strong> ${c.front_shape}<br/>
              <strong>Trigger Words:</strong> ${(c.front_triggers || []).join(', ')}
            </div>
          `).join('');
          alacHintBtn.style.display = 'inline-block';
        } else {
          alacHintBox.innerHTML = 'No hints available.';
          alacHintBtn.style.display = 'none';
        }
      }

      // Populate answer key (hidden until revealed)
      const keyEl = document.getElementById('alac-key-provision');
      const keyElsEl = document.getElementById('alac-key-elements');
      const keyConfEl = document.getElementById('alac-key-confusion');

      if (keyEl) {
        keyEl.innerHTML = (question.linked_cards || []).map(c => `<div>⚖️ ${c.back_provision}</div>`).join('');
      }
      if (keyElsEl) {
        keyElsEl.innerHTML = (question.linked_cards || []).map(c => `
          <div style="margin-bottom: 8px;">
            <strong style="color: var(--gold-deep);">${c.back_provision} Elements:</strong>
            <ol style="margin: 4px 0 0 16px; padding: 0;">
              ${(c.back_elements || []).map(el => `<li>${el}</li>`).join('')}
            </ol>
          </div>
        `).join('');
      }
      if (keyConfEl) {
        const confs = (question.linked_cards || []).filter(c => c.back_confusion).map(c => `
          <div style="margin-bottom: 6px;">
            <strong>${c.back_provision}:</strong> ${c.back_confusion}
          </div>
        `);
        keyConfEl.innerHTML = confs.length > 0 ? confs.join('') : 'None listed.';
      }
      updateEvalButton();
    }

    let alacCurrentQuestion = null;  // Track current question for evaluation
    let alacMode = 'segmented';  // 'segmented' | 'freeform'

    // ==========================================================================
    // Mode Toggle: Segmented ↔ Freeform
    // ==========================================================================
    const alacModeToggle = document.getElementById('alac-mode-toggle');
    const alacSegmentedSections = document.getElementById('alac-segmented-sections');
    const alacFreeformSection = document.getElementById('alac-freeform-section');

    if (alacModeToggle) {
      alacModeToggle.addEventListener('click', () => {
        alacMode = alacMode === 'segmented' ? 'freeform' : 'segmented';
        alacModeToggle.setAttribute('data-mode', alacMode);

        if (alacMode === 'freeform') {
          alacSegmentedSections.style.display = 'none';
          alacFreeformSection.style.display = 'block';
        } else {
          alacSegmentedSections.style.display = 'block';
          alacFreeformSection.style.display = 'none';
        }

        updateEvalButton();
      });
    }

    // ==========================================================================
    // ALAC Evaluation Logic
    // ==========================================================================
    const alacEvaluateBtn = document.getElementById('alac-evaluate-btn');
    const alacEvalPanel = document.getElementById('alac-eval-panel');

    function updateEvalButton() {
      if (!alacEvaluateBtn) return;
      let hasContent = false;
      if (alacMode === 'freeform') {
        const freeform = document.getElementById('alac-freeform-text')?.value?.trim() || '';
        hasContent = freeform.length > 0;
      } else {
        const answer = document.getElementById('alac-answer-text')?.value?.trim() || '';
        const law = document.getElementById('alac-law-text')?.value?.trim() || '';
        const app = document.getElementById('alac-application-text')?.value?.trim() || '';
        hasContent = answer.length > 0 || law.length > 0 || app.length > 0;
      }
      alacEvaluateBtn.disabled = !hasContent || !alacCurrentQuestion;
    }

    // Watch textareas for content changes → enable/disable evaluate button
    ['alac-answer-text', 'alac-law-text', 'alac-application-text', 'alac-conclusion-text', 'alac-freeform-text'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateEvalButton);
    });

    function resetEvalPanel() {
      if (!alacEvalPanel) return;
      alacEvalPanel.classList.remove('active');
      alacEvalPanel.innerHTML = `
        <div class="eval-placeholder" id="eval-placeholder">
          <div class="eval-placeholder-icon">🧠</div>
          <div>Write your ALAC answer in the middle panel,<br>then click <strong>Evaluate My Answer</strong>.</div>
          <div style="font-size: 12px; opacity: 0.6; margin-top: 4px;">AI evaluation compares your answer against<br>the model answer key below.</div>
        </div>`;
    }

    function showEvalLoading() {
      if (!alacEvalPanel) return;
      alacEvalPanel.classList.add('active');
      alacEvalPanel.innerHTML = `
        <div class="eval-loading">
          <div class="eval-spinner"></div>
          <div class="eval-loading-text">Evaluating your answer...</div>
          <div style="font-size: 12px; color: #7a7e74;">This usually takes 5–10 seconds</div>
        </div>`;
      // Switch to 3-column layout
      const alacLayout = document.getElementById('alac-layout');
      if (alacLayout) alacLayout.classList.add('alac-layout-3col');
    }

    function showEvalError(message, retryable) {
      if (!alacEvalPanel) return;
      alacEvalPanel.classList.add('active');
      alacEvalPanel.innerHTML = `
        <div class="eval-error-state" style="text-align: center; padding: 24px 16px;">
          <div class="eval-placeholder-icon" style="margin-bottom: 8px;">⚠️</div>
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--red);">${escapeHtmlEval(message)}</div>
          <div style="display: flex; flex-direction: column; gap: 10px; align-items: center; width: 100%;">
            ${retryable ? '<button class="eval-retry-btn" style="width: 100%; max-width: 240px;" onclick="document.getElementById(\'alac-evaluate-btn\').click()">Try Again</button>' : ''}
            <button class="btn-premium" style="width: 100%; max-width: 240px; justify-content: center;" onclick="window.copyAlacPromptToClipboard()">📋 Copy Prompt & Answer</button>
          </div>
          <div style="font-size: 12px; opacity: 0.7; margin-top: 16px; line-height: 1.5;">
            LiteLLM rate-limited or offline? Copy the formatted prompt and paste it directly into <strong>Claude or ChatGPT</strong> for instant evaluation!
          </div>
        </div>`;
    }

    // Exported globally so onclick handlers can reach it
    window.copyAlacPromptToClipboard = function () {
      if (!alacCurrentQuestion) {
        alert('Please choose a subject and load a fact pattern first.');
        return;
      }

      const factPattern = alacCurrentQuestion.question_text || '';
      const provision = alacCurrentQuestion.linked_cards.map(c => c.back_provision).join(' & ') || 'None';
      const elements = alacCurrentQuestion.linked_cards.flatMap(c => c.back_elements || []).map((el, i) => `${i + 1}. ${el}`).join('\n');
      const confusion = alacCurrentQuestion.linked_cards.filter(c => c.back_confusion).map(c => `${c.back_provision}: ${c.back_confusion}`).join('\n') || 'None';

      let studentAnswer = '';
      if (alacMode === 'freeform') {
        studentAnswer = document.getElementById('alac-freeform-text')?.value?.trim() || '';
      } else {
        const answer = document.getElementById('alac-answer-text')?.value?.trim() || '';
        const law = document.getElementById('alac-law-text')?.value?.trim() || '';
        const application = document.getElementById('alac-application-text')?.value?.trim() || '';
        const conclusion = document.getElementById('alac-conclusion-text')?.value?.trim() || '';

        studentAnswer = `[ANSWER / CONCLUSION POINT]
${answer}

[APPLICABLE LAW]
${law}

[APPLICATION OF LAW TO FACTS]
${application}

[CONCLUSION]
${conclusion}`;
      }

      if (!studentAnswer) {
        alert('Please write your answer in the text boxes before copying.');
        return;
      }

      const promptText = `Please act as an official Bar Examiner and evaluate my Philippine Bar Exam essay answer. I have formatted my response according to the ALAC (Answer, Law, Application, Conclusion) framework.

--- CONTEXT & REFERENCE ANSWER KEY ---
FACT PATTERN:
${factPattern}

CORRECT LEGAL PROVISION:
${provision}

REQUIRED ELEMENTS CHECKSLIST:
${elements}

COMMON CONFUSION / MISTAKE TO DETECT:
${confusion}

--- STUDENT'S WRITTEN ANSWER ---
${studentAnswer}

--- EVALUATION CRITERIA ---
Please score my answer strictly out of 10 points based on this rubric:
1. ANSWER (direct / categorical response): 1 point
2. LAW (citation and inclusion of necessary elements): 3 points
3. APPLICATION (applying legal elements to the specific facts): 4 points
4. CONCLUSION (logical conclusion based on application): 1 point
5. CLARITY & PROFESSIONAL LEGAL STYLE: 1 point

--- RESPONSE FORMAT ---
Please format your response clearly:
1. Overall Grade: (PASS / FAIL / NEEDS WORK) and score (X/10)
2. Breakdown: Provide a short paragraph of feedback for each of the ALAC sections (A, L, A, C) detailing what was correct, missing, or needs improvement.
3. Common Confusion Trap: Mention whether I fell into the specified confusion trap.`;

      navigator.clipboard.writeText(promptText)
        .then(() => {
          alert('Copied to clipboard! You can now paste this directly into Claude, ChatGPT, or Gemini.');
        })
        .catch(err => {
          console.error('Clipboard copy failed: ', err);
          alert('Could not copy automatically. Please select and copy your text manually.');
        });
    };


    function renderEvalResult(data) {
      if (!alacEvalPanel) return;
      alacEvalPanel.classList.add('active');

      const scores = data.scores || {};
      const feedback = data.feedback || {};
      const criticalErrors = data.critical_errors || [];
      const confusionTrap = data.confusion_trap || {};
      const modelAnswer = data.model_answer || {};
      const grade = data.grade || 'NEEDS WORK';
      const meta = data.meta || {};

      // Score dot helpers
      const maxScores = { answer: 1, law: 3, application: 4, conclusion: 1, clarity: 1 };
      function scoreDots(label, score, max) {
        let dots = '';
        for (let i = 0; i < max; i++) {
          dots += `<div class="eval-score-dot${i < score ? ' filled' : ''}"></div>`;
        }
        return `
          <div class="eval-score-row">
            <span class="eval-score-label">${label}</span>
            <div class="eval-score-dots">${dots}</div>
            <span class="eval-score-value">${score}/${max}</span>
          </div>`;
      }

      const gradeClass = grade === 'PASS' ? 'pass' : grade === 'FAIL' ? 'fail' : 'needs-work';

      // Build feedback accordion items
      const feedbackSections = [
        { key: 'answer', label: 'Answer (A)', score: scores.answer, max: 1 },
        { key: 'law', label: 'Law (L)', score: scores.law, max: 3 },
        { key: 'application', label: 'Application (App)', score: scores.application, max: 4 },
        { key: 'conclusion', label: 'Conclusion (C)', score: scores.conclusion, max: 1 },
        { key: 'overall', label: 'Overall Assessment', score: null, max: null },
      ];

      let feedbackHtml = '<div class="eval-feedback-list">';
      feedbackSections.forEach((sec, idx) => {
        const text = feedback[sec.key] || '';
        if (!text) return;
        const isOpen = idx === 0; // First one open by default
        feedbackHtml += `
          <div class="eval-feedback-item${isOpen ? ' open' : ''}" onclick="this.classList.toggle('open')">
            <div class="eval-feedback-header">
              <span>${sec.label}</span>
              <span style="display:flex;align-items:center;gap:8px;">
                ${sec.score !== null ? `<span class="eval-feedback-score">${sec.score}/${sec.max}</span>` : ''}
                <span class="eval-feedback-arrow">▶</span>
              </span>
            </div>
            <div class="eval-feedback-body">${escapeHtmlEval(text)}</div>
          </div>`;
      });
      feedbackHtml += '</div>';

      // Critical errors
      let criticalHtml = '';
      if (criticalErrors.length > 0) {
        criticalHtml = `
          <div class="eval-critical-errors">
            <h4>⚠️ Critical Issues</h4>
            <ul>${criticalErrors.map(e => `<li>${escapeHtmlEval(e)}</li>`).join('')}</ul>
          </div>`;
      }

      // Confusion trap
      let confusionHtml = '';
      if (confusionTrap.triggered) {
        confusionHtml = `
          <div class="eval-confusion-trap">
            <h4>⚠️ Common Confusion Detected</h4>
            <p>${escapeHtmlEval(confusionTrap.explanation || '')}</p>
          </div>`;
      }

      // Model answer
      let modelHtml = `
        <div class="eval-model-answer" onclick="this.classList.toggle('open')">
          <div class="eval-model-answer-header">
            <span>📝 Model Answer</span>
            <span class="eval-feedback-arrow" style="font-size:10px;color:var(--green-deep);">▶</span>
          </div>
          <div class="eval-model-answer-body">
            <div class="eval-model-answer-body-inner">
              <div class="eval-model-section"><strong>A — Answer</strong><p>${escapeHtmlEval(modelAnswer.answer || '')}</p></div>
              <div class="eval-model-section"><strong>L — Law</strong><p>${escapeHtmlEval(modelAnswer.law || '')}</p></div>
              <div class="eval-model-section"><strong>A — Application</strong><p>${escapeHtmlEval(modelAnswer.application || '')}</p></div>
              <div class="eval-model-section"><strong>C — Conclusion</strong><p>${escapeHtmlEval(modelAnswer.conclusion || '')}</p></div>
            </div>
          </div>
        </div>`;

      // Meta line
      let metaHtml = '';
      if (meta.model && meta.model !== 'mock') {
        metaHtml = `<div style="font-size:11px;color:#7a7e74;text-align:center;margin-top:4px;">Evaluated by ${meta.model} · ${meta.tokens_used || 0} tokens · ${meta.latency_ms ? (meta.latency_ms / 1000).toFixed(1) + 's' : ''}</div>`;
      } else if (meta.mock) {
        metaHtml = `<div style="font-size:11px;color:#7a7e74;text-align:center;margin-top:4px;">⚡ Mock evaluation mode (AI gateway not configured)</div>`;
      }

      alacEvalPanel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h3>📊 Evaluation</h3>
          <span class="eval-grade-badge ${gradeClass}">${grade}</span>
        </div>
        <div class="eval-score-summary">
          <h4>Score Breakdown</h4>
          ${scoreDots('Answer', scores.answer || 0, 1)}
          ${scoreDots('Law', scores.law || 0, 3)}
          ${scoreDots('Application', scores.application || 0, 4)}
          ${scoreDots('Conclusion', scores.conclusion || 0, 1)}
          ${scoreDots('Clarity', scores.clarity || 0, 1)}
          <div class="eval-score-total">
            <span style="font-weight:700;">Total</span>
            <span class="eval-score-value">${scores.total || 0}/10</span>
          </div>
        </div>
        ${criticalHtml}
        ${confusionHtml}
        ${feedbackHtml}
        ${modelHtml}
        ${metaHtml}
      `;

      // Switch to 3-column layout
      const alacLayout = document.getElementById('alac-layout');
      if (alacLayout) alacLayout.classList.add('alac-layout-3col');
    }

    function escapeHtmlEval(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    if (alacEvaluateBtn) {
      alacEvaluateBtn.addEventListener('click', async () => {
        if (!alacCurrentQuestion) return;

        const factPattern = alacCurrentQuestion.question_text || '';
        const provision = alacCurrentQuestion.linked_cards.map(c => c.back_provision).join(' & ') || 'None';
        const elements = alacCurrentQuestion.linked_cards.flatMap(c => c.back_elements || []);
        const confusion = alacCurrentQuestion.linked_cards.filter(c => c.back_confusion).map(c => `${c.back_provision}: ${c.back_confusion}`).join('\n') || '';

        // Build request body based on mode
        let body;
        if (alacMode === 'freeform') {
          const freeform = document.getElementById('alac-freeform-text')?.value?.trim() || '';
          body = {
            mode: 'freeform',
            factPattern,
            provision,
            elements,
            confusion,
            freeform,
          };
        } else {
          const answer = document.getElementById('alac-answer-text')?.value?.trim() || '';
          const law = document.getElementById('alac-law-text')?.value?.trim() || '';
          const application = document.getElementById('alac-application-text')?.value?.trim() || '';
          const conclusion = document.getElementById('alac-conclusion-text')?.value?.trim() || '';
          body = {
            mode: 'segmented',
            factPattern,
            provision,
            elements,
            confusion,
            answer,
            law,
            application,
            conclusion,
          };
        }

        // Show loading
        alacEvaluateBtn.disabled = true;
        alacEvaluateBtn.classList.add('loading');
        alacEvaluateBtn.textContent = '⏳ Evaluating...';
        showEvalLoading();

        try {
          const response = await fetch('/api/alac/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || 'Evaluation failed');
          }

          renderEvalResult(data);
        } catch (err) {
          console.error('ALAC evaluation error:', err);
          const isRetryable = err.message && !err.message.includes('not configured');
          showEvalError(
            err.message === 'Failed to fetch'
              ? 'Cannot reach the evaluation service. The server may be offline.'
              : (err.message || 'Evaluation failed'),
            isRetryable
          );
        } finally {
          alacEvaluateBtn.disabled = false;
          alacEvaluateBtn.classList.remove('loading');
          alacEvaluateBtn.textContent = '🔄 Re-evaluate';
        }
      });
    }

    renderAlacQuestion();
  }
});

// ==========================================================================
// Global: Mark current page's nav link as active
// ==========================================================================
(function () {
  const currentFile = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentFile || (currentFile === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
})();

