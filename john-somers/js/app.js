// John Somers: museu escuro. As peças do topo são FOTO REAL girando (giro.js: vídeo 360° all-intra, arrastar escolhe
// o quadro); o close da punção também é foto, com a luz rasante andando por cima.
// Um relógio só (este rAF) para a rolagem (Lenis), os giros, a vitrine e o 3D.
import Lenis from 'lenis';
import { Giro } from './giro.js?v=11';

const html = document.documentElement, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ehMovel = () => innerWidth <= 820 || matchMedia('(hover: none) and (pointer: coarse)').matches;
let movel = ehMovel(); html.classList.toggle('toque', movel);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ---------- WhatsApp com a peça já escrita ----------
const linkWa = peca => 'https://wa.me/5532999096000?text=' + encodeURIComponent(peca ? `Olá! Vi a peça ${peca} no site e gostaria de saber mais.` : 'Olá! Vi o site da John Somers e gostaria de saber mais.');
$$('[data-wa]').forEach(a => { a.href = linkWa(a.dataset.wa); });
const wa = $('#wa'), waPeca = $('#wa .wa-peca'); let waAtual;
const cobre = new Set(); // no acervo cada card tem o seu; no topo a compra já tem o botão do WhatsApp
const ioWa = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? cobre.add(e.target) : cobre.delete(e.target)); wa.classList.toggle('oculto', cobre.size > 0); }, { rootMargin: '0px 0px 15% 0px' });
[$('.obras'), $('#abertura .compra')].forEach(el => ioWa.observe(el));
const WA_PECAS = { calice: ['Cálice para vinho (P105D)', 'Cálice P105D'], jarra: ['Jarra para vinho (P437)', 'Jarra P437'], galhetas: ['Conjunto de galhetas (P506)', 'Galhetas P506'], caneca: ['Caneca inglesa (P34B)', 'Caneca P34B'] };
function waPara(id) {
  if (id === waAtual) return; waAtual = id; const p = WA_PECAS[id];
  wa.href = linkWa(p && p[0]); wa.setAttribute('aria-label', p ? `Perguntar no WhatsApp sobre ${p[1]}` : 'Falar com a loja no WhatsApp');
  wa.classList.add('troca'); setTimeout(() => { waPeca.textContent = p ? p[1] : 'Falar com a loja'; wa.classList.remove('troca'); }, 160);
}
waPara('jarra');

// ---------- rolagem ----------
const lenis = reduz ? null : new Lenis({ autoRaf: false, lerp: .1, wheelMultiplier: 1, touchMultiplier: 1.5, infinite: false, smoothWheel: true, anchors: true });
if (reduz) $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => { const t = $(a.getAttribute('href')); if (t) { e.preventDefault(); t.scrollIntoView(); } }));
const topo = $('#topo'); let sAnt = 0;
function cabecalho(s) { // some ao descer (não briga com o texto), volta ao subir
  topo.classList.toggle('sobre', s > 40);
  if (s > innerHeight * .6 && s > sAnt + 3) topo.classList.add('some'); else if (s < sAnt - 3 || s < innerHeight * .6) topo.classList.remove('some');
  sAnt = s;
}

// ---------- giros de foto real ----------
const giroHeroi = new Giro($('#abertura .giro'), { reduz });
const girosVit = $$('#vitrine .giro').map(el => new Giro(el, { reduz }));
const todosGiros = [giroHeroi, ...girosVit];
giroHeroi.carrega(); // o pôster já está na tela; o vídeo inteiro vem logo atrás
let vitPedida = false;
const pedeVitrine = () => { if (vitPedida) return; vitPedida = true; girosVit.reduce((p, g) => p.then(() => g.carrega()), Promise.resolve()); }; // um de cada vez, na ordem em que aparecem
giroHeroi.prom.finally(() => (window.requestIdleCallback || setTimeout)(pedeVitrine, { timeout: 3000 }));
new IntersectionObserver(([e]) => { if (e.isIntersecting) pedeVitrine(); }, { rootMargin: '100% 0px' }).observe($('#vitrine'));

