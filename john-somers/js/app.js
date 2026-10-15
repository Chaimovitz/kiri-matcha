// John Somers: museu escuro, câmera que anda entre pedestais.
// Um relógio só (este rAF), Lenis para a roda, three r170 para as peças.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import Lenis from 'lenis';
import { caliceGeo, canecaGeo, carimbar, texturasPuncao, estanho, alcaP34B, LINHAS, CALICE_ALT } from './torno.js';

const html = document.documentElement, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ehMovel = () => innerWidth <= 820 || matchMedia('(hover: none) and (pointer: coarse)').matches;
let movel = ehMovel(); html.classList.toggle('toque', movel);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const rampa = (s, a, b) => clamp((s - a) / (b - a));
const amortece = (k, dt) => 1 - Math.exp(-k * dt); // independente de fps

// WhatsApp com a peça já escrita
$$('[data-wa]').forEach(a => { a.href = 'https://wa.me/5532999096000?text=' + encodeURIComponent(`Olá! Vi a peça ${a.dataset.wa} no site e gostaria de saber mais.`); });

const palco = $('#palco');
let liberado = false;
function liberar() { if (liberado) return; liberado = true; palco.classList.add('on'); } // o texto já está na tela; o 3D acende quando o 1º quadro existe

// ---------- rolagem ----------
const lenis = reduz ? null : new Lenis({ autoRaf: false, lerp: .1, smoothWheel: true, anchors: true });
if (reduz) $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => { const t = $(a.getAttribute('href')); if (t) { e.preventDefault(); t.scrollIntoView(); } }));
const topo = $('#topo'); let sAnt = 0;
function cabecalho(s) { // some ao descer (não briga com o texto), volta ao subir
  topo.classList.toggle('sobre', s > 40);
  if (s > innerHeight * .6 && s > sAnt + 3) topo.classList.add('some'); else if (s < sAnt - 3 || s < innerHeight * .6) topo.classList.remove('some');
  sAnt = s;
}

// ---------- vídeo da loja: só baixa e toca perto da tela ----------
const video = $('#loja video'), filme = $('.filme');
// o decodificador do vídeo inicializa com a página ociosa (no meio da rolagem ele custava um quadro de 100 ms na GPU integrada)
const preparaVideo = () => { if (video.preload !== 'auto') { video.preload = 'auto'; video.load(); } };
addEventListener('load', () => (window.requestIdleCallback || setTimeout)(preparaVideo, { timeout: 2500 }));
const ioVid = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { preparaVideo(); if (!reduz) video.play().catch(() => {}); }
  else video.pause();
}), { rootMargin: '10% 0px' });
ioVid.observe(video);


// ---------- acervo: filtro por categoria e reflexo metálico que segue o cursor ----------
const obras = $$('.obra'), filtros = $$('.filtros button');
function filtra(cat) {
  let vis = [];
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

// ---------- palco 3D ----------
const canvas = $('#gl');
let R = null;
try {
  R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' });
  if (!R.getContext()) throw new Error('sem contexto');
} catch (e) { R = null; }
function semTres() { html.classList.add('sem3d'); R = null; liberar(); }
if (!R) semTres();
else canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); semTres(); }, false);

const ancoras = {}; let trilho = []; const SECOES = { marca: $('#marca'), vitrine: $('#vitrine'), acervo: $('#acervo'), loja: $('#loja') };
const etq = { calice: $('[data-peca="calice"]'), jarra: $('[data-peca="jarra"]'), galhetas: $('[data-peca="galhetas"]'), caneca: $('[data-peca="caneca"]') };
const trilhaLi = $$('.trilha li'), arrasto = $('#arrasto'), fixoVit = $('#vitrine .fixo');

if (R) iniciar();
else laco2D();

function laco2D() { // sem WebGL: só a rolagem e o vídeo
  const q = t => { requestAnimationFrame(q); lenis?.raf(t); cabecalho(scrollY); };
  requestAnimationFrame(q);
}

