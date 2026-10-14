// Fervo · camada editorial (DOM). A cena (scene.js) lê o scroll pelos offsets das .sec.
// Cada .sec é um espaçador de rolagem; a cópia de canto fica num painel fixo que aparece
// só perto do "pouso" de cada sabor e some durante a troca (o palco fica limpo).
import Lenis from './vendor/lenis.mjs';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const { gsap } = window;
const HAS_GSAP = !!gsap;
const root = document.documentElement;
const secs = [...document.querySelectorAll('#story .sec')];
const navLinks = [...document.querySelectorAll('.flavors a[data-goto]')];
const hsBtns = [...document.querySelectorAll('.hs')];
const themeMeta = document.querySelector('meta[name="theme-color"]');
const BG = { abertura: '#F2ECE1', caju: '#FBE1CC', jabuticaba: '#E7DDF2', gengibre: '#F7F0C8', hibisco: '#F9D9E0', processo: '#DCE6F1', onde: '#DCE9DA' };

root.classList.add('js-ui');

// ---------- preloader ----------
const ldNum = document.getElementById('ld-num'), ldBar = document.getElementById('ld-bar'), loader = document.getElementById('loader');
const ld = { v: 0 };
let ready = false;
const draw = () => { ldNum.textContent = String(Math.round(ld.v)).padStart(3, '0'); ldBar.style.transform = `scaleX(${ld.v / 100})`; };
if (HAS_GSAP && !REDUCE) gsap.to(ld, { v: 86, duration: 1.5, ease: 'power2.out', onUpdate: draw });
function finishLoader() {
  if (ready) return; ready = true;
  const done = () => { loader.classList.add('is-done'); setTimeout(() => { document.body.classList.add('is-ready'); onScroll(); }, REDUCE ? 0 : 520); };
  if (HAS_GSAP && !REDUCE) gsap.to(ld, { v: 100, duration: .45, ease: 'power2.inOut', onUpdate: draw, onComplete: () => setTimeout(done, 150) });
  else { ld.v = 100; draw(); done(); }
}
addEventListener('site:ready', finishLoader, { once: true });
// frutas dos cartões (512 px, sombra pronta no arquivo): decodificadas antes de o tempo B entrar
addEventListener('site:ready', () => setTimeout(() => document.querySelectorAll('.fc-fruit').forEach(img => { img.loading = 'eager'; if (img.decode) img.decode().catch(() => {}); }), 1200), { once: true });
setTimeout(finishLoader, 4500);
if (root.classList.contains('no-webgl')) finishLoader();

// ---------- smooth scroll ----------
let lenis = null;
if (!REDUCE) {
  lenis = new Lenis({ lerp: .09, smoothWheel: true, wheelMultiplier: .9 });
  if (HAS_GSAP) { gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
  else { const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
}
// altura = 100vh (#vh-probe), a mesma régua da cena: no iPhone não muda quando a barra do Safari aparece/some
const vhProbe = document.getElementById('vh-probe');
let anchors = [], scY = scrollY, vw = innerWidth, vh = innerHeight;
const measure = () => { vw = innerWidth; vh = (vhProbe && vhProbe.offsetHeight) || innerHeight; anchors = secs.map(el => el.getBoundingClientRect().top + scrollY + (el.offsetHeight - vh) / 2); };
// navegação: a garrafa voa direto até a pose do sabor (scene.js) enquanto a página rola travada
function goTo(id) {
  const k = secs.findIndex(s => s.id === id); if (k < 0) return;
  measure();
  const y = Math.max(0, anchors[k]);
  if (REDUCE || !lenis) { scrollTo({ top: y, behavior: 'auto' }); return; }
  const dur = Math.min(2.2, 1.1 + Math.abs(Math.round(progress()) - k) * .22);
  window.dispatchEvent(new CustomEvent('fervo:fly', { detail: { to: k, dur } }));
  lenis.scrollTo(y, { duration: dur, lock: true, force: true });
}
document.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); goTo(a.dataset.goto); }));

