/**
 * Petits comportements de l'admin : confirmations, bouton copier, réordonnancement des blocs par glisser-déposer.
 */
(function () {
  'use strict';

  /* Confirmation sur les formulaires et boutons sensibles */
  document.addEventListener('submit', (ev) => {
    const form = ev.target;
    const submitter = ev.submitter;
    const msg = (submitter && submitter.dataset.confirm) || form.dataset.confirm;
    if (msg && !window.confirm(msg)) ev.preventDefault();
  });

  /* Copier dans le presse-papier */
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-copy]');
    if (!btn) return;
    const input = document.querySelector(btn.dataset.copy);
    if (!input) return;
    const text = input.value;
    const done = () => {
      if (btn.dataset.copied) return;
      const old = btn.innerHTML;
      btn.dataset.copied = '1';
      btn.textContent = btn.classList.contains('btn-icon') ? '✓' : 'Copié ✓';
      setTimeout(() => { btn.innerHTML = old; delete btn.dataset.copied; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => { input.select(); document.execCommand('copy'); done(); });
    else { input.select(); document.execCommand('copy'); done(); }
  });

  /* Glisser-déposer des blocs de questions */
  const list = document.getElementById('blocks');
  if (list) {
    let dragged = null;
    list.addEventListener('dragstart', (ev) => {
      const card = ev.target.closest('.block-card');
      if (!card) return;
      dragged = card;
      card.classList.add('dragging');
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', card.dataset.id); } catch (e) { /* ignore */ }
    });
    list.addEventListener('dragover', (ev) => {
      if (!dragged) return;
      ev.preventDefault();
      const card = ev.target.closest('.block-card');
      if (!card || card === dragged) return;
      const rect = card.getBoundingClientRect();
      const after = ev.clientY > rect.top + rect.height / 2;
      list.insertBefore(dragged, after ? card.nextSibling : card);
    });
    list.addEventListener('dragend', () => {
      if (!dragged) return;
      dragged.classList.remove('dragging');
      dragged = null;
      const ids = [...list.querySelectorAll('.block-card')].map((c) => Number(c.dataset.id));
      list.querySelectorAll('.block-card .num').forEach((n, i) => { n.textContent = i + 1; });
      fetch(list.dataset.reorderUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ids }) })
        .catch(() => alert('Le nouvel ordre n\'a pas pu être enregistré.'));
    });
    /* Empêche le drag depuis les champs texte */
    list.querySelectorAll('input, textarea, select').forEach((el) => el.addEventListener('mousedown', () => { list.querySelectorAll('.block-card').forEach((c) => { c.draggable = false; }); }));
    list.querySelectorAll('.drag-handle').forEach((h) => h.addEventListener('mousedown', () => { list.querySelectorAll('.block-card').forEach((c) => { c.draggable = true; }); }));
  }
}());
