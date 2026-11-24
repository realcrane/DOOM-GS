document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');

  const applyTheme = (theme, persist) => {
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    if (toggle) toggle.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    if (persist) { try { localStorage.setItem('theme', theme); } catch (e) {} }
  };

  let currentTheme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(currentTheme, false);

  if (toggle) {
    toggle.addEventListener('click', () => {
      currentTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(currentTheme, true);
    });
  }

  document.querySelectorAll('.ab-slider').forEach((slider) => {
    const top = slider.querySelector('.ab-top');
    const handle = slider.querySelector('.ab-handle');
    const inner = slider.querySelector('.ab-top .ab-inner');
    let pos = 0.5;

    const setPos = (ratio) => {
      pos = Math.max(0, Math.min(1, ratio));
      const pct = (pos * 100).toFixed(2) + '%';
      top.style.width = pct;
      handle.style.left = pct;
      if (inner) inner.style.width = slider.clientWidth + 'px';
    };

    const ratioFromEvent = (e) => {
      const rect = slider.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      return x / rect.width;
    };

    let dragging = false;
    const start = (e) => { dragging = true; setPos(ratioFromEvent(e)); e.preventDefault(); };
    const move = (e) => { if (dragging) setPos(ratioFromEvent(e)); };
    const end = () => { dragging = false; };

    slider.addEventListener('pointerdown', start);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    slider.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);

    const remeasure = () => setPos(pos);
    window.addEventListener('resize', remeasure);
    if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(slider);

    setPos(0.5);
  });

  document.querySelectorAll('video.loop-video').forEach((v) => {
    let visible = false;
    let userPaused = false;
    const apply = () => {
      if (visible && !userPaused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
    };
    v.addEventListener('click', () => { userPaused = !userPaused; apply(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => es.forEach((e) => { visible = e.isIntersecting; apply(); }), { threshold: 0.2 }).observe(v);
    } else {
      visible = true;
      apply();
    }
  });
});
