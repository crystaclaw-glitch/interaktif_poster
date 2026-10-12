(() => {
'use strict';

/* Posisi & ukuran potongan gambar (dalam satuan kartu asli 750 x 1050) */
const SPR = {"cover_cap": {"x": 285, "y": 149, "w": 177, "h": 119}, "cover_globe": {"x": 524, "y": 130, "w": 117, "h": 157}, "cover_medal": {"x": 108, "y": 766, "w": 93, "h": 132}, "cover_ball": {"x": 301, "y": 764, "w": 143, "h": 143}, "g_octopus": {"x": 0, "y": 743, "w": 472, "h": 307}, "g_rays": {"x": 477, "y": 782, "w": 127, "h": 138}, "g_heart": {"x": 44, "y": 28, "w": 159, "h": 190}, "k_horse": {"x": 203, "y": 169, "w": 304, "h": 198}, "k_blades": {"x": 493, "y": 23, "w": 129, "h": 132}, "e_elephant": {"x": 0, "y": 209, "w": 750, "h": 818}, "a_flake2": {"x": 0, "y": 921, "w": 124, "h": 129}, "a_flake1": {"x": 596, "y": 402, "w": 127, "h": 142}};
const W = 750, H = 1050;
const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);
const stage = $('#stage'), wrap = $('#stageWrap'), hintEl = $('#hint');
const btnStart = $('#btnStart'), nav = $('#nav'), btnPrev = $('#btnPrev'), btnNext = $('#btnNext');
const dotsEl = $('#dots'), starsEl = $('#stars');
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const X = (v) => (v / W * 100) + '%';
const Y = (v) => (v / H * 100) + '%';
const COLORS = ['#FFC301', '#029EB7', '#FF8FAE', '#FE430C', '#1C2A7B', '#5BD16A'];
let u = 0.5; // px per unit

/* ------------------------------------------------------------------ */
/* Data kartu                                                          */
/* ------------------------------------------------------------------ */
const CARDS = [
  { key: 'home' },
  { key: 'gurita', name: 'Gurita', need: ['heart', 'octo'],
    start: 'Klik jantung dan guritanya!', done: 'Hebat! Gurita punya 3 jantung!' },
  { key: 'kuda', name: 'Kuda', need: ['horse', 'wind'],
    start: 'Klik kuda dan kincir anginnya!', done: 'Hebat! Kuda bisa tidur sambil berdiri!' },
  { key: 'gajah', name: 'Gajah', need: ['jump', 'run'],
    start: 'Klik gajahnya, suruh dia lompat!', done: 'Gajah tidak bisa lompat, tapi larinya kencang!' },
  { key: 'air', name: 'Air', need: ['ice', 'air', 'steam'],
    start: 'Klik keran, salju, dan kolamnya!', done: 'Titik tripel: es, air, dan uap sekaligus!' },
  { key: 'finish' }
];
const S = {
  idx: -1,
  found: { gurita: new Set(), kuda: new Set(), gajah: new Set(), air: new Set() },
  starred: { gurita: false, kuda: false, gajah: false, air: false },
  busy: false,
  view: null,
  lastSwipe: 0
};

/* ------------------------------------------------------------------ */
/* Helper DOM                                                          */
/* ------------------------------------------------------------------ */
function mk(tag, cls, parent, css) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) Object.assign(e.style, css);
  if (parent) parent.appendChild(e);
  return e;
}
function newView() {
  const v = { timers: [], raf: 0, alive: true, off: [] };
  v.later = (fn, ms) => { const t = setTimeout(() => { if (v.alive) fn(); }, ms); v.timers.push(t); return t; };
  v.every = (fn, ms) => { const t = setInterval(() => { if (v.alive) fn(); }, ms); v.timers.push(t); return t; };
  v.destroy = () => {
    v.alive = false;
    v.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    if (v.raf) cancelAnimationFrame(v.raf);
    v.off.forEach((f) => f());
  };
  return v;
}
function makeCard(baseName, label) {
  const card = mk('div', 'card');
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', label);
  const base = mk('img', 'base', card);
  base.src = 'assets/' + baseName + '.webp';
  base.alt = '';
  base.draggable = false;
  const fx = mk('div', 'fx', card);
  return { card, fx };
}
/* urutan lapisan: base, lapisan animasi, fx, hotspot. fx dipindah ke atas lapisan setelah dibuat */
function layer(card, ox, oy, cls) {
  const l = mk('div', 'layer' + (cls ? ' ' + cls : ''), card);
  l.style.transformOrigin = X(ox) + ' ' + Y(oy);
  const fx = card.querySelector('.fx');
  if (fx) card.insertBefore(l, fx);
  return l;
}
function sprite(parent, name, cls) {
  const m = SPR[name];
  const i = mk('img', 'spr' + (cls ? ' ' + cls : ''), parent);
  i.src = 'assets/' + name + '.webp';
  i.alt = ''; i.draggable = false;
  i.style.left = X(m.x); i.style.top = Y(m.y);
  i.style.width = (m.w / W * 100) + '%';
  return i;
}
function box(fx, cls, x, y, w, h, center) {
  const e = mk('div', cls, fx);
  e.style.left = X(x); e.style.top = Y(y);
  if (w) e.style.width = `calc(var(--u) * ${w})`;
  if (h) e.style.height = `calc(var(--u) * ${h})`;
  if (center) {
    if (w) e.style.marginLeft = `calc(var(--u) * ${-w / 2})`;
    if (h) e.style.marginTop = `calc(var(--u) * ${-h / 2})`;
  }
  return e;
}
function anim(e, frames, opts) {
  const a = e.animate(frames, Object.assign({ fill: 'forwards', easing: 'ease-out' }, opts));
  a.onfinish = () => e.remove();
  return a;
}
function setHint(text) {
  hintEl.textContent = text;
  hintEl.classList.remove('swap');
  void hintEl.offsetWidth;
  hintEl.classList.add('swap');
}