// ---------- seção ativa (mesma régua da cena) ----------
let active = '', shown = null, fcK = -1;   // fcK: cartão do carrossel do celular que a garrafa mostra
function setActive(id) {
  if (id === active) return; active = id;
  document.body.dataset.sec = id;
  navLinks.forEach(a => { const on = a.dataset.goto === id; a.classList.toggle('is-active', on); a.toggleAttribute('aria-current', on); });
  if (themeMeta && BG[id]) themeMeta.setAttribute('content', BG[id]);
  fcK = -1;   // ao voltar ao final, o próximo arraste do carrossel volta a trocar a garrafa
  closeAll();
}
function progress() {
  const y = scY;
  if (y <= anchors[0]) return 0;
  for (let i = 0; i < anchors.length - 1; i++) if (y < anchors[i + 1]) return i + (y - anchors[i]) / Math.max(anchors[i + 1] - anchors[i], 1);
  return anchors.length - 1;
}
function onScroll() {
  if (!anchors.length) measure();
  const s = progress(), k = Math.round(s);
  setActive(secs[k].id);
  // cópia visível só no pouso (fora da janela da troca da cena)
  const on = Math.abs(s - k) < .2 && document.body.classList.contains('is-ready') ? secs[k] : null;
  if (on !== shown) { if (shown) shown.classList.remove('is-on'); if (on) { on.classList.add('is-on'); enterCards(on); } shown = on; }
}
addEventListener('scroll', () => { scY = scrollY; onScroll(); }, { passive: true });
addEventListener('resize', () => { measure(); onScroll(); });
addEventListener('load', () => { measure(); onScroll(); });
if (document.fonts) document.fonts.ready.then(() => { measure(); onScroll(); });
measure(); onScroll();

// ---------- CTA final: a tampinha salta (scene.js) ----------
const cta = document.getElementById('cta-onde');
if (cta) ['pointerenter', 'focus', 'click'].forEach(t => cta.addEventListener(t, () => window.dispatchEvent(new Event('fervo:pop'))));

// ---------- cartões: entram com mola e stagger, tilt 3D (máx. 8°) com brilho que segue o cursor,
// magnetismo leve no hover e squash no toque. Só transform; reduced-motion: sem tilt e sem mola ----------
const TILT = !REDUCE && matchMedia('(hover: hover) and (pointer: fine)').matches;
const KEYS = ['x', 'y', 'rx', 'ry', 's', 'sy'];
const cards = [...document.querySelectorAll('.blk-top.card, dl.blk > div, .flavors a, .cta, .top-cta, .fcard')].map(el => ({
  el, sec: el.closest('.sec'), rect: null, live: false, at: 0,
  p: { x: 0, y: 0, rx: 0, ry: 0, s: 1, sy: 1 }, v: { x: 0, y: 0, rx: 0, ry: 0, s: 0, sy: 0 }, t: { x: 0, y: 0, rx: 0, ry: 0, s: 1, sy: 1 }
}));
let cardsOn = false, lastT = 0;
function wake(c) { if (!c.live) c.el.classList.add('is-live'); c.live = true; if (!cardsOn) { cardsOn = true; lastT = 0; requestAnimationFrame(cardLoop); } }
function cardLoop(now) {
  const dt = lastT ? Math.min(.034, (now - lastT) / 1000) : 1 / 60; lastT = now;
  let any = false;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (!c.live) continue;
    any = true;
    if (now < c.at) continue;
    let moving = false;
    for (let k = 0; k < KEYS.length; k++) {
      const key = KEYS[k], w = 15, z = .48;
      c.v[key] += (-w * w * (c.p[key] - c.t[key]) - 2 * z * w * c.v[key]) * dt;
      c.p[key] += c.v[key] * dt;
      if (Math.abs(c.v[key]) > .002 || Math.abs(c.p[key] - c.t[key]) > .002) moving = true;
    }
    const p = c.p;
    c.el.style.transform = `perspective(700px) translate3d(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px,0) rotateX(${p.rx.toFixed(2)}deg) rotateY(${p.ry.toFixed(2)}deg) scale(${p.s.toFixed(4)},${(p.s * p.sy).toFixed(4)})`;
    if (!moving) { c.live = false; c.el.classList.remove('is-live'); }
  }
  if (any) requestAnimationFrame(cardLoop); else cardsOn = false;
}
function enterCards(sec) {
  if (REDUCE) return;
  const now = performance.now();
  let n = 0;
  for (const c of cards) {
    if (c.sec !== sec) continue;
    c.p.y = 30; c.p.s = .9; c.p.rx = 10; c.v.y = c.v.s = c.v.rx = 0;
    c.t.y = 0; c.t.s = 1; c.t.rx = 0;
    c.el.style.transform = 'perspective(700px) translate3d(0,30px,0) rotateX(10deg) scale(.9)';
    c.at = now + 380 + n++ * 75;
    wake(c);
  }
}
for (const c of cards) {
  const el = c.el;
  if (TILT) {
    el.addEventListener('pointerenter', () => { c.rect = el.getBoundingClientRect(); el.style.setProperty('--go', '1'); });
    el.addEventListener('pointermove', e => {
      const r = c.rect || (c.rect = el.getBoundingClientRect());
      const nx = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) - .5, ny = Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1) - .5;
      c.t.ry = nx * 16; c.t.rx = -ny * 16; c.t.x = nx * 10; c.t.y = ny * 8; c.t.s = 1.03;
      el.style.setProperty('--gx', `${((nx + .5) * 100).toFixed(1)}%`); el.style.setProperty('--gy', `${((ny + .5) * 100).toFixed(1)}%`);
      wake(c);
    });
    el.addEventListener('pointerleave', () => { c.rect = null; c.t.rx = c.t.ry = c.t.x = c.t.y = 0; c.t.s = 1; el.style.setProperty('--go', '0'); wake(c); });
  }
  if (!REDUCE) el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') { c.t.s = .97; wake(c); setTimeout(() => { c.t.s = TILT && c.rect ? 1.03 : 1; wake(c); }, 110); return; }
    c.t.s = 1.04; c.t.sy = .9; wake(c);
    setTimeout(() => { c.t.s = 1; c.t.sy = 1; wake(c); }, 130);
  });
}
addEventListener('scroll', () => { for (const c of cards) c.rect = null; }, { passive: true });

