const VIDEO_ROOT = 'https://doomgs.cdn.yilmazdoga.net/videos';
const VIDEO_FILE = 'grid_all_cams.mp4';
const FPS = 30;
const SEQ_FRAMES = 120;
const GROUP_S = 4;
const OURS_LABEL = '<b class="ours">DOOM-GS (Ours)</b>';

const SCENES = { corner: 'Corner', block: 'Block' };

const PARTS = {
  native: {
    dir: '1_comparison_dynamic_tidegs',
    ours: { id: 'doom_gs' },
    scenes: ['corner', 'block'],
    defaultScene: 'corner',
    defaultOther: 'dynamic_tidegs',
    others: [
      { id: 'dynamic_tidegs', label: 'Dynamic TideGS' },
      { id: 'ground_truth', label: 'Ground Truth', gt: true },
    ],
    othersLabel: 'Baseline (right)',
  },
  perframe: {
    dir: '2_comparison_per_frame',
    ours: { id: 'doom_gs_one_model' },
    scenes: ['corner', 'block'],
    defaultScene: 'corner',
    defaultOther: 'tidegs_per_frame',
    others: [
      { id: 'tidegs_per_frame', label: 'TideGS / frame' },
      { id: 'clm_gs_per_frame', label: 'CLM-GS / frame' },
      { id: 'lod_per_frame', label: 'A LoD of Gaussians / frame' },
      { id: 'ground_truth', label: 'Ground Truth', gt: true },
    ],
    othersLabel: 'Baseline (right)',
  },
  ablation: {
    dir: '3_ablations',
    ours: { id: 'doom_gs_full' },
    scenes: ['corner', 'block'],
    defaultScene: 'corner',
    defaultOther: 'wo_space_time_repacking',
    others: [
      { id: 'wo_space_time_repacking', label: 'w/o space-time repacking' },
      { id: 'wo_camera_scheduling', label: 'w/o camera scheduling' },
      { id: 'wo_locality_relocation', label: 'w/o locality relocation' },
      { id: 'ground_truth', label: 'Ground Truth', gt: true },
    ],
    othersLabel: 'Variant (right)',
  },
  variants: {
    dir: '4_dynamic_representation_variants',
    ours: { id: 'doom_gs_graphixs', label: 'DOOM-GS-GraphiXS' },
    scenes: ['block'],
    defaultScene: 'block',
    defaultOther: 'doom_gs_stg',
    others: [
      { id: 'doom_gs_stg', label: 'DOOM-GS-STG' },
      { id: 'doom_gs_freetimegs', label: 'DOOM-GS-FreeTimeGS' },
      { id: 'ground_truth', label: 'Ground Truth', gt: true },
    ],
    othersLabel: 'Variant (right)',
  },
};

const src = (cfg, scene, method) =>
  VIDEO_ROOT + '/' + [cfg.dir, scene, method, VIDEO_FILE].map(encodeURIComponent).join('/');

const players = [];
let fullpage = null;
let pendingFs = null;
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const inFs = (el) => fsElement() === el || fullpage === el || pendingFs === el;
const anyFs = () => !!(fsElement() || fullpage || pendingFs);
const syncFs = () => players.forEach((p) => p.onFs());
let savedY = null;

function restoreScroll() {
  if (savedY === null) return;
  const y = savedY;
  savedY = null;
  const go = () => window.scrollTo({ top: y, behavior: 'instant' });
  go();
  requestAnimationFrame(go);
  window.addEventListener('resize', go);
  setTimeout(() => window.removeEventListener('resize', go), 1000);
}
function setFullpage(el) {
  fullpage = el;
  document.documentElement.classList.toggle('cmp-fullpage-open', !!el);
  syncFs();
  if (!el) restoreScroll();
}
function toggleFs(el) {
  if (fullpage === el) { setFullpage(null); return; }
  if (fsElement() === el) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    try { const r = exit.call(document); if (r && r.catch) r.catch(() => {}); } catch (e) {}
    return;
  }
  savedY = window.scrollY;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) { setFullpage(el); return; }
  const fallback = () => { if (pendingFs === el) { pendingFs = null; setFullpage(el); } };
  pendingFs = el; syncFs();
  try { const r = req.call(el); if (r && r.catch) r.catch(fallback); } catch (e) { fallback(); }
}
['fullscreenchange', 'webkitfullscreenchange'].forEach((t) =>
  document.addEventListener(t, () => { pendingFs = null; syncFs(); if (!fsElement() && !fullpage) restoreScroll(); }));
