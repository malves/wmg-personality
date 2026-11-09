/**
 * Mise en scène de la page résultat : scores qui montent, blocs qui apparaissent au défilement.
 * La page reste complète sans ce script : il ne fait qu'ajouter du mouvement.
 */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.querySelectorAll('[data-count]').forEach((el, i) => {
    const target = Number(el.dataset.count);
    const delay = 260 + i * 80;
    const duration = 800;
    el.textContent = '0';
    let start = null;
    function tick(now) {
      if (start === null) start = now + delay;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      el.textContent = String(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  if (!('IntersectionObserver' in window)) return;
  const items = document.querySelectorAll('.rv');
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove('rv-wait');
      seen.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach((el) => { el.classList.add('rv-wait'); seen.observe(el); });
}());