// ---------- cartões de sabor (seção final): viram em 3D (Enter/Espaço/clique), Esc desvira;
// passar o mouse ou focar troca a garrafa para aquele sabor (scene.js, evento fervo:preview) ----------
const preview = (flavor, fast) => window.dispatchEvent(new CustomEvent('fervo:preview', { detail: { flavor, fast } }));
document.querySelectorAll('.fcard').forEach(card => {
  const front = card.querySelector('.fcard-front'), back = card.querySelector('.fcard-back'), backBtn = card.querySelector('.fc-back');
  const set = (flipped, quiet) => {
    card.classList.toggle('is-flipped', flipped);
    front.setAttribute('aria-expanded', String(flipped)); front.setAttribute('aria-pressed', String(flipped));
    back.inert = !flipped; front.tabIndex = flipped ? -1 : 0;
    if (quiet) return;   // virada pelo botão "Ver onde achar": o foco fica no botão
    if (flipped) setTimeout(() => backBtn.focus({ preventScroll: true }), REDUCE ? 0 : 320);
    else front.focus({ preventScroll: true });
  };
  card._set = set;
  front.addEventListener('click', () => { set(true); preview(card.dataset.flavor, true); });
  backBtn.addEventListener('click', () => set(false));
  card.addEventListener('keydown', e => { if (e.key === 'Escape' && card.classList.contains('is-flipped')) { e.stopPropagation(); set(false); } });
  const off = () => setTimeout(() => {
    if (!document.querySelector('.fcard:hover') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.fcard'))) preview(null);
  }, 30);
  card.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') preview(card.dataset.flavor); });
  card.addEventListener('focusin', () => preview(card.dataset.flavor));
  card.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') off(); });
  card.addEventListener('focusout', off);
});
// celular: os cartões viram carrossel horizontal e a garrafa segue o cartão que está encaixando (troca já no meio do
// arraste). Antes valia o pointerenter do toque, que marcava o cartão onde o dedo COMEÇOU: a garrafa ficava um sabor atrás.
const fcWrap = document.getElementById('fcards'), fcs = fcWrap ? [...fcWrap.querySelectorAll('.fcard')] : [];
let fcPad = 0;
const fcMeasure = () => { if (fcWrap) fcPad = parseFloat(getComputedStyle(fcWrap).scrollPaddingLeft) || 0; };
if (fcWrap) {
  fcMeasure(); addEventListener('resize', fcMeasure);
  // só o arraste do usuário troca a garrafa (dedo no carrossel + 2 s de inércia/encaixe): o ajuste do scroll-snap ao
  // carregar também dispara scroll e trocava a garrafa sozinho
  let fcTouch = 0, fcX = 0;
  // posição do carrossel em "cartões" (0 = primeiro encaixado; o último encaixe pode ficar preso no fim da rolagem)
  const fcPos = () => {
    const max = fcWrap.scrollWidth - fcWrap.clientWidth, x = fcWrap.scrollLeft;
    const snap = i => Math.min(max, Math.max(0, fcs[i].offsetLeft - fcPad));
    for (let i = 0; i < fcs.length - 1; i++) { const a = snap(i), b = snap(i + 1); if (x < b) return i + Math.max(0, x - a) / Math.max(1, b - a); }
    return fcs.length - 1;
  };
  const fcUp = () => { fcTouch = performance.now() + 2000; };
  fcWrap.addEventListener('touchstart', () => {
    fcTouch = Infinity; fcX = fcWrap.scrollLeft;
    if (fcK < 0 && fcWrap.scrollWidth - fcWrap.clientWidth > 1) fcK = Math.round(fcPos());   // ponto de partida, sem trocar a garrafa
  }, { passive: true });
  fcWrap.addEventListener('touchend', fcUp, { passive: true }); fcWrap.addEventListener('touchcancel', fcUp, { passive: true });
  fcWrap.addEventListener('scroll', () => {
    if (performance.now() > fcTouch || fcWrap.scrollWidth - fcWrap.clientWidth < 2) return;   // só arraste; desktop é grade
    // antecipa: troca com 30% do caminho NO SENTIDO do movimento (indo para a direita só avança, voltando só recua:
    // sem isso, entre 30% e 70% a garrafa ficava alternando entre dois sabores)
    const x = fcWrap.scrollLeft, dir = Math.sign(x - fcX); fcX = x;
    if (!dir) return;
    const f = fcPos(), n = fcs.length - 1;
    const k = fcK < 0 ? Math.round(f) : dir > 0 ? Math.max(fcK, Math.min(n, Math.ceil(f - .3))) : Math.min(fcK, Math.max(0, Math.floor(f + .3)));
    if (k !== fcK) { fcK = k; preview(fcs[k].dataset.flavor, true); }
  }, { passive: true });
}

// ---------- hotspots (posição: scene.js) ----------
function closeAll(except) { hsBtns.forEach(b => { if (b !== except) b.setAttribute('aria-expanded', 'false'); }); }
function open(b) {
  closeAll(b);
  const r = b.getBoundingClientRect();
  b.classList.toggle('flip', r.left > innerWidth * .56);
  b.setAttribute('aria-expanded', 'true');
  b._t = performance.now();
}
hsBtns.forEach(b => {
  const label = b.querySelector('.hs-card b');
  if (label) b.setAttribute('aria-label', label.textContent);
  b.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = b.getAttribute('aria-expanded') === 'true';
    if (isOpen && performance.now() - (b._t || 0) > 350) b.setAttribute('aria-expanded', 'false'); else open(b);
  });
  b.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover)').matches) open(b); });
  b.addEventListener('mouseleave', () => { if (matchMedia('(hover: hover)').matches) b.setAttribute('aria-expanded', 'false'); });
  b.addEventListener('focus', () => open(b));
  b.addEventListener('blur', () => b.setAttribute('aria-expanded', 'false'));
});
addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
document.addEventListener('click', () => closeAll());

// ---------- "Ver onde achar" (seção final): vira os quatro cartões em cascata; de novo, desvira.
// Substitui o mailto: a página não expõe nenhum e-mail para robô de spam colher ----------
if (cta) cta.addEventListener('click', e => {
  e.preventDefault();
  const fc = [...document.querySelectorAll('.fcard')];
  const open = !fc.every(c => c.classList.contains('is-flipped'));
  fc.forEach((c, i) => setTimeout(() => c._set && c._set(open, true), REDUCE ? 0 : i * 90));
  cta.setAttribute('aria-expanded', String(open));
});