// ---------- vitrine: o trilho anda de pedestal em pedestal ----------
const vit = $('#vitrine'), trilhoVit = $('.vit-trilho'), etqVit = $$('#vitrine .etiqueta'), trilhaLi = $$('.trilha li');
const IDS_VIT = girosVit.map(g => g.nome);
function posVit(p) { // pára em cada peça e anda entre elas (3 paradas, 2 travessias)
  const n = IDS_VIT.length, para = .2, anda = (1 - para * n) / (n - 1);
  for (let i = 0; i < n; i++) {
    if (p < para) return i; p -= para;
    if (i === n - 1) return i;
    if (p < anda) return i + ease(p / anda); p -= anda;
  }
  return n - 1;
}
let posAnt = -1, ativoVit = -1;
function vitrine(s, A) {
  const pos = reduz ? Math.round(posVit(clamp((s - A.v0) / A.vh)) ) : posVit(clamp((s - A.v0) / A.vh));
  if (Math.abs(pos - posAnt) > .0004) { trilhoVit.style.transform = `translate3d(${(-pos * A.passo).toFixed(1)}px,0,0)`; posAnt = pos; }
  const at = Math.abs(pos - Math.round(pos)) < .18 ? Math.round(pos) : -1; // etiqueta só com a peça parada
  if (at !== ativoVit) {
    ativoVit = at; vit.dataset.a = at;
    etqVit.forEach((e, i) => e.classList.toggle('on', i === at));
    trilhaLi.forEach((li, i) => li.classList.toggle('on', i === Math.round(pos)));
  }
  girosVit.forEach((g, i) => { g.ligado = Math.abs(pos - i) < .5; });
  return pos;
}

// ---------- a marca no metal: o close é foto; a luz rasante anda por cima dela ----------
const close = $('#marca .close'); let marcaNaTela = false, luzAnt = '';
new IntersectionObserver(([e]) => { marcaNaTela = e.isIntersecting; }, { rootMargin: '0px 0px -1px 0px' }).observe($('#marca'));
// luz: mouse no desktop, inclinação no celular, senão varre com a rolagem
let mx = 0, my = 0, temMouse = false, gx = 0, gy = 0, temGiro = false;
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { temMouse = true; mx = e.clientX / innerWidth * 2 - 1; my = -(e.clientY / innerHeight * 2 - 1); } }, { passive: true });
addEventListener('deviceorientation', e => { if (e.gamma == null) return; temGiro = true; gx = clamp(e.gamma / 28, -1, 1); gy = clamp((e.beta - 50) / 28, -1, 1); }, { passive: true });
let pediuGiro = false; // iPhone: a permissão do giroscópio só pode ser pedida num toque
addEventListener('pointerup', e => { if (e.pointerType !== 'touch' || pediuGiro || temGiro) return; pediuGiro = true; const D = window.DeviceOrientationEvent; if (D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => {}); }, { passive: true });

// ---------- vídeo da loja: só baixa e toca perto da tela ----------
const video = $('#loja video'), filme = $('.filme');
const preparaVideo = () => { if (video.preload !== 'auto') { video.preload = 'auto'; video.load(); } };
let vidNaTela = false;
const aquece = () => { preparaVideo(); if (reduz) return; video.play().then(() => { if (!vidNaTela) video.pause(); }).catch(() => {}); }; // toca e pausa fora da tela: o decodificador liga com a página parada (na hora de chegar custava 50–116 ms na UHD)
giroHeroi.prom.finally(() => (window.requestIdleCallback || setTimeout)(aquece, { timeout: 8000 }));
const ioVid = new IntersectionObserver(es => es.forEach(e => {
  vidNaTela = e.isIntersecting;
  if (e.isIntersecting) { preparaVideo(); if (!reduz) video.play().catch(() => {}); }
  else video.pause();
}), { rootMargin: '25% 0px' });
ioVid.observe(video);