/* ------------------------------------------------------------------ */
/* Efek                                                                */
/* ------------------------------------------------------------------ */
const SVG = {
  heart: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="#FF5C7A" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  spark: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 0L14.6 9.4 24 12 14.6 14.6 12 24 9.4 14.6 0 12 9.4 9.4z" fill="${c}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  cube: '<svg viewBox="0 0 60 60" width="100%" height="100%"><rect x="6" y="6" width="48" height="48" rx="13" fill="#CDEFFF" stroke="#4FB3E6" stroke-width="4"/><path d="M17 19h10M17 28v8" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>',
  drop: '<svg viewBox="0 0 60 60" width="100%" height="100%"><path d="M30 5C30 5 11 27 11 39a19 19 0 0 0 38 0C49 27 30 5 30 5z" fill="#52B5E0" stroke="#1C2A7B" stroke-width="3.5" stroke-linejoin="round"/><path d="M22 38a8 8 0 0 0 6 8" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none"/></svg>',
  steam: '<svg viewBox="0 0 60 60" width="100%" height="100%"><g fill="none" stroke="#8FA6C4" stroke-width="5" stroke-linecap="round"><path d="M16 54C7 44 25 38 16 28S25 12 16 5"/><path d="M30 54C21 44 39 38 30 28S39 12 30 5"/><path d="M44 54C35 44 53 38 44 28S53 12 44 5"/></g></svg>'
};