['fullscreenerror', 'webkitfullscreenerror'].forEach((t) =>
  document.addEventListener(t, () => { const el = pendingFs; pendingFs = null; if (el) setFullpage(el); }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fullpage) { e.preventDefault(); setFullpage(null); }
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.cmp[data-part]').forEach(initPart);
});

function initPart(root) {
  const cfg = PARTS[root.dataset.part];
  const state = { scene: cfg.defaultScene, other: cfg.defaultOther, playing: true, visible: false, scrubbing: false };
  const $ = (s) => root.querySelector(s);
  const player = $('.cmp-player');
  const vOurs = $('.vid-ours'), vOther = $('.vid-other'), vids = [vOurs, vOther];
  const sceneBtns = $('[data-axis="scene"] .exp-btns'), otherBtns = $('[data-axis="other"] .exp-btns');
  const labOurs = $('.ab-label.left'), labOther = $('.ab-label.right');
  const playBtn = $('.cmp-play'), fsBtn = $('.cmp-fs');
  const seek = $('.cmp-seek'), ticks = $('.cmp-seek-ticks');
  const curEl = $('.cmp-cur'), durEl = $('.cmp-dur'), frameEl = $('.cmp-time');
  $('[data-axis="other"] .exp-group-label').textContent = cfg.othersLabel;

  let target = null;
  const queued = new Map();
  const hold = new Set();
  let playTok = 0, playPending = false, raf = 0;

  function chip(label, active, cls, key, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'exp-chip' + (cls ? ' ' + cls : '') + (active ? ' active' : '');
    b.dataset.key = key;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
  function renderChips() {
    const had = document.activeElement;
    const refocus = had && had.dataset && had.dataset.key && root.contains(had) ? had.dataset.key : null;
    sceneBtns.innerHTML = '';
    cfg.scenes.forEach((id) => sceneBtns.appendChild(chip(SCENES[id], state.scene === id, '', 's:' + id,
      () => { if (state.scene !== id) { state.scene = id; load(); } })));
    otherBtns.innerHTML = '';
    cfg.others.forEach((o) => otherBtns.appendChild(chip(o.label, state.other === o.id, o.gt ? 'gt' : '', 'o:' + o.id,
      () => { if (state.other !== o.id) { state.other = o.id; load(); } })));
    if (refocus) {
      const b = root.querySelector('.exp-chip[data-key="' + refocus + '"]');
      if (b) b.focus({ preventScroll: true });
    }
  }
  const otherOf = () => cfg.others.find((o) => o.id === state.other);

  const okDur = (v) => v.duration > 0 && isFinite(v.duration);
  const dur = () => (okDur(vOurs) ? vOurs.duration : 0);
  const nFrames = () => Math.round(dur() * FPS);
  const frameOf = (t) => Math.floor(t * FPS + 1e-6);
  const frameTime = (f) => (f + 0.5) / FPS;
  const clampT = (v, t) => Math.max(0, okDur(v) ? Math.min(t, v.duration - 0.5 / FPS) : t);
  const fmt = (t) => {
    const ds = Math.floor(Math.max(0, t) * 10 + 1e-6);
    return Math.floor(ds / 600) + ':' + String(Math.floor(ds / 10) % 60).padStart(2, '0') + '.' + (ds % 10);
  };
  const now = () => (target !== null ? target : vOurs.currentTime);

  function seekVideo(v, t) {
    if (v.readyState < 1) return;
    t = clampT(v, t);
    if (v.seeking) queued.set(v, t); else v.currentTime = t;
  }
  vids.forEach((v) => {
    v.addEventListener('seeked', () => {
      if (queued.has(v)) { const t = queued.get(v); queued.delete(v); v.currentTime = t; }
    });
    v.addEventListener('emptied', () => { queued.delete(v); if (v === vOurs) target = null; });
    v.addEventListener('error', () => console.warn('Cannot load video', v.getAttribute('src')));
  });
  function seekBoth(t) {
    if (vOurs.readyState < 1) return;
    target = clampT(vOurs, t);
    seekVideo(vOurs, target);
    seekVideo(vOther, target);
    render(target, true);
  }
  function afterSeeks(cb) {
    let left = 0, fired = false;
    const finish = () => { if (!fired) { fired = true; cb(); } };
    vids.forEach((v) => {
      if (!v.seeking && !queued.has(v)) return;
      left++;
      const fin = () => {
        if (v.seeking || queued.has(v)) return;
        v.removeEventListener('seeked', fin); v.removeEventListener('emptied', fin);
        if (--left === 0) finish();
      };
      v.addEventListener('seeked', fin); v.addEventListener('emptied', fin);
    });
    if (!left) finish(); else setTimeout(finish, 2000);
  }

  function syncOther() {
    if (state.scrubbing || vOurs.seeking || vOther.seeking || vOurs.readyState < 1 || vOther.readyState < 1) return;
    const t = clampT(vOther, vOurs.currentTime);
    if (Math.abs(vOther.currentTime - t) > (vOurs.paused ? 0.25 / FPS : 0.05)) seekVideo(vOther, t);
  }
  vOurs.addEventListener('timeupdate', () => { syncOther(); if (vOurs.paused) render(); });
  vOurs.addEventListener('seeked', () => { if (!vOurs.seeking) { target = null; syncOther(); render(undefined, true); } });
  vOther.addEventListener('seeked', () => { if (vOurs.paused && !vOther.seeking) syncOther(); });

  const shouldRun = () => state.playing && !state.scrubbing && hold.size === 0 &&
    (inFs(player) || (state.visible && !anyFs()));
  const showsPlaying = () => state.playing && (!shouldRun() || playPending || !vOurs.paused);

  function renderPlay() {
    const on = showsPlaying();
    playBtn.classList.toggle('paused', !on);
    playBtn.classList.toggle('active', !on);
    const l = on ? 'Pause (Space)' : 'Play (Space)';
    playBtn.setAttribute('aria-label', l); playBtn.title = l;
  }
  function startVideo(v) {
    const tok = v === vOurs ? ++playTok : 0;
    if (tok) playPending = true;
    const p = v.play();
    const settle = () => { if (tok && tok === playTok) { playPending = false; renderPlay(); } };
    if (p && p.then) p.then(settle, settle); else settle();
  }
  function applyPlay() {
    const run = shouldRun();
    vids.forEach((v) => { if (run) { if (v.paused) startVideo(v); } else if (!v.paused) v.pause(); });
    renderPlay();
  }
  function holdFor(fn) {
    const tok = {};
    hold.add(tok); applyPlay();
    fn();
    afterSeeks(() => { hold.delete(tok); applyPlay(); });
  }
  function join() {
    if (vOurs.readyState < 1 || vOther.readyState < 1) return;
    holdFor(() => seekVideo(vOther, now()));
  }
  function togglePlay() {
    const was = showsPlaying();
    state.playing = !was;
    applyPlay();
    if (was && vOurs.readyState >= 1) seekBoth(frameTime(frameOf(vOurs.currentTime)));
  }
  function stepFrame(dir) {
    const n = nFrames(); if (!n) return;
    if (showsPlaying()) { state.playing = false; applyPlay(); }
    seekBoth(frameTime((frameOf(now()) + dir + n) % n));
  }
  vOurs.addEventListener('pause', () => { if (vOurs.paused && shouldRun() && !vOther.paused) vOther.pause(); renderPlay(); });
  vOurs.addEventListener('play', () => { if (!vOurs.paused && shouldRun() && vOther.paused) startVideo(vOther); renderPlay(); });
  vOurs.addEventListener('playing', () => { renderPlay(); if (!raf) raf = requestAnimationFrame(tick); });

  function setSrc(v, url) {
    if (v.getAttribute('src') === url) return;
    const gen = v._gen = (v._gen || 0) + 1;
    v.setAttribute('src', url);
    v.load();
    v.addEventListener('loadedmetadata', () => {
      if (gen !== v._gen) return;
      if (v === vOurs) buildTicks();
      join();
      render(undefined, true);
    }, { once: true });
  }
  function load() {
    renderChips();
    setSrc(vOurs, src(cfg, state.scene, cfg.ours.id));
    setSrc(vOther, src(cfg, state.scene, state.other));
    labOurs.innerHTML = cfg.ours.label ? '<b class="ours">' + cfg.ours.label + '</b>' : OURS_LABEL;
    labOther.textContent = otherOf().label;
    applyPlay();
  }

  function buildTicks() {
    ticks.textContent = '';
    const d = dur();
    for (let s = GROUP_S; s < d - 0.5; s += GROUP_S) {
      const i = document.createElement('i');
      i.style.left = (100 * s / d) + '%';
      ticks.appendChild(i);
    }
  }
  function render(t, aria) {
    if (vOurs.readyState < 1) return;
    const d = dur();
    if (t === undefined) t = now();
    const f = frameOf(t) % SEQ_FRAMES + 1;
    const groups = Math.max(1, Math.round(d / GROUP_S));
    const g = Math.min(Math.floor(t / GROUP_S), groups - 1) + 1;
    seek.style.setProperty('--p', d ? Math.min(1, t / d).toFixed(5) : '0');
    curEl.textContent = fmt(t);
    durEl.textContent = fmt(d);
    frameEl.textContent = 'frame ' + String(f).padStart(3, ' ') +
      (groups > 1 ? ' · group ' + g + '/' + groups : '');
    if (aria || vOurs.paused) {
      seek.setAttribute('aria-valuemax', d.toFixed(1));
      seek.setAttribute('aria-valuenow', t.toFixed(1));
      seek.setAttribute('aria-valuetext', fmt(t) + ' of ' + fmt(d) + ', frame ' + f +
        (groups > 1 ? ', group ' + g + ' of ' + groups : ''));
    }
  }
  function tick() { raf = 0; render(); if (!vOurs.paused) raf = requestAnimationFrame(tick); }

  const timeAtX = (x) => {
    const r = seek.getBoundingClientRect(), n = nFrames();
    const ratio = Math.min(1, Math.max(0, (x - r.left - 9) / (r.width - 18)));
    return frameTime(Math.min(n - 1, Math.floor(ratio * n)));
  };
  seek.addEventListener('pointerdown', (e) => {
    if (!nFrames() || e.button > 0) return;
    e.preventDefault();
    try { seek.setPointerCapture(e.pointerId); } catch (err) {}
    seek.focus({ preventScroll: true, focusVisible: false });
    state.scrubbing = true; seek.classList.add('dragging');
    applyPlay();
    seekBoth(timeAtX(e.clientX));
  });
  seek.addEventListener('pointermove', (e) => { if (state.scrubbing) seekBoth(timeAtX(e.clientX)); });
  const endScrub = () => {
    if (!state.scrubbing) return;
    state.scrubbing = false; seek.classList.remove('dragging');
    holdFor(() => {});
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => seek.addEventListener(t, endScrub));

  player.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key, onSeek = e.target === seek;
    if (k === ' ' || k === 'k' || k === 'K') {
      if (k === ' ' && e.target.closest('button')) return;
      e.preventDefault(); if (!e.repeat) togglePlay();
    } else if (k === 'f' || k === 'F') {
      e.preventDefault(); if (!e.repeat) toggleFs(player);
    } else if (k === 'ArrowLeft' || k === 'ArrowRight' || (onSeek && (k === 'ArrowUp' || k === 'ArrowDown'))) {
      e.preventDefault(); stepFrame(k === 'ArrowRight' || k === 'ArrowUp' ? 1 : -1);
    } else if (onSeek && (k === 'Home' || k === 'End')) {
      e.preventDefault();
      const t = frameTime(k === 'Home' ? 0 : nFrames() - 1);
      holdFor(() => seekBoth(t));
    }
  });
  player.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.cmp-seek')) player.focus({ preventScroll: true, focusVisible: false });
  });
  playBtn.addEventListener('click', togglePlay);
  fsBtn.addEventListener('click', () => { toggleFs(player); player.focus({ preventScroll: true }); });

  players.push({
    onFs() {
      const on = inFs(player);
      const fig = player.parentElement;
      if (on) { if (!fig.style.minHeight) fig.style.minHeight = fig.offsetHeight + 'px'; } else fig.style.minHeight = '';
      player.classList.toggle('is-fs', on);
      fsBtn.classList.toggle('active', on);
      const l = on ? 'Exit full screen (F)' : 'Full screen (F)';
      fsBtn.setAttribute('aria-label', l); fsBtn.title = l;
      applyPlay();
      if (on && !player.contains(document.activeElement)) player.focus({ preventScroll: true });
    },
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => es.forEach((e) => { state.visible = e.isIntersecting; applyPlay(); }),
      { threshold: 0.15 }).observe(root.querySelector('.ab-slider'));
  } else { state.visible = true; }

  load();
}