// ---------- acervo: filtro por categoria e reflexo metálico que segue o cursor ----------
const obras = $$('.obra'), filtros = $$('.filtros button');
function filtra(cat) {
  const vis = [];
  obras.forEach(o => { const ok = cat === 'todas' || o.dataset.cat === cat; o.classList.toggle('fora', !ok); o.classList.remove('solo'); if (ok) vis.push(o); });
  if (vis.length % 2) vis[vis.length - 1].classList.add('solo'); // grade de 2 no celular sem peça órfã
  filtros.forEach(b => { const on = b.dataset.f === cat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
}
filtros.forEach(b => b.addEventListener('click', () => filtra(b.dataset.f)));
filtra('todas');
let reflexo = 0, alvoRef = null, ex = 0, ey = 0;
addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const o = e.target.closest && e.target.closest('.obra'); if (!o) return;
  alvoRef = o; ex = e.clientX; ey = e.clientY;
  if (!reflexo) reflexo = requestAnimationFrame(() => { reflexo = 0; const r = alvoRef.getBoundingClientRect(); alvoRef.style.setProperty('--rx', ((ex - r.left) / r.width).toFixed(3)); alvoRef.style.setProperty('--ry', ((ey - r.top) / r.width).toFixed(3)); });
}, { passive: true });

// ---------- medidas ----------
const A = {};
function medir() {
  const H = innerHeight, top = el => el.getBoundingClientRect().top + scrollY;
  const m = $('#marca'), v = $('#vitrine');
  Object.assign(A, { H, m0: top(m), mh: Math.max(1, m.offsetHeight - H), v0: top(v), vh: Math.max(1, v.offsetHeight - H), a0: top($('#acervo')), f0: top(filme) });
  A.passo = trilhoVit.firstElementChild.offsetWidth; posAnt = -1; // distância entre pedestais (75vw no desktop, a tela inteira no celular)
}
let rsz = 0;
addEventListener('resize', () => { cancelAnimationFrame(rsz); rsz = requestAnimationFrame(() => { movel = ehMovel(); html.classList.toggle('toque', movel); medir(); }); });
addEventListener('load', medir); document.fonts?.ready.then(medir);
medir();

// ---------- quadro ----------
let ult = performance.now(), lx = 0, ly = 0;
function quadro(now) {
  requestAnimationFrame(quadro);
  const dt = Math.min(.05, (now - ult) / 1000); ult = now;
  lenis?.raf(now);
  const s = scrollY;
  cabecalho(s);
  if (filme) { const rev = clamp((s + A.H - A.f0) / (A.H * .75)); filme.style.setProperty('--rev', reduz ? 1 : rev.toFixed(3)); }
  const pos = vitrine(s, A);
  for (const g of todosGiros) g.tick(now, dt);
  if (marcaNaTela) {
    const prog = clamp((s - A.m0) / A.mh);
    let ax, ay;
    if (temMouse && !movel) { ax = mx; ay = my; }
    else if (temGiro && movel) { ax = gx; ay = gy * .6 + .1; }
    else { ax = Math.sin(prog * Math.PI * 2.4 - 1.2); ay = .1; } // sem mouse: a luz varre a punção com a rolagem
    const k = reduz ? 1 : 1 - Math.exp(-4 * dt); lx += (ax - lx) * k; ly += (ay - ly) * k;
    const v = `${(.5 + lx * .32).toFixed(3)}|${(.48 - ly * .22).toFixed(3)}|${(1.06 - .06 * Math.min(1, prog / .5)).toFixed(4)}`; // a câmera chega um pouco e para
    if (v !== luzAnt) { luzAnt = v; const [a, b, z] = v.split('|'); close.style.setProperty('--lx', a); close.style.setProperty('--ly', b); close.style.setProperty('--z', reduz ? 1 : z); }
  }
  // WhatsApp: fala da peça que está na tela
  waPara(s < A.m0 - A.H * .5 ? 'jarra' : s < A.v0 - A.H * .5 ? 'calice' : s < A.a0 - A.H * .6 ? IDS_VIT[Math.round(pos)] : null);
}
requestAnimationFrame(quadro);
