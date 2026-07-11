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
      })
      .catch(err => {
        console.error('Error loading subject details:', err);
        showErrorState();
      });
    });
  }

  function resetDashboard() {
    tier1Badge.textContent = '0 provisions';
    tier2Badge.textContent = '0 shapes';
    tier3Badge.textContent = '0 triggers';

    tier1Content.innerHTML = '<div class="empty-state">Select a subject to view mapped provisions.</div>';
    tier2Content.innerHTML = '<div class="empty-state">Select a subject to view case signatures.</div>';
    tier3Content.innerHTML = '<div class="empty-state">Select a subject to view trigger words.</div>';
    
    funnelTiers.forEach(t => t.classList.remove('open'));
  }

  function showErrorState() {
    tier1Content.innerHTML = '<div class="empty-state" style="color: var(--red);">Error loading provisions.</div>';
    tier2Content.innerHTML = '<div class="empty-state" style="color: var(--red);">Error loading case signatures.</div>';
    tier3Content.innerHTML = '<div class="empty-state" style="color: var(--red);">Error loading trigger words.</div>';
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
    tier1Badge.textContent = `${uniqueProvisions.length} provision${uniqueProvisions.length === 1 ? '' : 's'}`;

    if (uniqueProvisions.length === 0) {
      tier1Content.innerHTML = '<div class="empty-state">No provisions found for this subject.</div>';
    } else {
      tier1Content.innerHTML = uniqueProvisions.map(prov => {
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
    tier2Badge.textContent = `${flashcards.length} shape${flashcards.length === 1 ? '' : 's'}`;

    if (flashcards.length === 0) {
      tier2Content.innerHTML = '<div class="empty-state">No case signatures found for this subject.</div>';
    } else {
      tier2Content.innerHTML = flashcards.map(card => {
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
    tier3Badge.textContent = `${triggers.length} trigger${triggers.length === 1 ? '' : 's'}`;

    if (triggers.length === 0) {
      tier3Content.innerHTML = '<div class="empty-state">No trigger words found for this subject.</div>';
    } else {
      tier3Content.innerHTML = triggers.map(t => {
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

  // --- Study Deck & Decoy Cards Drill routines (Task 6) ---
  let flashcards = [];
  let decoys = [];
  let currentIndex = 0;
  let showDecoy = false;
  let flipped = false;

  const studyDropdown = document.getElementById('subject-study-dropdown');
  if (studyDropdown) {
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
          renderCard();
        })
        .catch(err => {
          console.error('Error loading deck:', err);
        });
    });

    const standardCard = document.getElementById('standard-card');
    const decoyContainer = document.getElementById('decoy-container');

    standardCard.addEventListener('click', () => {
      if (showDecoy) return;
      const limit = showDecoy ? decoys.length : flashcards.length;
      if (limit === 0) return;
      flipped = !flipped;
      document.getElementById('card-back-contents').style.display = flipped ? 'block' : 'none';
      document.querySelector('.card-front').style.display = flipped ? 'none' : 'block';
    });

    const toggleBtn = document.getElementById('toggle-decoy-btn');
    toggleBtn.addEventListener('click', () => {
      showDecoy = !showDecoy;
      standardCard.style.display = showDecoy ? 'none' : 'flex';
      decoyContainer.style.display = showDecoy ? 'grid' : 'none';
      toggleBtn.classList.toggle('btn-toggle-active', showDecoy);
      currentIndex = 0;
      renderCard();
    });

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

    // Initialize layout visibility
    standardCard.style.display = showDecoy ? 'none' : 'flex';
    decoyContainer.style.display = showDecoy ? 'grid' : 'none';
    renderCard();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderCard() {
    flipped = false;
    
    const standardCard = document.getElementById('standard-card');
    const decoyContainer = document.getElementById('decoy-container');
    const nextBtn = document.getElementById('next-card-btn');
    const prevBtn = document.getElementById('prev-card-btn');
    const progressInd = document.getElementById('card-progress-indicator');
    
    // Hide standard contents by default
    document.getElementById('card-back-contents').style.display = 'none';
    const cardFront = document.querySelector('.card-front');
    cardFront.style.display = 'block';
    
    // Hide flip hint by default
    const flipHint = document.getElementById('card-flip-hint');
    if (flipHint) flipHint.style.display = 'none';

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
          document.getElementById('card-shape-text').textContent = 'Select a subject to begin reviewing shapes.';
          document.getElementById('card-trigger-list').style.display = 'none';
        }
      } else {
        if (showDecoy) {
          decoyContainer.innerHTML = `
            <div class="empty-deck-state">
              No decoy pairs available for this subject.
            </div>`;
        } else {
          document.getElementById('card-shape-text').textContent = 'No flashcards available for this subject.';
          document.getElementById('card-trigger-list').style.display = 'none';
        }
      }
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
      document.getElementById('card-shape-text').textContent = currentFC.front_shape;
      
      const triggersText = currentFC.front_triggers && currentFC.front_triggers.length > 0
        ? `Triggers: ${currentFC.front_triggers.join(', ')}`
        : 'No trigger words';
      const triggerList = document.getElementById('card-trigger-list');
      triggerList.textContent = triggersText;
      triggerList.style.display = 'inline-block';
      
      document.getElementById('card-back-provision').textContent = currentFC.back_provision;
      
      const elementsHTML = currentFC.back_elements && currentFC.back_elements.length > 0
        ? currentFC.back_elements.map((el, i) => `<div>${i+1}. ${el}</div>`).join('')
        : '<div>No elements checklist defined.</div>';
      document.getElementById('card-back-elements').innerHTML = elementsHTML;
      
      const confusionText = currentFC.back_confusion
        ? `Common confusion: ${currentFC.back_confusion}`
        : 'No common confusion listed.';
      document.getElementById('card-back-confusion').textContent = confusionText;
      
      if (flipHint) flipHint.style.display = 'block';
    }
  }
});