function iniciar() {
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.12; // galeria clara, não breu
  R.setClearColor(0x171717, 1);
  const cena = new THREE.Scene();
  cena.fog = new THREE.Fog(0x171717, 10, 30);
  const cam = new THREE.PerspectiveCamera(28, 1, .04, 80);

  let envClaro = null;
  // ---- estúdio para os reflexos: caixas de luz num quarto escuro (HDR via PMREM) ----
  {
    const s = new THREE.Scene(), cx = new THREE.BoxGeometry(1, 1, 1);
    const sala = new THREE.Mesh(cx, new THREE.MeshBasicMaterial({ color: 0x353330, side: THREE.BackSide })); // sala carvão: reflexos claros e limpos sala.scale.set(30, 18, 30); s.add(sala);
    const L = (c, k, p, e) => { const m = new THREE.Mesh(cx, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) })); m.position.set(...p); m.scale.set(...e); s.add(m); };
    L(0xffffff, 7, [0, 8.5, 0], [12, .2, 6]);          // softbox de cima: o brilho longo nas peças
    L(0xfff0dc, 6, [-14.5, 2, 2], [.2, 10, 3]);        // tira quente à esquerda
    L(0xdfe8ff, 3, [14.5, 1.5, -3], [.2, 9, 2]);       // tira fria à direita
    L(0xffffff, 1.1, [0, 3, -14.5], [14, 6, .2]);      // painel de fundo: contorno em ângulo rasante
    L(0xffd9b0, 1.2, [0, .5, 14.5], [10, 3, .2]);      // rebatedor quente na frente
    L(0xfff7ee, 3.4, [-8.5, 2.5, 12.5], [7, 8, 1]);    // janela grande à frente e à esquerda: a prata clara das fotos
    L(0x2a2622, 1, [0, -8.8, 0], [30, .2, 30]);        // chão escuro: a base da peça "pesa"
    const pm = new THREE.PMREMGenerator(R); cena.environment = pm.fromScene(s, .02).texture;
    cena.environmentRotation.set(0, .5, 0);
    // estúdio claro só para as peças polidas (jarra, galhetas): a sala clara das fotos de catálogo, senão o metal espelhado fica preto
    sala.material.color.set(0x67635d);
    envClaro = pm.fromScene(s, .02).texture; pm.dispose();
  }
  const chave = new THREE.DirectionalLight(0xfff0dc, 1.6); chave.position.set(-4, 6, 5); cena.add(chave);
  const ceu = new THREE.HemisphereLight(0xfff4e8, 0x1c1a18, .6); cena.add(ceu); // luz ambiente difusa da galeria (madeira e pedestais)
  const recorte = new THREE.DirectionalLight(0xcbd8ff, 2.0); recorte.position.set(5, 3, -6); cena.add(recorte);
  const lanterna = new THREE.PointLight(0xfff1df, 0, 0, 2); cena.add(lanterna);

  // ---- texturas utilitárias (canvas) ----
  const tex = (w, h, f, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const texLado = tex(8, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a554e'); gr.addColorStop(.006, '#3a3631'); gr.addColorStop(.05, '#2a2826'); gr.addColorStop(.22, '#1e1d1c'); gr.addColorStop(1, '#171717'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const texSombra = tex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.96)'); gr.addColorStop(.3, 'rgba(0,0,0,.66)'); gr.addColorStop(.62, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
  const texMadeira = new THREE.TextureLoader().load('img/madeira.webp', t => R.initTexture(t)); texMadeira.colorSpace = THREE.SRGBColorSpace; texMadeira.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy());
  const matBaixo = new THREE.MeshBasicMaterial({ color: 0x171717 });
  const matCorpo = new THREE.MeshStandardMaterial({ map: texMadeira, color: 0x3a2219, roughness: .55, metalness: 0, envMapIntensity: .35 }); // corpo do pedestal em mogno
  // tampo de madeira escura envernizada (o verniz é o reflexo; o veio só aparece de perto)
  const matMadeira = new THREE.MeshPhysicalMaterial({ map: texMadeira, color: 0x5a3426, roughness: .5, metalness: 0, clearcoat: 1, clearcoatRoughness: .22, envMapIntensity: .45 }); // mogno avermelhado, como nas fotos
  const matMadeiraLado = new THREE.MeshStandardMaterial({ map: texMadeira, color: 0x46281d, roughness: .6, metalness: 0, envMapIntensity: .3 }); // de lado o verniz virava uma caixa cinza
  const matSombra = new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false, toneMapped: false });
  const tpP = texturasPuncao(R); let texParede = null; // texturas da punção: já existem (neutras) e se completam sozinhas

  // ---- as peças, cada uma num pedestal; a câmera anda em x ----
  const PECAS = [
    { id: 'calice', x: 0, alt: CALICE_ALT, larg: .78, ped: [1.7, 1.7], som: [1.0, 1.0], rot0: .55 },
    { id: 'jarra', x: 4.6, alt: 2.1, larg: 2.3, ped: [2.5, 2.5], som: [1.7, 1.5], rot0: -Math.PI / 2, lim: .55 },
    { id: 'galhetas', x: 9.4, alt: 1.35, larg: 2.5, ped: [3.1, 1.9], som: [2.7, 1.2], rot0: Math.PI / 2 },
    { id: 'caneca', x: 14, alt: 1.12, larg: 1.75, ped: [2.0, 2.0], som: [1.35, 1.3], rot0: -.6, balanco: .2 },
  ];
  const P = Object.fromEntries(PECAS.map(p => [p.id, p]));
  for (const p of PECAS) {
    p.base = new THREE.Group(); p.base.position.x = p.x; cena.add(p.base);
    const ped = new THREE.Mesh(new THREE.BoxGeometry(p.ped[0], 10, p.ped[1]), [matCorpo, matCorpo, matBaixo, matBaixo, matCorpo, matCorpo]); ped.position.y = -5.22; p.base.add(ped);
    const friso = new THREE.Mesh(new THREE.BoxGeometry(p.ped[0] + .07, .06, p.ped[1] + .07), matMadeiraLado); friso.position.y = -.19; p.base.add(friso); // moldura sob o tampo
    p.matTopo = matMadeira.clone(); // verniz próprio: some quando a câmera está em outro pedestal (de lado ele vira um reflexo cinza)
    const tg = new THREE.BoxGeometry(p.ped[0] + .14, .16, p.ped[1] + .14), tampo = new THREE.Mesh(tg, [matMadeiraLado, matMadeiraLado, p.matTopo, matBaixo, matMadeiraLado, matMadeiraLado]); tampo.position.y = -.08; p.base.add(tampo);
    { // cada tampo pega um trecho do veio; nas laterais o veio não estica (v na proporção da espessura)
      const uv = tg.attributes.uv, ox = (p.x * .13) % 1;
      for (let k = 0; k < uv.count; k++) { const lado = k < 8 || k >= 16; uv.setXY(k, uv.getX(k) * .5 + ox * .5, lado ? .3 + uv.getY(k) * .06 : uv.getY(k)); }
    }
    const som = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matSombra); som.rotation.x = -Math.PI / 2; som.position.y = .002; som.scale.set(p.som[0], p.som[1], 1); p.base.add(som);
    p.giro = new THREE.Group(); p.base.add(p.giro);
    p.rot0 = p.rot0 || 0; p.ang = p.rot0; p.vel = 0; p.toque = -9; p.fase = PECAS.indexOf(p) * 1.7;
  }

  // parede do fundo: a sala existe entre um pedestal e outro (luz lavando a parede atrás de cada peça)
  {
    const X0 = -30, X1 = 50, Y0 = -10, Y1 = 20, Wc = 2048, Hc = 512, px = Wc / (X1 - X0), py = Hc / (Y1 - Y0);
    const t = tex(Wc, Hc, (g, w, h) => {
      g.fillStyle = '#1c1b1a'; g.fillRect(0, 0, w, h);
      for (const p of PECAS) {
        const cx = (p.x - X0) * px, cy = (Y1 - 2.2) * py;
        g.save(); g.translate(cx, cy); g.scale(1, 2.3);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, 2.3 * px); gr.addColorStop(0, '#57504a'); gr.addColorStop(.5, '#302c28'); gr.addColorStop(1, 'rgba(27,26,25,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 2.3 * px, 0, Math.PI * 2); g.fill(); g.restore();
      }
    });
    const parede = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Y1 - Y0), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); // fora do ACES: o carvão sai como foi pintado
    parede.position.set((X0 + X1) / 2, (Y0 + Y1) / 2, -4.4); cena.add(parede); texParede = t;
  }

  // cálice: torno + punção na face da taça (ângulo 0 = de frente para +z)
  const CALICE_PUN = { ang: 0, y: 1.273, w: .22, h: .061, r: .345 };
  const SATIN = { cor: 0xbebbb4, rug: .23, linhas: 1 }; // estanho acetinado (cálice, caneca) como na foto da P34B
  function montaCalice(tp) {
    const g = caliceGeo(200); carimbar(g, CALICE_PUN);
    const m = new THREE.Mesh(g, estanho({ ...SATIN, punc: tp })); P.calice.giro.add(m); P.calice.malha = m;
  }

  // ---------- âncoras de rolagem e trilho da câmera ----------
  const tanMeio = () => Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  function enquadra(p, o) { // o: fill (altura na tela), sx/sy (deslocamento de lente), el (elevação), az, foco
    const t = tanMeio(), asp = cam.aspect;
    const dH = (p.alt / o.fill) / (2 * t), dW = (p.larg / (o.fillW || .8)) / (2 * t * asp);
    const d = Math.max(dH, dW) * (o.dz || 1), el = o.el ?? .1, az = o.az || 0;
    const tx = p.x, ty = p.alt * (o.foco ?? .5), tz = 0;
    return { px: tx + Math.sin(az) * Math.cos(el) * d, py: ty + Math.sin(el) * d, pz: Math.cos(az) * Math.cos(el) * d, tx, ty, tz, sx: o.sx || 0, sy: o.sy || 0 };
  }
  function perto(o) { // close na punção (o cálice está mirado: punção virada para +z)
    const c = CALICE_PUN, d = movel ? .92 : .58;
    return { px: 0, py: c.y + .03, pz: c.r + d, tx: 0, ty: c.y, tz: c.r, sx: o.sx || 0, sy: o.sy || 0 };
  }
  function medir() {
    const H = innerHeight, top = el => el.getBoundingClientRect().top + scrollY;
    const m = SECOES.marca, v = SECOES.vitrine, a = SECOES.acervo;
    Object.assign(ancoras, { H, m0: top(m), mh: m.offsetHeight - H, v0: top(v), vh: v.offsetHeight - H, a0: top(a), f0: top(filme), fh: filme.offsetHeight });
    const { m0, mh, v0, vh } = ancoras, M = movel;
    const heroi = M ? enquadra(P.calice, { fill: .26, fillW: .46, sy: .27, el: .12 }) : enquadra(P.calice, { fill: .66, sx: .17, el: .1 });
    const close = M ? perto({ sy: .2 }) : perto({ sx: .11 });
    const fimMarca = M ? enquadra(P.calice, { fill: .4, fillW: .6, sy: .22, el: .1 }) : enquadra(P.calice, { fill: .6, sx: -.17, el: .08 });
    const para = id => M ? enquadra(P[id], id === 'galhetas' ? { fill: .55, fillW: .95, sy: .08, el: .14 } : { fill: id === 'caneca' ? .5 : .42, fillW: .78, sy: .07, el: .12 }) : enquadra(P[id], { fill: { galhetas: .5, caneca: .48 }[id] || .6, fillW: .5, sx: .14, el: .1 });
    trilho = [
      { s: 0, c: heroi },
      { s: m0 + .04 * mh, c: heroi },
      { s: m0 + .36 * mh, c: close },
      { s: m0 + .70 * mh, c: close },
      { s: m0 + .88 * mh, c: fimMarca },
      { s: m0 + mh + .15 * H, c: fimMarca },
      { s: v0 + .12 * vh, c: para('jarra'), arco: 1 },
      { s: v0 + .34 * vh, c: para('jarra') },
      { s: v0 + .48 * vh, c: para('galhetas'), arco: 1 },
      { s: v0 + .70 * vh, c: para('galhetas') },
      { s: v0 + .84 * vh, c: para('caneca'), arco: 1 },
      { s: v0 + vh + H, c: para('caneca') },
    ];
    // janelas de cada peça na vitrine (etiqueta + arraste)
    ancoras.janelas = [[v0 + .10 * vh, v0 + .38 * vh], [v0 + .45 * vh, v0 + .74 * vh], [v0 + .81 * vh, v0 + vh + H]];
  }

  const camAtual = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, sx: 0, sy: 0 }, camAlvo = { ...camAtual };
  function camEm(s, out) {
    const K = trilho;
    if (s <= K[0].s) return Object.assign(out, K[0].c);
    for (let i = 0; i < K.length - 1; i++) {
      const a = K[i], b = K[i + 1];
      if (s <= b.s) {
        const t = ease(clamp((s - a.s) / (b.s - a.s || 1)));
        for (const k in out) out[k] = lerp(a.c[k], b.c[k], t);
        if (b.arco) { const k = Math.sin(Math.PI * t) * b.arco; out.pz += k * 1.4; out.py += k * .45; } // passo atrás entre pedestais
        return out;
      }
    }
    return Object.assign(out, K[K.length - 1].c);
  }

  // ---------- tamanho e resolução (orçamento de pixels + ajuste pelo tempo de quadro) ----------
  let W = 0, H = 0, qa = 1, dprAlvo = 1;
  function tamanho() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    movel = ehMovel(); html.classList.toggle('toque', movel);
    const orc = movel ? 2.0e6 : 2.4e6;
    dprAlvo = Math.min(devicePixelRatio || 1, 2, Math.sqrt(orc / (w * h)));
    R.setPixelRatio(dprAlvo * qa); R.setSize(w, h, false);
    W = w; H = h; cam.aspect = w / h; cam.fov = w / h < .8 ? 34 : 28; cam.updateProjectionMatrix();
    medir();
  }
  let rsz = 0; addEventListener('resize', () => { cancelAnimationFrame(rsz); rsz = requestAnimationFrame(tamanho); });
  addEventListener('load', () => medir());
  document.fonts?.ready.then(() => medir());
  tamanho();

  // ---------- entrada: mouse (luz) e arraste (giro) ----------
  let mx = 0, my = 0, lx = 0, ly = 0, temMouse = false;
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { temMouse = true; mx = e.clientX / W * 2 - 1; my = -(e.clientY / H * 2 - 1); } }, { passive: true });
  let pegando = null, px0 = 0, pt0 = 0, pecaArr = null;
  arrasto.addEventListener('pointerdown', e => { if (!pecaArr) return; pegando = e.pointerId; px0 = e.clientX; pt0 = performance.now(); pecaArr.toque = pt0; pecaArr.vel = 0; arrasto.classList.add('pega'); arrasto.setPointerCapture?.(e.pointerId); });
  arrasto.addEventListener('pointermove', e => {
    if (e.pointerId !== pegando || !pecaArr) return;
    const now = performance.now(), dx = e.clientX - px0, dtm = Math.max(16, now - pt0);
    let k = 1; const lim = pecaArr.lim; if (lim) { const dev = pecaArr.ang - pecaArr.rot0; if (Math.sign(dx) === Math.sign(dev) && Math.abs(dev) > lim * .7) k = Math.max(.06, 1 - (Math.abs(dev) - lim * .7) / (lim * .5)); } // borracha perto do limite
    pecaArr.ang += dx * .0105 * k; pecaArr.vel = lerp(pecaArr.vel, clamp(dx * .0105 * k / (dtm / 1000), -5, 5), .4); pecaArr.toque = now; px0 = e.clientX; pt0 = now; // inércia com teto: um peteleco não vira pião
  });
  const solta = e => { if (e.pointerId !== pegando) return; pegando = null; arrasto.classList.remove('pega'); if (pecaArr) pecaArr.toque = performance.now(); };
  arrasto.addEventListener('pointerup', solta); arrasto.addEventListener('pointercancel', solta);
  function areaArrasto(modo) { // posiciona a área de arraste sobre a peça
    if (arrasto.dataset.m === modo) return; arrasto.dataset.m = modo;
    const set = (x, y, w, h) => { arrasto.style.setProperty('--ax', x); arrasto.style.setProperty('--ay', y); arrasto.style.setProperty('--aw', w); arrasto.style.setProperty('--ah', h); };
    if (modo === 'off') { arrasto.classList.remove('on'); return; }
    arrasto.classList.add('on');
    if (movel) set('0px', '12%', '100%', modo === 'heroi' ? '40%' : '44%');
    else if (modo === 'heroi') set('52%', '12%', '40%', '76%');
    else set('46%', '10%', '46%', '78%');
  }

  // ---------- carregar as peças do scan (em segundo plano, depois do primeiro quadro) ----------
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder); const matsClaros = []; // materiais com o estúdio claro (giram junto com o ambiente)
  const carrega = url => new Promise((ok, err) => gl.load(url, ok, undefined, err));
  async function pecasDoScan() {
    const matScan = estanho({ cor: 0xdedbd4, rug: .21, linhas: .3, env: 1, envMap: envClaro }), tp = tpP; matsClaros.push(matScan); // jarra e galhetas: prata clara e polida, como nas fotos
    const [jarra, galhetas, perfil] = await Promise.all([carrega('models/jarra.glb'), carrega('models/galhetas.glb'), fetch('models/caneca-perfil.json').then(r => r.json())]);
    const encaixa = (p, obj, altBruta) => { obj.traverse(o => { if (o.isMesh) { o.material = matScan; o.frustumCulled = true; } }); obj.scale.setScalar(p.alt / altBruta); p.giro.add(obj); };
    const altura = o => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y;
    const kj = P.jarra.alt / altura(jarra.scene); encaixa(P.jarra, jarra.scene, altura(jarra.scene));
    jarra.scene.position.set(.0012 * kj, 0, -.0677 * kj); // eixo do corpo (medido no scan) no centro do giro
    encaixa(P.galhetas, galhetas.scene, altura(galhetas.scene));
    // caneca: corpo no torno (perfil do scan) + alça do scan, mesma escala
    const corpo = canecaGeo(perfil, P.caneca.alt, 200); carimbar(corpo, { ang: .25, y: .83, w: .32, h: .089 }); // com rot0 −.6 a alça vem uns 35° para a câmera e a punção fica à esquerda, como na foto a punção fica à esquerda e a alça a 3/4, como na foto
    // caneca inteira no estúdio claro: a face da fita olhava para o lado escuro da sala e a alça saía preta
    const matCorpo = estanho({ ...SATIN, punc: tp, envMap: envClaro, env: 1.15 }), matAlca = estanho({ ...SATIN, linhas: .4, envMap: envClaro, env: 1.25 }); matsClaros.push(matCorpo, matAlca);
    P.caneca.giro.add(new THREE.Mesh(corpo, matCorpo));
    P.caneca.giro.add(alcaP34B(perfil, P.caneca.alt, matAlca)); // a alça da P34B (o scan tinha inventado outra)
    // aquece: compila e sobe a geometria antes de a pessoa chegar na vitrine (nada novo na hora da rolagem)
    await R.compileAsync(cena, cam);
    // sobe a geometria desenhando 1 px NO PRÓPRIO canvas (um alvo fora da tela compila outra versão de cada shader: 600–870 ms de trava)
    const olho = new THREE.PerspectiveCamera(40, 1, .1, 100); olho.position.set(7, 3, 30); olho.lookAt(7, 1, 0); aquecer = olho;
    P.jarra.pronta = P.galhetas.pronta = P.caneca.pronta = true;
  }

  // ---------- quadro ----------
  let ult = performance.now(), mediaDt = 16.7, lentoDesde = 0, rapidoDesde = 0, ativo = -2, fase = '', aquecer = null;
  let iv = 16.7; const ivs = []; // intervalo real do relógio (60, 120, 40 ou 30 Hz em economia de energia)
  const v3 = new THREE.Vector3(), longe = new THREE.Vector3();
  function quadro(now) {
    requestAnimationFrame(quadro);
    const dt = Math.min(.05, (now - ult) / 1000); ult = now;
    lenis?.raf(now);
    const s = scrollY, A = ancoras;
    cabecalho(s);
    if (filme) { const rev = clamp((s + A.H - A.f0) / (A.H * .75)); filme.style.setProperty('--rev', reduz ? 1 : rev.toFixed(3)); }
    if (!R) return;
    const vis = s < A.a0 + 2; // o acervo (fundo sólido) já cobre o palco
    if (!vis) { areaArrasto('off'); return; }
    // peça e etiqueta somem juntas e terminam quando o topo do acervo encosta no pé da tela (no desktop, nada cruza o título que sobe)
    const saida = movel ? 1 - rampa(s, A.a0 - A.H * .95, A.a0 - A.H * .6) : 1 - rampa(s, A.a0 - A.H * 1.3, A.a0 - A.H);
    if (liberado && saida.toFixed(2) !== palco.dataset.o) { palco.dataset.o = saida.toFixed(2); const o = saida < 1 ? saida.toFixed(3) : ''; palco.style.opacity = o; fixoVit.style.opacity = o; fixoVit.style.pointerEvents = saida < .5 ? 'none' : ''; }

    // ---- parâmetros por trecho ----
    const { m0, mh, v0 } = A;
    const wPerto = rampa(s, m0 + .2 * mh, m0 + .36 * mh) * (1 - rampa(s, m0 + .7 * mh, m0 + .84 * mh));
    const wMira = rampa(s, m0 + .04 * mh, m0 + .34 * mh) * (1 - rampa(s, m0 + .8 * mh, m0 + .95 * mh));
    const novaFase = s >= m0 + .3 * mh && s < m0 + .78 * mh ? 'perto' : s >= m0 + .86 * mh && s < m0 + mh + A.H * .5 ? 'fim' : '';
    if (novaFase !== fase) { fase = novaFase; SECOES.marca.dataset.f = fase; etq.calice.classList.toggle('on', fase === 'fim'); }
    let novoAtivo = -1; A.janelas.forEach((j, i) => { if (s >= j[0] && s < j[1]) novoAtivo = i; });
    if (novoAtivo !== ativo) {
      ativo = novoAtivo; SECOES.vitrine.dataset.a = ativo; SECOES.vitrine.dataset.ini = s < A.janelas[0][0] ? 1 : 0;
      ['jarra', 'galhetas', 'caneca'].forEach((id, i) => etq[id].classList.toggle('on', i === ativo));
      trilhaLi.forEach((li, i) => li.classList.toggle('on', i === ativo));
    }
    const pecaAtiva = ativo >= 0 ? P[['jarra', 'galhetas', 'caneca'][ativo]] : (s < A.v0 ? P.calice : null);
    const modoArr = ativo >= 0 ? 'vit' : s < m0 + .02 * mh ? 'heroi' : 'off';
    areaArrasto(modoArr); pecaArr = modoArr === 'off' ? null : pecaAtiva;

    // ---- câmera ----
    camEm(s, camAlvo);
    const kc = reduz ? 1 : amortece(9, dt);
    for (const k in camAtual) camAtual[k] += (camAlvo[k] - camAtual[k]) * kc;
    const kl = amortece(4, dt);
    if (temMouse && !movel) { lx += (mx - lx) * kl; ly += (my - ly) * kl; }
    else { // sem mouse: a luz varre sozinha (no close, varre com a rolagem)
      const sw = wPerto > 0 ? Math.sin(rampa(s, m0 + .3 * mh, m0 + .72 * mh) * Math.PI * 2.4 - 1.2) : Math.sin(now / 1000 * .35) * .6;
      lx += (sw - lx) * kl; ly += ((wPerto > 0 ? .1 : .25) - ly) * kl;
    }
    const par = reduz || movel ? 0 : 1 - wPerto * .6;
    cam.position.set(camAtual.px + lx * .05 * par, camAtual.py + ly * .035 * par, camAtual.pz);
    cam.lookAt(camAtual.tx, camAtual.ty, camAtual.tz);
    cam.setViewOffset(W, H, -camAtual.sx * W, camAtual.sy * H, W, H);

    // ---- peças: giro automático, arraste com inércia, cálice mirando a punção ----
    for (const p of PECAS) {
      const visivel = Math.abs(p.x - camAtual.tx) < 9; if (!visivel) { p.base.visible = false; continue; }
      const solto = pegando === null || pecaArr !== p, ocioso = now - p.toque > 2400;
      if (solto) { p.ang += p.vel * dt; p.vel *= Math.exp(-2.6 * dt); }
      if (p.lim && solto) { const dev = p.ang - p.rot0; if (Math.abs(dev) > p.lim) { p.vel = 0; p.ang = lerp(p.ang, p.rot0 + Math.sign(dev) * p.lim, amortece(8, dt)); } }
      if (solto && ocioso && Math.abs(p.vel) < .4 && !(p === P.calice && wMira > .01)) { // volta devagar à melhor face e balança em volta dela
        const alvo0 = p.rot0 + (reduz ? 0 : Math.sin(now / 1000 * .32 + p.fase) * (p.balanco ?? .42));
        const alvo = alvo0 + Math.round((p.ang - alvo0) / (Math.PI * 2)) * Math.PI * 2;
        p.ang += (alvo - p.ang) * amortece(p === pecaAtiva ? 1.1 : 2.5, dt);
      }
      if (p === P.calice && wMira > 0) { // gira até a punção ficar de frente para a câmera
        const alvo = Math.round(p.ang / (Math.PI * 2)) * Math.PI * 2; p.ang += (alvo - p.ang) * amortece(6 * wMira, dt); p.vel *= 1 - wMira;
      }
      p.giro.rotation.y = p.ang;
      const parado = PECAS.some(q => Math.abs(q.x - camAtual.tx) < .3); p.base.visible = !parado || Math.abs(p.x - camAtual.tx) < .3;
      const dxc = Math.abs(p.x - camAtual.tx); p.matTopo.clearcoat = clamp(1.5 - dxc * .55, .1, 1); p.matTopo.envMapIntensity = clamp(.32 - dxc * .08, .06, .32); // nunca 0: não recompila
    }

    // ---- luz: rasante no close; no resto, segue o cursor ----
    if (wPerto > .001) {
      const c = CALICE_PUN;
      v3.set(Math.max(lx, movel ? -1 : -.3) * .2, c.y - .025 + ly * .07, c.r + .075); // o brilho cai em cima do carimbo
    } else v3.set(0, 0, 0);
    const pa = pecaAtiva || P.calice; longe.set(pa.x + lx * 1.5, pa.alt * .75 + ly * .7, 1.7);
    lanterna.position.copy(longe).lerp(v3, wPerto);
    lanterna.intensity = lerp(movel ? 1.2 : 1.6, .11, wPerto);
    cena.environmentIntensity = lerp(1.22, .62, wPerto); LINHAS.value = 1 - wPerto * .85;
    chave.intensity = 1.3 * (1 - wPerto * .85); recorte.intensity = 2.0 * (1 - wPerto * .6);
    cena.environmentRotation.y = .5 + (movel ? Math.sin(now / 1000 * .2) * .25 : lx * .45); // no celular não gira com a rolagem (a janela ia para trás)
    for (const m of matsClaros) m.envMapRotation.y = cena.environmentRotation.y;

    // ---- resolução adaptativa (o quadro parado e em movimento ficam iguais) ----
    // relativa ao relógio medido: tela de 40 Hz ou Chrome na bateria a 30 Hz não é GPU lenta
    if (ivs.length < 40) { ivs.push(dt * 1000); if (ivs.length === 40) iv = [...ivs].sort((a, b) => a - b)[20]; }
    mediaDt += ((dt * 1000) - mediaDt) * .05;
    if (ivs.length < 40) { /* medindo o relógio */ } else if (mediaDt > Math.max(23, iv * 1.35)) { if (!lentoDesde) lentoDesde = now; if (now - lentoDesde > 900 && qa > .62) { qa = Math.max(.62, qa * .86); R.setPixelRatio(dprAlvo * qa); R.setSize(W, H, false); lentoDesde = now; } } else lentoDesde = 0;
    if (ivs.length >= 40 && mediaDt < iv * 1.06 && qa < 1) { if (!rapidoDesde) rapidoDesde = now; if (now - rapidoDesde > 3500) { qa = Math.min(1, qa * 1.08); R.setPixelRatio(dprAlvo * qa); R.setSize(W, H, false); rapidoDesde = now; } } else rapidoDesde = 0;

    if (aquecer) { R.setScissorTest(true); R.setScissor(0, 0, 1, 1); R.render(cena, aquecer); R.setScissorTest(false); aquecer = null; }
    R.render(cena, cam);
    if (window.__dbg) window.__dbg({ qa, dpr: R.getPixelRatio(), dt: mediaDt });
  }

  // ---------- partida: compila tudo do cálice, desenha o 1º quadro, só então tira o véu ----------
  (async () => {
    const tp = tpP; montaCalice(tp);
    [texLado, texSombra, texParede, texMadeira, tp.nrm, tp.cor, tp.rug].forEach(t => R.initTexture(t));
    camEm(scrollY, camAtual); camEm(scrollY, camAlvo);
    await R.compileAsync(cena, cam);
    requestAnimationFrame(quadro);
    requestAnimationFrame(() => requestAnimationFrame(liberar));
    pecasDoScan().catch(e => console.warn('peças do scan', e));
  })();
}
