document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.getElementById('subject-dropdown');
  const tier1Badge = document.getElementById('tier-1-badge');
  const tier2Badge = document.getElementById('tier-2-badge');
  const tier3Badge = document.getElementById('tier-3-badge');
  const tier1Content = document.getElementById('tier-1-content');
  const tier2Content = document.getElementById('tier-2-content');
  const tier3Content = document.getElementById('tier-3-content');
  const funnelTiers = document.querySelectorAll('.funnel-tier');

  if (!dropdown) return;

  // Initialize tier expand/collapse toggles
  funnelTiers.forEach(tier => {
    tier.addEventListener('click', (e) => {
      // Don't close/toggle when clicking inside the expanded body text or dropdowns
      if (e.target.closest('.tier-body')) {
        return;
      }
      
      // Toggle class
      const isOpen = tier.classList.contains('open');
      
      // Option: Close other tiers on open (accordion style)
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

    // Load data from endpoints
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
});
