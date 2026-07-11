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
    let alacFlashcards = [];
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
      })
      .catch(err => {
        console.error('Error loading subjects for ALAC:', err);
      });

    alacSubjectDropdown.addEventListener('change', () => {
      const subjectId = alacSubjectDropdown.value;
      if (!subjectId) {
        alacFlashcards = [];
        alacIndex = 0;
        renderAlacCard();
        return;
      }
      fetch(`/api/subjects/${subjectId}/deck`)
        .then(res => res.json())
        .then(data => {
          alacFlashcards = data.flashcards || [];
          alacIndex = 0;
          renderAlacCard();
        })
        .catch(err => console.error('Error loading ALAC deck:', err));
    });

    const alacRevealBtn = document.getElementById('alac-reveal-btn');
    const alacNextBtn = document.getElementById('alac-next-btn');
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

    if (alacNextBtn) {
      alacNextBtn.addEventListener('click', () => {
        if (alacFlashcards.length === 0) return;
        alacIndex = (alacIndex + 1) % alacFlashcards.length;
        renderAlacCard();
      });
    }

    function renderAlacCard() {
      const factPanel = document.getElementById('alac-fact-display');
      const alacProgressEl = document.getElementById('alac-progress');
      // Clear textareas
      ['alac-answer-text', 'alac-law-text', 'alac-application-text', 'alac-conclusion-text'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      // Hide answer key
      if (alacAnswerKey) alacAnswerKey.classList.remove('revealed');
      if (alacRevealBtn) alacRevealBtn.textContent = '🔑 Reveal Answer Key';

      if (alacFlashcards.length === 0) {
        if (factPanel) factPanel.textContent = 'Select a subject above to load a question.';
        if (alacProgressEl) alacProgressEl.textContent = '';
        const keyEl = document.getElementById('alac-key-provision');
        const keyElsEl = document.getElementById('alac-key-elements');
        const keyConfEl = document.getElementById('alac-key-confusion');
        if (keyEl) keyEl.textContent = '';
        if (keyElsEl) keyElsEl.innerHTML = '';
        if (keyConfEl) keyConfEl.textContent = '';
        return;
      }

      const card = alacFlashcards[alacIndex];
      if (factPanel) factPanel.textContent = card.front_shape;
      if (alacProgressEl) alacProgressEl.textContent = `Question ${alacIndex + 1} of ${alacFlashcards.length}`;

      // Populate answer key (hidden until revealed)
      const keyEl = document.getElementById('alac-key-provision');
      const keyElsEl = document.getElementById('alac-key-elements');
      const keyConfEl = document.getElementById('alac-key-confusion');

      if (keyEl) keyEl.textContent = card.back_provision || '';
      if (keyElsEl) {
        keyElsEl.innerHTML = (card.back_elements || []).map((el, i) => `<li>${el}</li>`).join('');
      }
      if (keyConfEl) {
        keyConfEl.textContent = card.back_confusion
          ? `Common Confusion: ${card.back_confusion}`
          : '';
      }
    }

    renderAlacCard();
  }
});