function bubble(fx, x, y) {
  const s = rand(14, 36);
  const e = box(fx, 'f-bubble', x, y, s, s, true);
  const rise = rand(170, 330), sway = rand(-40, 40);
  anim(e, [
    { transform: 'translate(0,0) scale(.4)', opacity: 0 },
    { transform: `translate(${sway * .3 * u}px,${-rise * .2 * u}px) scale(1)`, opacity: 1, offset: .18 },
    { transform: `translate(${sway * u}px,${-rise * u}px) scale(1.08)`, opacity: 0 }
  ], { duration: rand(1700, 2700), easing: 'ease-out' });
}
function miniHeart(fx, x, y) {
  const s = rand(34, 52);
  const e = box(fx, '', x, y, s, s, true);
  e.innerHTML = SVG.heart;
  anim(e, [
    { transform: 'translate(0,0) scale(.3)', opacity: 0 },
    { transform: `translate(${rand(-30, 30) * u}px,${-30 * u}px) scale(1)`, opacity: 1, offset: .25 },
    { transform: `translate(${rand(-50, 50) * u}px,${-95 * u}px) scale(1.2)`, opacity: 0 }
  ], { duration: 1100 });
}
function digit(fx, x, y, txt) {
  const e = box(fx, 'f-text', x, y);
  e.textContent = txt;
  e.style.fontSize = `calc(var(--u) * 104)`;
  e.style.marginLeft = `calc(var(--u) * -30)`;
  e.style.marginTop = `calc(var(--u) * -52)`;
  anim(e, [
    { transform: 'scale(.2)', opacity: 0 },
    { transform: 'scale(1.35)', opacity: 1, offset: .25 },
    { transform: 'scale(1)', opacity: 1, offset: .6 },
    { transform: 'scale(1)', opacity: 0 }
  ], { duration: 780 });
}
function spark(fx, x, y, color, size) {
  const s = size || rand(30, 54);
  const e = box(fx, '', x, y, s, s, true);
  e.innerHTML = SVG.spark(color || pick(COLORS.slice(0, 4)));
  const dx = rand(-70, 70), dy = rand(-70, 70);
  anim(e, [
    { transform: 'translate(0,0) scale(0) rotate(0)', opacity: 1 },
    { transform: `translate(${dx * .6 * u}px,${dy * .6 * u}px) scale(1.15) rotate(60deg)`, opacity: 1, offset: .45 },
    { transform: `translate(${dx * u}px,${dy * u}px) scale(0) rotate(140deg)`, opacity: 0 }
  ], { duration: rand(700, 1100) });
}
function sparks(fx, x, y, n, colors) {
  for (let i = 0; i < n; i++) spark(fx, x + rand(-30, 30), y + rand(-30, 30), colors ? pick(colors) : null);
}
function puff(fx, x, y, delay) {
  const s = rand(56, 84);
  const e = box(fx, 'f-puff', x, y, s, s, true);
  e.style.opacity = 0;
  const sway = rand(-50, 50), rise = rand(230, 340);
  const a = e.animate([
    { transform: 'translate(0,0) scale(.4)', opacity: 0 },
    { transform: `translate(${sway * u}px,${-rise * .35 * u}px) scale(1)`, opacity: .95, offset: .3 },
    { transform: `translate(${-sway * .6 * u}px,${-rise * .7 * u}px) scale(1.5)`, opacity: .6, offset: .65 },
    { transform: `translate(${sway * .4 * u}px,${-rise * u}px) scale(2)`, opacity: 0 }
  ], { duration: rand(1900, 2600), delay: delay || 0, fill: 'forwards', easing: 'ease-out' });
  a.onfinish = () => e.remove();
}
function dust(fx, x, y) {
  const s = rand(34, 62);
  const e = box(fx, 'f-dust', x, y, s, s, true);
  const dx = rand(-110, 110);
  anim(e, [
    { transform: 'translate(0,0) scale(.3)', opacity: .95 },
    { transform: `translate(${dx * u}px,${-rand(30, 80) * u}px) scale(1.7)`, opacity: 0 }
  ], { duration: rand(600, 900) });
}
function droplet(fx, x, y) {
  const s = rand(22, 38);
  const e = box(fx, 'f-drop', x, y, s, s * 1.2, true);
  const dx = rand(-130, 130), up = rand(90, 190);
  anim(e, [
    { transform: 'translate(0,0) scale(.6)', opacity: 1 },
    { transform: `translate(${dx * .5 * u}px,${-up * u}px) scale(1)`, opacity: 1, offset: .45 },
    { transform: `translate(${dx * u}px,${40 * u}px) scale(.8)`, opacity: 0 }
  ], { duration: rand(700, 1000), easing: 'cubic-bezier(.3,.6,.5,1)' });
}
function ripple(fx, x, y, delay) {
  const e = box(fx, '', x, y, 90, 24, true);
  e.style.border = `calc(var(--u) * 4) solid #fff`;
  e.style.borderRadius = '50%';
  e.style.opacity = 0;
  const a = e.animate([
    { transform: 'scale(.2)', opacity: .95 },
    { transform: 'scale(2.6)', opacity: 0 }
  ], { duration: 1100, delay: delay || 0, fill: 'forwards', easing: 'ease-out' });
  a.onfinish = () => e.remove();
}
function zzz(fx, x, y) {
  [0, 380, 760].forEach((d, i) => {
    const e = box(fx, 'f-text', x, y);
    e.textContent = 'Z';
    e.style.color = '#fff';
    e.style.webkitTextStroke = `calc(var(--u) * 2) #4C5DB8`;
    e.style.textShadow = 'none';
    e.style.color = '#7C8BE0';
    e.style.fontSize = `calc(var(--u) * ${46 + i * 18})`;
    e.style.opacity = 0;
    const a = e.animate([
      { transform: 'translate(0,0) rotate(-8deg) scale(.5)', opacity: 0 },
      { transform: `translate(${28 * u}px,${-36 * u}px) rotate(6deg) scale(1)`, opacity: 1, offset: .3 },
      { transform: `translate(${70 * u}px,${-100 * u}px) rotate(-6deg) scale(1.1)`, opacity: 0 }
    ], { duration: 1900, delay: d, fill: 'forwards', easing: 'ease-out' });
    a.onfinish = () => e.remove();
  });
}
function speech(fx, x, y, text, ms) {
  const e = box(fx, 'f-speech', x, y);
  e.textContent = text;
  const T = (s, ty) => `translate(-50%,${ty}%) scale(${s})`;
  anim(e, [
    { transform: T(.2, -100), opacity: 0 },
    { transform: T(1.12, -100), opacity: 1, offset: .1 },
    { transform: T(1, -100), opacity: 1, offset: .18 },
    { transform: T(1, -100), opacity: 1, offset: .86 },
    { transform: T(.9, -112), opacity: 0 }
  ], { duration: ms || 1700, easing: 'ease-out' });
}
function speedLines(fx, y0, y1, dir) {
  const e = box(fx, 'f-line', dir > 0 ? -150 : 750, rand(y0, y1), rand(90, 190));
  const dist = 950 * dir;
  anim(e, [
    { transform: 'translateX(0)', opacity: 0 },
    { opacity: .9, offset: .2 },
    { transform: `translateX(${dist * u}px)`, opacity: 0 }
  ], { duration: rand(420, 640), easing: 'linear' });
}
function confetti(fx, x, y, n) {
  for (let i = 0; i < (n || 28); i++) {
    const e = box(fx, 'f-conf', x, y);
    const shape = i % 4;
    e.style.background = pick(COLORS);
    if (shape === 0) e.style.borderRadius = '50%';
    if (shape === 2) e.style.clipPath = 'polygon(50% 0,100% 100%,0 100%)';
    if (shape === 3) e.style.borderRadius = '100% 0 0 0';
    const dx = rand(-380, 380), up = rand(180, 520), fall = rand(120, 480);
    anim(e, [
      { transform: 'translate(0,0) rotate(0) scale(.4)', opacity: 1 },
      { transform: `translate(${dx * .6 * u}px,${-up * u}px) rotate(${rand(120, 360)}deg) scale(1)`, opacity: 1, offset: .45 },
      { transform: `translate(${dx * u}px,${(-up + fall) * u}px) rotate(${rand(400, 800)}deg) scale(.9)`, opacity: 0 }
    ], { duration: rand(1500, 2400), easing: 'cubic-bezier(.2,.6,.4,1)' });
  }
}
function rain() {
  const o = mk('div', '', document.body, { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 20, overflow: 'hidden' });
  for (let i = 0; i < 70; i++) {
    const e = mk('i', '', o, {
      position: 'absolute', left: rand(0, 100) + 'vw', top: '-4vh', display: 'block',
      width: rand(9, 18) + 'px', height: rand(9, 18) + 'px', background: pick(COLORS),
      borderRadius: i % 3 === 0 ? '50%' : (i % 3 === 1 ? '3px' : '100% 0 0 0')
    });
    e.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${rand(-80, 80)}px,110vh) rotate(${rand(360, 900)}deg)`, opacity: 1 }
    ], { duration: rand(2600, 4600), delay: rand(0, 1400), fill: 'forwards', easing: 'ease-in' });
  }
  setTimeout(() => o.remove(), 7000);
}

/* ------------------------------------------------------------------ */
/* Hotspot, bintang, dan progres                                       */
/* ------------------------------------------------------------------ */
function tapdot(card, x, y) {
  const d = mk('div', 'tapdot', card);
  d.style.left = X(x); d.style.top = Y(y);
  return d;
}
/* ctx: { v, key, card, fx } */
function hot(ctx, id, r, label, fn, opts) {
  opts = opts || {};
  const found = S.found[ctx.key];
  const b = mk('button', 'hot', ctx.card);
  b.type = 'button';
  b.dataset.id = id;
  b.setAttribute('aria-label', label);
  b.style.left = X(r.x); b.style.top = Y(r.y);
  b.style.width = (r.w / W * 100) + '%'; b.style.height = (r.h / H * 100) + '%';
  if (r.round) b.style.borderRadius = '50%';
  if (!found.has(id) && opts.ring !== false) b.classList.add('new');
  b.addEventListener('click', (e) => {
    if (opts.manual !== true) mark(ctx, id);
    fn(e, b);
    if (opts.manual !== true) checkProgress(ctx);
  });
  return b;
}
function mark(ctx, id) {
  S.found[ctx.key].add(id);
  ctx.card.querySelectorAll(`[data-id="${id}"]`).forEach((b) => b.classList.remove('new'));
  if (ctx.dots && ctx.dots[id]) { ctx.dots[id].remove(); delete ctx.dots[id]; }
}
function checkProgress(ctx) {
  const def = CARDS.find((c) => c.key === ctx.key);
  if (!def || !def.need) return;
  const f = S.found[ctx.key];
  const n = def.need.filter((id) => f.has(id)).length;
  if (n === def.need.length) {
    if (!S.starred[ctx.key]) {
      S.starred[ctx.key] = true;
      ctx.v.later(() => awardStar(ctx), ctx.key === 'air' ? 2600 : 700);
      ctx.v.off.push(() => renderStars());
    }
    if (ctx.key !== 'gajah') setHint(def.done);
  } else if (ctx.key !== 'gajah') {
    setHint(`Bagus! Masih ada yang bisa ditekan (${n}/${def.need.length}).`);
  }
  renderDots();
}
function awardStar(ctx) {
  confetti(ctx.fx, 375, 520, 36);
  speech(ctx.fx, 375, 470, 'Bintang baru!', 1900);
  renderStars(ctx.key);
  setHint(CARDS.find((c) => c.key === ctx.key).done);
}
const STAR_PATH = 'M12 2.2l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.1 5.9 20.6l1.3-6.7-5-4.7 6.8-.8z';
function renderStars(popKey) {
  const keys = ['gurita', 'kuda', 'gajah', 'air'];
  if (!starsEl.children.length) {
    keys.forEach(() => {
      const s = mk('span', 'st', starsEl);
      s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
    });
  }
  let total = 0;
  keys.forEach((k, i) => {
    const el = starsEl.children[i];
    const on = S.starred[k];
    if (on) total++;
    el.classList.toggle('on', on);
    if (popKey === k) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  });
  starsEl.setAttribute('aria-label', `Bintang: ${total} dari 4`);
}
function renderDots() {
  if (!dotsEl.children.length) {
    for (let i = 1; i <= 4; i++) {
      const d = mk('button', 'dot', dotsEl);
      d.type = 'button';
      d.setAttribute('aria-label', `Kartu ${i}: ${CARDS[i].name}`);
      d.addEventListener('click', () => go(i));
    }
  }
  for (let i = 1; i <= 4; i++) {
    const d = dotsEl.children[i - 1];
    d.classList.toggle('on', S.idx === i);
    d.classList.toggle('done', S.starred[CARDS[i].key]);
    if (S.idx === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
  }
}
function ptFromEvent(e, card, b, fallback) {
  const r = card.getBoundingClientRect();
  if (e && e.detail > 0 && e.clientX) {
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Kartu 0: sampul                                                     */
/* ------------------------------------------------------------------ */
function buildHome() {
  const v = newView();
  const { card, fx } = makeCard('cover_base', 'Sampul kartu: Baca itu, bikin kamu jadi tau');
  const ctx = { v, key: 'home', card, fx };
  S.found.home = S.found.home || new Set();

  const glow = mk('div', 'glow', card);
  card.insertBefore(glow, fx);
  const cap = layer(card, 373, 209, 'a-float'); sprite(cap, 'cover_cap');
  const globe = layer(card, 582, 286, 'a-sway'); sprite(globe, 'cover_globe');
  const medal = layer(card, 155, 780, 'a-float'); sprite(medal, 'cover_medal');
  cap.style.animationDuration = '3.1s'; medal.style.animationDuration = '3.7s'; globe.style.animationDuration = '5s';
  const ball = layer(card, 372, 905); sprite(ball, 'cover_ball');

  const pad = (name, p) => { const m = SPR[name]; return { x: m.x - p, y: m.y - p, w: m.w + 2 * p, h: m.h + 2 * p }; };

  hot(ctx, 'cap', pad('cover_cap', 8), 'Topi wisuda', () => {
    cap.animate([
      { transform: 'translateY(0) rotate(0)' },
      { transform: `translateY(${-70 * u}px) rotate(200deg) scale(1.08)`, offset: .45 },
      { transform: 'translateY(0) rotate(360deg)' }
    ], { duration: RM ? 300 : 950, easing: 'cubic-bezier(.3,.7,.4,1)' });
    sparks(fx, 373, 190, 7);
    speech(fx, 373, 150, 'Pintar!', 1300);
  }, { ring: false });
  hot(ctx, 'globe', pad('cover_globe', 8), 'Globe', () => {
    globe.animate([
      { transform: 'rotate(0)' }, { transform: 'rotate(-18deg)' }, { transform: 'rotate(15deg)' },
      { transform: 'rotate(-10deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(0)' }
    ], { duration: RM ? 300 : 1100, easing: 'ease-in-out' });
    sparks(fx, 582, 200, 7);
    speech(fx, 560, 150, 'Dunia luas!', 1400);
  }, { ring: false });
  hot(ctx, 'medal', pad('cover_medal', 8), 'Medali', () => {
    medal.animate([
      { transform: 'rotate(0)' }, { transform: 'rotate(-22deg)' }, { transform: 'rotate(18deg)' },
      { transform: 'rotate(-12deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(0)' }
    ], { duration: RM ? 300 : 1400, easing: 'ease-in-out' });
    sparks(fx, 155, 820, 8, ['#FFC301', '#fff']);
    speech(fx, 155, 745, 'Juara!', 1400);
  }, { ring: false });
  hot(ctx, 'ball', pad('cover_ball', 4), 'Bola basket', () => {
    const f = (t, y, sx, sy) => ({ offset: t, transform: `translateY(${y * u}px) scale(${sx},${sy})` });
    ball.animate([
      f(0, 0, 1, 1), f(.1, 0, 1.12, .86), f(.28, -120, .96, 1.06), f(.46, 0, 1.12, .86),
      f(.6, -60, 1, 1.02), f(.74, 0, 1.08, .9), f(.84, -22, 1, 1), f(.93, 0, 1.04, .95), f(1, 0, 1, 1)
    ], { duration: RM ? 300 : 1500, easing: 'ease-in-out' });
    v.later(() => sparks(fx, 372, 900, 5, ['#FE430C', '#FFC301']), 420);
    speech(fx, 372, 740, 'Tuk tuk tuk!', 1500);
  }, { ring: false });
  hot(ctx, 'lamp', { x: 432, y: 525, w: 232, h: 345 }, 'Lampu belajar', () => {
    glow.animate([
      { opacity: 0 }, { opacity: 1 }, { opacity: .15 }, { opacity: 1 }, { opacity: .35 },
      { opacity: 1 }, { opacity: 1, offset: .75 }, { opacity: 0 }
    ], { duration: RM ? 600 : 2800, easing: 'ease-in-out' });
    sparks(fx, 467, 600, 6, ['#FFC301', '#fff']);
    speech(fx, 560, 520, 'Terang!', 1500);
  }, { ring: false });

  /* titik colek berkedip di salah satu ikon, bergantian */
  const spots = [[373, 215], [582, 215], [155, 835], [372, 835], [545, 655]];
  const d = tapdot(card, spots[0][0], spots[0][1]);
  let k = 0;
  v.every(() => { k = (k + 1) % spots.length; d.style.left = X(spots[k][0]); d.style.top = Y(spots[k][1]); }, 3800);
  return { el: card, v, hint: 'Tekan gambar-gambarnya!' };
}

/* ------------------------------------------------------------------ */
/* Kartu 1: gurita                                                     */
/* ------------------------------------------------------------------ */
function buildGurita() {
  const v = newView();
  const { card, fx } = makeCard('g_base', 'Kartu fakta: Gurita punya 3 jantung');
  const ctx = { v, key: 'gurita', card, fx, dots: {} };
  const octo = layer(card, 40, 1050, 'a-sway'); sprite(octo, 'g_octopus');
  const rays = layer(card, 540, 850, 'a-rays'); sprite(rays, 'g_rays');
  const heart = layer(card, 123, 123, 'a-beat'); sprite(heart, 'g_heart');
  const f = S.found.gurita;
  let beating = false;

  hot(ctx, 'heart', { x: 40, y: 24, w: 168, h: 198, round: true }, 'Jantung', () => {
    if (beating) return;
    beating = true;
    [0, 1, 2].forEach((i) => {
      v.later(() => {
        heart.animate([
          { transform: 'scale(1)' }, { transform: 'scale(1.34)', offset: .22 }, { transform: 'scale(1.06)', offset: .4 },
          { transform: 'scale(1.24)', offset: .6 }, { transform: 'scale(1)' }
        ], { duration: RM ? 300 : 620, easing: 'ease-out' });
        digit(fx, 123, 128, String(i + 1));
        for (let h = 0; h < 3; h++) miniHeart(fx, 123 + rand(-40, 40), 100 + rand(-20, 20));
      }, i * 820);
    });
    v.later(() => { beating = false; confetti(fx, 123, 130, 14); }, 3 * 820 + 100);
  }, {});
  hot(ctx, 'octo', { x: 0, y: 780, w: 300, h: 270 }, 'Gurita', () => {
    octo.animate([
      { transform: 'rotate(0) scale(1)' }, { transform: 'rotate(-6deg) scale(1.05,.96)' }, { transform: 'rotate(5deg) scale(.98,1.05)' },
      { transform: 'rotate(-4deg) scale(1.04,.98)' }, { transform: 'rotate(3deg) scale(1)' }, { transform: 'rotate(0) scale(1)' }
    ], { duration: RM ? 300 : 1200, easing: 'ease-in-out' });
    rays.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 600 });
    for (let i = 0; i < 12; i++) v.later(() => bubble(fx, rand(90, 230), rand(800, 860)), i * 120);
  }, {});
  if (!RM) v.every(() => bubble(fx, rand(100, 220), 820), 3200);
  return { el: card, v, hint: CARDS[1].start };
}

/* ------------------------------------------------------------------ */
/* Kartu 2: kuda                                                       */
/* ------------------------------------------------------------------ */
function buildKuda() {
  const v = newView();
  const { card, fx } = makeCard('k_base', 'Kartu fakta: Kuda bisa tidur berdiri');
  const ctx = { v, key: 'kuda', card, fx, dots: {} };
  const blades = layer(card, 557.5, 89); sprite(blades, 'k_blades');
  const horse = layer(card, 355, 365, 'a-breathe'); sprite(horse, 'k_horse');
  const eyes = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  eyes.setAttribute('class', 'full'); eyes.setAttribute('viewBox', `0 0 ${W} ${H}`); eyes.setAttribute('preserveAspectRatio', 'none');
  eyes.innerHTML = '<g style="opacity:0;transition:opacity .12s">' +
    '<ellipse cx="234" cy="275" rx="18" ry="13" fill="#F7D088"/><circle cx="234" cy="275" r="9.5" fill="#2B1B10"/><circle cx="237.5" cy="271" r="3.4" fill="#fff"/>' +
    '<ellipse cx="296.5" cy="281.5" rx="18" ry="13" fill="#F7D088"/><circle cx="296.5" cy="281.5" r="9.5" fill="#2B1B10"/><circle cx="300" cy="277.5" r="3.4" fill="#fff"/></g>';
  horse.appendChild(eyes);
  const eyeG = eyes.firstChild;

  let awake = false, sleepT = 0;
  hot(ctx, 'horse', { x: 200, y: 165, w: 310, h: 205 }, 'Kuda yang tidur', () => {
    awake = true;
    eyeG.style.opacity = 1;
    horse.animate([
      { transform: 'translateY(0) scale(1)' },
      { transform: `translateY(${-30 * u}px) scale(1.07,1.04)`, offset: .35 },
      { transform: 'translateY(0) scale(1)', offset: .7 },
      { transform: `translateY(${-10 * u}px) scale(1.02)`, offset: .82 },
      { transform: 'translateY(0) scale(1)' }
    ], { duration: RM ? 300 : 900, easing: 'ease-out' });
    speech(fx, 300, 150, 'Hah?!', 1500);
    sparks(fx, 300, 230, 5, ['#FFC301', '#fff']);
    clearTimeout(sleepT);
    sleepT = v.later(() => { eyeG.style.opacity = 0; awake = false; }, 2800);
  }, {});

  /* kincir angin: berputar, makin kencang kalau dicolek */
  let ang = 0, speed = RM ? 0 : 45, last = performance.now(), lastWind = 0;
  const idle = RM ? 0 : 45;
  const tick = (t) => {
    const dt = Math.min(.05, (t - last) / 1000); last = t;
    speed = idle + (speed - idle) * Math.exp(-dt * .8);
    ang = (ang + speed * dt) % 360;
    blades.style.transform = `rotate(${ang}deg)`;
    if (speed > 360 && t - lastWind > 130) {
      lastWind = t;
      const e = box(fx, 'f-line', 440, rand(60, 150), rand(60, 110));
      anim(e, [{ transform: 'translateX(0)', opacity: 0 }, { opacity: .95, offset: .2 }, { transform: `translateX(${-260 * u}px)`, opacity: 0 }], { duration: 520, easing: 'linear' });
    }
    v.raf = requestAnimationFrame(tick);
  };
  v.raf = requestAnimationFrame(tick);
  hot(ctx, 'wind', { x: 485, y: 20, w: 145, h: 140, round: true }, 'Kincir angin', () => {
    speed = Math.min(1100, speed + 640);
    if (speed > 700) speech(fx, 300, 95, 'Wusss!', 1100);
  }, {});

  v.every(() => { if (!awake) zzz(fx, 252, 175); }, 2300);
  v.later(() => { if (!awake) zzz(fx, 252, 175); }, 400);
  return { el: card, v, hint: CARDS[2].start };
}

/* ------------------------------------------------------------------ */
/* Kartu 3: gajah                                                      */
/* ------------------------------------------------------------------ */
function buildGajah() {
  const v = newView();
  const { card, fx } = makeCard('e_base', 'Kartu fakta: Gajah tidak bisa lompat');
  const ctx = { v, key: 'gajah', card, fx, dots: {} };
  const ele = layer(card, 375, 1010); sprite(ele, 'e_elephant');
  const f = S.found.gajah;
  const feet = [[60, 1010], [270, 1012], [430, 1012], [520, 1012]];
  let busy = false;
  let step = f.has('jump') && !f.has('run') ? 1 : 0;

  const placeDot = () => {
    if (ctx.dots.t) ctx.dots.t.remove();
    ctx.dots.t = null;
    if (f.has('jump') && f.has('run')) return;
    ctx.dots.t = tapdot(card, step === 0 ? 400 : 300, step === 0 ? 560 : 880);
  };
  placeDot();

  const shake = () => {
    if (RM) return;
    card.animate([
      { transform: 'translate(0,0)' }, { transform: `translate(${-7 * u}px,${5 * u}px)` }, { transform: `translate(${6 * u}px,${-4 * u}px)` },
      { transform: `translate(${-4 * u}px,${2 * u}px)` }, { transform: 'translate(0,0)' }
    ], { duration: 320, easing: 'ease-out' });
  };
  const doJump = () => {
    ele.animate([
      { offset: 0, transform: 'translateY(0) scale(1,1)' },
      { offset: .14, transform: 'translateY(0) scale(1.015,.975)' },
      { offset: .36, transform: 'translateY(-2.5%) scale(.99,1.02)' },
      { offset: .48, transform: 'translateY(-2.5%) rotate(-.7deg)' },
      { offset: .58, transform: 'translateY(0) scale(1.02,.97)' },
      { offset: .65, transform: 'translateY(.4%) scale(1.01,.99)' },
      { offset: 1, transform: 'translateY(0) scale(1,1)' }
    ], { duration: RM ? 400 : 1300, easing: 'ease-in-out' });
    speech(fx, 600, 215, 'Hup!', 700);
    v.later(() => {
      shake();
      feet.forEach(([x, y]) => { for (let i = 0; i < 3; i++) dust(fx, x + rand(-30, 30), y + rand(-10, 10)); });
      speech(fx, 600, 215, 'Gak bisa!', 1500);
    }, RM ? 200 : 780);
  };
  const doRun = () => {
    ele.animate([
      { transform: 'translate(0,0) rotate(0)' },
      { transform: 'translate(-.7%,-.8%) rotate(-.4deg)' },
      { transform: 'translate(.4%,0) rotate(0)' },
      { transform: 'translate(-.6%,-.6%) rotate(.4deg)' },
      { transform: 'translate(0,0) rotate(0)' }
    ], { duration: 250, iterations: RM ? 2 : 10, easing: 'linear' });
    speech(fx, 600, 215, 'Wusss!', 1500);
    let n = 0;
    const iv = v.every(() => {
      n++;
      speedLines(fx, 330, 960, 1);
      if (n % 2 === 0) { const [x, y] = pick(feet); dust(fx, x, y); }
      if (n > 26) clearInterval(iv);
    }, 90);
  };
  hot(ctx, 'ele', { x: 0, y: 215, w: 750, h: 835 }, 'Gajah', () => {
    if (busy) return;
    busy = true;
    if (step === 0) {
      mark(ctx, 'jump'); doJump(); step = 1;
      v.later(() => {
        busy = false; placeDot();
        setHint('Gajah tidak bisa lompat! Sekarang suruh dia lari!');
      }, RM ? 600 : 1700);
    } else {
      mark(ctx, 'run'); doRun(); step = 0;
      v.later(() => {
        busy = false; placeDot();
        if (f.has('jump') && f.has('run')) { checkProgress(ctx); setHint(CARDS[3].done); }
      }, RM ? 600 : 2600);
    }
  }, { ring: false, manual: true });
  return { el: card, v, hint: f.has('jump') && !f.has('run') ? 'Gajah tidak bisa lompat! Sekarang suruh dia lari!' : CARDS[3].start };
}

/* ------------------------------------------------------------------ */
/* Kartu 4: air                                                        */
/* ------------------------------------------------------------------ */
function buildAir() {
  const v = newView();
  const { card, fx } = makeCard('a_base', 'Kartu fakta: Air bisa membeku dan mendidih bersamaan');
  const ctx = { v, key: 'air', card, fx, dots: {} };
  const f = S.found.air;

  /* aliran air dari keran */
  const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sv.setAttribute('class', 'full'); sv.setAttribute('viewBox', `0 0 ${W} ${H}`); sv.setAttribute('preserveAspectRatio', 'none');
  sv.innerHTML = '<defs><clipPath id="streamClip"><rect x="446" y="339" width="56" height="160"/></clipPath></defs>' +
    '<g clip-path="url(#streamClip)">' +
    [456, 470, 484, 496].map((x, i) => `<line class="flow" x1="${x}" y1="300" x2="${x}" y2="520" style="animation-delay:${-i * .21}s"/>`).join('') +
    '</g>' +
    '<ellipse class="rip" cx="473" cy="498" rx="46" ry="11"/><ellipse class="rip" cx="473" cy="498" rx="46" ry="11" style="animation-delay:.9s"/>';
  card.insertBefore(sv, fx);

  const fl1 = layer(card, 659.5, 473, 'a-spin'); sprite(fl1, 'a_flake1');
  const fl2 = layer(card, 62, 985, 'a-spin-r'); sprite(fl2, 'a_flake2');

  if (!f.has('air')) ctx.dots.air = tapdot(card, 590, 150);
  if (!f.has('ice')) ctx.dots.ice = tapdot(card, 660, 473);
  if (!f.has('steam')) ctx.dots.steam = tapdot(card, 250, 540);

  const spinFlake = (l) => l.animate([
    { transform: 'rotate(0) scale(1)' }, { transform: 'rotate(360deg) scale(1.28)', offset: .5 }, { transform: 'rotate(720deg) scale(1)' }
  ], { duration: RM ? 300 : 1400, easing: 'ease-in-out' });
  const iceCubes = () => {
    [[430, 560], [545, 548], [640, 575]].forEach(([x, y], i) => {
      v.later(() => {
        const e = box(fx, '', x, 430, 64, 64, true);
        e.innerHTML = SVG.cube;
        e.style.opacity = 0;
        const bob = e.animate([
          { transform: `translateY(0) rotate(0)`, opacity: 0, offset: 0 },
          { transform: `translateY(${(y - 430) * u}px) rotate(${rand(-20, 20)}deg)`, opacity: 1, offset: .12 },
          { transform: `translateY(${(y - 430 - 10) * u}px) rotate(-6deg)`, opacity: 1, offset: .3 },
          { transform: `translateY(${(y - 430 + 4) * u}px) rotate(6deg)`, opacity: 1, offset: .5 },
          { transform: `translateY(${(y - 430 - 8) * u}px) rotate(-4deg)`, opacity: 1, offset: .72 },
          { transform: `translateY(${(y - 430 + 2) * u}px) rotate(3deg)`, opacity: 1, offset: .88 },
          { transform: `translateY(${(y - 430) * u}px)`, opacity: 0, offset: 1 }
        ], { duration: 5200, fill: 'forwards', easing: 'ease-in-out' });
        bob.onfinish = () => e.remove();
        ripple(fx, x, y + 28);
      }, i * 280);
    });
  };

  hot(ctx, 'air', { x: 415, y: 20, w: 335, h: 320 }, 'Keran air', (e, b) => {
    const p = { x: 473, y: 497 };
    for (let i = 0; i < 14; i++) droplet(fx, p.x + rand(-26, 26), p.y);
    ripple(fx, p.x, p.y + 6); ripple(fx, p.x, p.y + 6, 220); ripple(fx, p.x, p.y + 6, 440);
    speech(fx, 610, 395, 'Air cair!', 1500);
  }, { ring: false });
  hot(ctx, 'air', { x: 436, y: 335, w: 76, h: 172 }, 'Aliran air', () => {
    for (let i = 0; i < 14; i++) droplet(fx, 473 + rand(-26, 26), 497);
    ripple(fx, 473, 503); ripple(fx, 473, 503, 220); ripple(fx, 473, 503, 440);
    speech(fx, 610, 395, 'Air cair!', 1500);
  }, { ring: false });
  hot(ctx, 'ice', { x: 590, y: 396, w: 140, h: 152, round: true }, 'Kepingan salju', () => {
    spinFlake(fl1);
    sparks(fx, 660, 473, 9, ['#fff', '#8ED3F5', '#CDEFFF']);
    iceCubes();
    speech(fx, 610, 395, 'Es beku!', 1500);
  }, { ring: false });
  hot(ctx, 'ice', { x: 0, y: 915, w: 130, h: 135, round: true }, 'Kepingan salju kecil', () => {
    spinFlake(fl2);
    sparks(fx, 62, 985, 9, ['#fff', '#CDEFFF', '#FFC301']);
    iceCubes();
    speech(fx, 610, 395, 'Es beku!', 1500);
  }, { ring: false });
  hot(ctx, 'steam', { x: 0, y: 505, w: 750, h: 545 }, 'Kolam air', (e, b) => {
    const p = ptFromEvent(e, card, b, { x: 250, y: 560 });
    const px = Math.max(60, Math.min(690, p.x)), py = Math.max(520, Math.min(980, p.y));
    for (let i = 0; i < 7; i++) puff(fx, px + rand(-40, 40), py, i * 150);
    speech(fx, 230, 470, 'Uap panas!', 1500);
  }, { ring: false });
  const hotSteam = card.querySelector('[data-id="steam"]'); hotSteam.style.zIndex = 7; hotSteam.style.borderRadius = '0';
  card.querySelectorAll('[data-id="ice"]').forEach((b) => { b.style.zIndex = 9; });

  /* panel titik tripel */
  v.every(() => {
    if (['air', 'ice', 'steam'].every((k) => f.has(k)) && !ctx.triple && !S.tripleShown) {
      ctx.triple = true; S.tripleShown = true;
      v.later(showTriple, 1100);
    }
  }, 400);
  function showTriple() {
    const p = mk('div', 'panel', card);
    p.innerHTML = '<h3>Titik tripel!</h3><div class="trio">' +
      `<div>${SVG.cube}Es</div><div>${SVG.drop}Air</div><div>${SVG.steam}Uap</div></div>` +
      '<p>Es, air, dan uap bisa ada sekaligus!</p>';
    p.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.06)', opacity: 1, offset: .6 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 520, easing: 'ease-out', fill: 'forwards' });
    p.querySelectorAll('.trio div').forEach((d, i) => {
      d.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 480, delay: 500 + i * 420, fill: 'forwards', easing: 'ease-out' });
      v.later(() => sparks(fx, 375 + (i - 1) * 190, 640, 4), 700 + i * 420);
    });
    const close = () => {
      if (!p.isConnected) return;
      const a = p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
      a.onfinish = () => p.remove();
    };
    p.addEventListener('click', close);
    v.later(close, 7000);
  }
  return { el: card, v, hint: CARDS[4].start };
}

/* ------------------------------------------------------------------ */
/* Layar selesai                                                       */
/* ------------------------------------------------------------------ */
function buildFinish() {
  const v = newView();
  const el = mk('div', 'finish');
  const total = Object.values(S.starred).filter(Boolean).length;
  el.innerHTML = '<h1>Hebat!</h1><p>Sekarang kamu jadi tau!</p>';
  const fan = mk('div', 'fan', el);
  ['t_gurita', 't_kuda', 't_gajah', 't_air'].forEach((n, i) => {
    const im = mk('img', '', fan);
    im.src = 'assets/' + n + '.webp'; im.alt = `Kartu ${CARDS[i + 1].name}`; im.draggable = false;
    im.addEventListener('click', () => { im.classList.add('pop'); setTimeout(() => go(i + 1), 250); });
  });
  const st = mk('div', 'fin-stars', el);
  st.setAttribute('role', 'img'); st.setAttribute('aria-label', `Kamu dapat ${total} dari 4 bintang`);
  ['gurita', 'kuda', 'gajah', 'air'].forEach((k, i) => {
    const s = mk('span', S.starred[k] ? 'on' : '', st);
    s.style.animationDelay = (0.4 + i * 0.25) + 's';
    s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
  });
  mk('p', '', el).textContent = total === 4 ? 'Empat bintang! Masih ada banyak fakta seru lainnya di Tiny Talk Notes.' : 'Klik lagi kartunya untuk dapat semua bintang!';
  v.later(rain, 200);
  return { el, v, hint: 'Ketuk kartu untuk membacanya lagi.' };
}

/* ------------------------------------------------------------------ */
/* Navigasi                                                            */
/* ------------------------------------------------------------------ */
const BUILD = { home: buildHome, gurita: buildGurita, kuda: buildKuda, gajah: buildGajah, air: buildAir, finish: buildFinish };

function fit() {
  const r = wrap.getBoundingClientRect();
  const h = r.height - 8, w = r.width - 16;
  const cw = Math.max(120, Math.min(w, h * 5 / 7));
  u = cw / W;
  document.documentElement.style.setProperty('--u', u + 'px');
  const c = stage.querySelector('.card');
  if (c) { c.style.width = cw + 'px'; c.style.height = (cw * 7 / 5) + 'px'; }
}
function chrome(i) {
  const k = CARDS[i].key;
  btnStart.hidden = !(k === 'home' || k === 'finish');
  btnStart.textContent = k === 'finish' ? 'Baca Lagi' : 'Mulai Baca';
  nav.hidden = !(i >= 1 && i <= 4);
  starsEl.classList.toggle('hidden', k === 'home');
  btnNext.setAttribute('aria-label', i === 4 ? 'Selesai' : 'Kartu berikutnya');
  renderDots();
}
async function go(i) {
  if (S.busy || i === S.idx || i < 0 || i >= CARDS.length) return;
  S.busy = true;
  try {
    const dir = i > S.idx ? 1 : -1;
    const flip = (S.idx === 0 && i === 1) || (S.idx === 1 && i === 0) || (i === 0 && S.idx === 5);
    const old = stage.firstElementChild;
    if (S.view) { S.view.destroy(); S.view = null; }
    if (old) {
      if (!RM) {
        const frames = flip
          ? [{ transform: 'rotateY(0)' }, { transform: `rotateY(${-90 * dir}deg)` }]
          : [{ transform: 'translateX(0) rotate(0)', opacity: 1 }, { transform: `translateX(${-dir * 125}%) rotate(${-dir * 9}deg)`, opacity: 0 }];
        try { await old.animate(frames, { duration: flip ? 230 : 260, easing: 'ease-in', fill: 'forwards' }).finished; } catch (e) { /* abaikan */ }
      }
      old.remove();
    }
    S.idx = i;
    const b = BUILD[CARDS[i].key]();
    S.view = b.v;
    stage.appendChild(b.el);
    fit();
    chrome(i);
    renderStars();
    setHint(b.hint);
    if (!RM) {
      const frames = flip
        ? [{ transform: `rotateY(${90 * dir}deg)` }, { transform: 'rotateY(0)' }]
        : [{ transform: `translateX(${dir * 125}%) rotate(${dir * 9}deg)`, opacity: 0 }, { transform: 'translateX(0) rotate(0)', opacity: 1 }];
      try { await b.el.animate(frames, { duration: flip ? 280 : 340, easing: 'cubic-bezier(.2,1.1,.4,1)' }).finished; } catch (e) { /* abaikan */ }
    }
  } finally {
    S.busy = false;
  }
}

btnStart.addEventListener('click', () => { go(S.idx === 5 ? 0 : 1); });
btnPrev.addEventListener('click', () => go(S.idx - 1));
btnNext.addEventListener('click', () => go(S.idx + 1));
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' && S.idx >= 1 && S.idx <= 4) go(S.idx + 1);
  if (e.key === 'ArrowLeft' && S.idx >= 1 && S.idx <= 5) go(S.idx - 1);
});
/* geser untuk pindah kartu */
let sx = 0, sy = 0, st = 0, tracking = false;
stage.addEventListener('pointerdown', (e) => { tracking = true; sx = e.clientX; sy = e.clientY; st = performance.now(); });
window.addEventListener('pointerup', (e) => {
  if (!tracking) return; tracking = false;
  const dx = e.clientX - sx, dy = e.clientY - sy;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && performance.now() - st < 700 && S.idx >= 1 && S.idx <= 4) {
    S.lastSwipe = Date.now();
    go(S.idx + (dx < 0 ? 1 : -1));
  }
});
stage.addEventListener('click', (e) => {
  if (Date.now() - S.lastSwipe < 350) { e.stopPropagation(); e.preventDefault(); }
}, true);

if ('ResizeObserver' in window) new ResizeObserver(fit).observe(wrap);
window.addEventListener('resize', fit);
renderStars();
fit();
go(0);
})();
