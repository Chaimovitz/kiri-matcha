// Fervo · cena WebGL procedural. Uma garrafa long neck persistente percorre a página inteira:
// cada .sec define uma pose (posição, escala, inclinação, lado do rótulo) e cada troca de seção é uma volta
// inteira no eixo Y atrelada ao scroll (rotação acumulada = seção × 360°). Molas criticamente amortecidas levam a pose atual até a pose-alvo;
// a garrafa inclina na direção do movimento e o líquido interno balança contra a aceleração.
// Fundo opaco num único shader (pastel + splash + foto/ingrediente + título gigante + ilustração + sombra),
// que o vidro refrata. Contrato com ui.js: progresso pelos offsets das .sec, hotspots .hs[data-hs],
// eventos site:ready, fervo:fly {to} (navegação) e fervo:pop (CTA final).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('gl');
const root = document.documentElement;
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
// celular = tela estreita, ou ponteiro grosso SEM hover. Só "(pointer: coarse)" marcava como celular o notebook com tela
// touch do autor (o Chrome declara o toque como ponteiro principal) e o site inteiro caía nas opções de celular
const MOBILE = matchMedia('(max-width: 820px)').matches || (matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches);

// pose: x (fração da tela onde a garrafa cruza o título), xm (celular), sc (escala), tilt (graus, + = topo p/ esquerda),
// spin (graus): só o desvio do rótulo para o centro da tela. Cada troca de seção soma uma volta inteira (−360°),
// então a garrafa chega sempre de frente e o contrarrótulo passa pela câmera no meio do giro.
const FLAVORS = {
  // o título da abertura é o logotipo: minúsculas e o mesmo tracking do .brand (-.045em); tcap compensa a altura-x menor
  abertura:   { word: 'fervo',      ls: -.045, bg: '#F2ECE1', sp: '#D98A3A', ink: '#1E1A17', seed: .173, illo: 'cha',        liq: [1, .78, .4], pose: { x: .5,  xm: .5,  sc: 1.04, tilt: 0,   spin: 0, tcap: 1.12 } },
  caju:       { word: 'Caju',       bg: '#FBE1CC', sp: '#F2542D', ink: '#2B140C', seed: .531, illo: 'caju',       liq: [.98, .52, .24], pose: { x: .64, xm: .62, sc: 1,   tilt: 21,  spin: -12 },
    label: 'caju', ingr: 'Água, chá verde, açúcar demerara, polpa de caju prensada (18%) e cultura de fermentação.', kcal: 52, sug: '12,8', na: 9 },
  jabuticaba: { word: 'Jabuticaba', bg: '#E7DDF2', sp: '#5E2D8C', ink: '#1D1030', seed: .812, illo: 'jabuticaba', liq: [.62, .2, .38], pose: { x: .36, xm: .38, sc: 1,   tilt: -20, spin: 12 },
    label: 'jabuticaba', ingr: 'Água, chá verde, açúcar demerara, jabuticaba com casca (16%) e cultura de fermentação.', kcal: 59, sug: '14,6', na: 8 },
  gengibre:   { word: 'Gengibre',   bg: '#F7F0C8', sp: '#EDA21B', ink: '#2A2408', seed: .294, illo: 'gengibre',   liq: [1, .86, .46], pose: { x: .64, xm: .62, sc: 1,   tilt: 23,  spin: -12 },
    label: 'gengibre & limão-cravo', ingr: 'Água, chá verde, açúcar demerara, gengibre (4%), suco e raspa de limão-cravo (6%) e cultura de fermentação.', kcal: 42, sug: '10,3', na: 7 },
  hibisco:    { word: 'Hibisco',    bg: '#F9D9E0', sp: '#D6194F', ink: '#3A0A1A', seed: .667, illo: 'hibisco',    liq: [.95, .27, .34], pose: { x: .36, xm: .38, sc: 1,   tilt: -22, spin: 12 },
    label: 'hibisco', ingr: 'Água, chá verde, açúcar demerara, flor de hibisco (2%) e cultura de fermentação.', kcal: 46, sug: '11,4', na: 6 },
  processo:   { word: '9 dias',     bg: '#DCE6F1', sp: '#F8F4EA', ink: '#0F1B33', seed: .357, illo: 'pote',       liq: [1, .78, .4], pose: { x: .5,  xm: .5,  sc: .8,  tilt: 6,   spin: 0 }, foam: true },
  // final (uma tela só): garrafa em pé, grande, no centro-alto; cartão "Onde encontrar" à direita e os 4 cartões de sabor
  // embaixo — passar o mouse num cartão gira a garrafa e troca sabor, líquido e cores (fervo:preview). scs/tys = tela baixa.
  // ty/tym/tys = linha do título como fração da altura medida DE BAIXO para cima.
  onde:       { word: 'Saúde',      bg: '#DCE9DA', sp: '#2F7D4F', ink: '#10251A', seed: .418, illo: 'tampa',      liq: [1, .78, .4], pose: { x: .5,  xm: .5,  sc: .82, scs: .64, scm: .7, tilt: 0,   spin: 0, ty: .645, tys: .674, tym: .74, tcap: .62, spl: .62, stand: 1 } }
};
// ingredientes (fotos recortadas) por sabor: camadas de profundidade em volta da garrafa
const ING_SETS = {
  caju:       [['front', 'caju'], ['mid', 'caju'], ['small', 'caju']],
  jabuticaba: [['front', 'jabuticaba'], ['mid', 'jabuticaba'], ['small', 'jabuticaba']],
  gengibre:   [['front', 'gengibre-fatias'], ['mid', 'gengibre'], ['small', 'gengibre-fatias'], ['deep', 'gengibre-fatias']],
  hibisco:    [['front', 'hibisco-seco'], ['mid', 'hibisco'], ['small', 'hibisco-seco'], ['deep', 'hibisco-seco']]
};
// camada: dx (relativo à garrafa, espelha com o lado), y (fração de baixo p/ cima), z (profundidade), size (unid.), rot,
// blur, par (parallax), atraso na entrada, de onde entra (inO/inR) e para onde sai (outO/outR). m* = celular.
const LAYERS = {
  front: { dx: .33, y: .36, z: 1.3,  size: 1.45, rot: -16, blur: 1,   par: 1,   delay: 0,   inO: [.5, -.35], inR: 70,   outO: [.5, .3],   outR: -60,  mdx: .33, my: .47, msize: 1 },
  mid:   { dx: -.16, y: .43, z: -.38, size: .86, rot: 10,  blur: 0,   par: .45, delay: .08, inO: [0, .8],    inR: -150, outO: [-.1, .85], outR: 160,  mdx: -.3, my: .6,  msize: .74 },
  small: { dx: .15, y: .8,  z: .35,  size: .44, rot: 24,  blur: 0,   par: .65, delay: .16, inO: [.3, .5],   inR: 200,  outO: [.35, .45], outR: -200, mdx: .22, my: .9,  msize: .34 },
  deep:  { dx: .25, y: .5,  z: -.95, size: .36, rot: -28, blur: .35, par: .25, delay: .22, inO: [.3, -.5],  inR: -220, outO: [.35, -.4], outR: 180,  mdx: .32, my: .69, msize: .28 }
};
const BRAND_INGR = 'Água, chá verde, açúcar demerara, fruta prensada e cultura de fermentação. Fermentado 9 dias em tanque e de 48 a 96 h na garrafa.';

const FONT_D = '"Bricolage Grotesque", "Arial Black", sans-serif';
const FONT_T = '"Geist", system-ui, sans-serif';
const FONT_M = '"Geist Mono", ui-monospace, monospace';

let renderer = null;
try {
  // sem antialias/depth/stencil no framebuffer da tela: tudo é desenhado nos alvos dos compositores (que têm o próprio MSAA e
  // depth) e só o quadro final é copiado para o canvas — no iPhone em DPR 3 isso poupa ~100 MB de GPU
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('sem contexto');
} catch (e) { renderer = null; }
let lost = false;
// contexto WebGL perdido (iOS mata a GPU da aba quando a memória aperta): a página cai no modo sem 3D em vez de ficar morta
if (renderer) canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; fallback(); });
if (!renderer) fallback(); else init().catch(fallback);

function fallback() {
  root.classList.add('no-webgl');
  window.dispatchEvent(new Event('site:ready'));
}

async function init() {
  // marcas de tempo da inicialização (performance.getEntriesByType('mark') no console): custo de cada etapa
  const mark = n => performance.mark('fervo:' + n);
  mark('init');
  if (document.fonts) {
    const want = [`800 100px ${FONT_D}`, `500 40px ${FONT_M}`, `500 40px ${FONT_T}`].map(f => document.fonts.load(f, 'Saúde Jabuticaba ção 07 °C'));
    await Promise.race([Promise.all(want).catch(() => {}), new Promise(r => setTimeout(r, 3000))]);
  }

  const secs = [...document.querySelectorAll('#story .sec')];
  const list = secs.map((el, i) => {
    const f = FLAVORS[el.id] || FLAVORS.abertura;
    return { id: el.id, ...f, bgC: new THREE.Color(f.bg), spC: new THREE.Color(f.sp), inkC: new THREE.Color(f.ink), spinR: f.pose.spin * Math.PI / 180 - i * Math.PI * 2, tiltR: f.pose.tilt * Math.PI / 180 };
  });
  const N = list.length;
  const PROC = list.findIndex(f => f.id === 'processo'), LAST = N - 1;

  // ---------- renderer / cena ----------
  // QUALIDADE DINÂMICA. Parada (scroll, molas e giro em repouso há 150 ms): qualidade máxima — DPR até 2 (no celular
  // também: em DPR 3 os alvos MSAA/HalfFloat passavam de 1 GB e derrubavam o contexto WebGL), MSAA 4, transmissão 1:1,
  // dispersão .12, bloom de realces — num quadro só, e o WebGL para até haver movimento.
  // Em movimento: o MESMO vidro (transmissão 1:1 da resolução do movimento, dispersão ligada), MSAA 2 e bloom em meia
  // resolução, numa resolução que começa em 1,5 e sobe até a do quadro parado quando a rolagem segura 58 fps por 2 s (e desce
  // sozinha abaixo de 50). Pedido do autor em 08/10: "ela se mexendo na mesma qualidade de parada" — antes o movimento tinha
  // transmissão a 60% de 1,25 (o interior do vidro saía borrado) e sem dispersão; o que sobra de diferença é só MSAA e bloom.
  // Dois compositores e duas câmeras ficam prontos (o three guarda um alvo de transmissão por câmera): trocar de estado não recria nada.
  const DPR_DEV = window.devicePixelRatio || 1, DISP = .12, LQ_TS = 1;
  // altura de trabalho = 100vh (#vh-probe): no iPhone é o viewport grande e não muda quando a barra do Safari aparece ou
  // some — innerHeight mudava, o resize realocava os dois compositores (DPR 3) no meio da rolagem e a garrafa pulava
  const vhProbe = document.getElementById('vh-probe');
  const viewH = () => (vhProbe && vhProbe.offsetHeight) || innerHeight;
  // quadro máximo: DPR nativo até 2 e, em tela de DPR baixo (notebook 1,0–1,25), SUPERAMOSTRAGEM até 2 dentro de um
  // orçamento de 4 M pixels — o navegador reduz o canvas e gotas, texto do rótulo e serrilha da tampa saem mais nítidos.
  // Só o quadro parado paga isso; em movimento continua o compositor leve (lqDpr).
  // celular: DPR nativo até 3 dentro de 3,2 M pixels (iPhone 15 = 1179×2556 = 3,0 M); limitar a 2 deixava a tela "com
  // resolução merda" (08/10). A memória vem do MSAA 2 no celular e do canvas sem antialias/depth.
  const hqDpr = () => MOBILE
    ? Math.min(DPR_DEV, 3, Math.sqrt(3.2e6 / (innerWidth * viewH())))
    : Math.max(Math.min(DPR_DEV, 2), Math.min(2, Math.sqrt(4e6 / (innerWidth * viewH()))));
  // resolução do movimento (lqDpr): começa em 1,5 e segue os fps (sobe até hqDpr com 58 fps sustentados, desce abaixo de 50).
  // A do quadro parado (dpr) fica amarrada a ela: no máximo 0,35 acima — "a diferença não pode ser tão gritante" (08/10).
  // Numa GPU que sustenta 2,0 em movimento, parado e movimento ficam idênticos. No celular o parado é sempre o nativo até 2.
  // PISO do movimento no desktop: 1,5 — o autor prefere perder fps a perder nitidez ("mantenha a qualidade", 08/10). Abaixo
  // disso a garrafa em movimento ficava "feia e horrível" no notebook dele, onde a adaptação descia até 1,0.
  // CELULAR (08/10: "pro telefone ainda não está fluido"): o movimento começa em 1,5 e só sobe até 2; um nível que
  // já caiu abaixo de 52 fps vira teto (não fica subindo e caindo); o parado é sempre o nativo (até 3), sem amarrar ao movimento.
  const LQ_MIN = MOBILE ? 1.25 : 1.5;
  let lqDpr = Math.min(hqDpr(), 1.5), lqWant = lqDpr, lqTop = Infinity;
  const lqMax = () => Math.min(lqTop, MOBILE ? Math.min(dpr, 2) : dpr);
  // ?lq=1.75 na URL força a resolução do movimento (sem adaptação): para testar em máquina alheia sem republicar
  const LQ_FORCE = parseFloat(new URLSearchParams(location.search).get('lq')) || 0;
  if (LQ_FORCE > 0) lqDpr = lqWant = Math.min(3, LQ_FORCE);
  const stillDpr = () => MOBILE ? hqDpr() : Math.min(hqDpr(), lqDpr + .35);
  let dpr = stillDpr();
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, viewH(), false);
  // ?debug na URL: painel com fps, resolução em movimento/parada e qual compositor desenhou (para calibrar em máquina alheia)
  const dbg = /[?&]debug/.test(location.search) ? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'dbg' })) : null;
  let dbgFps = 0, dbgJs = 0, jsAcc = 0;
  const dbgShow = () => { if (dbg) dbg.textContent = `${dbgFps.toFixed(0)} fps em movimento · js ${dbgJs.toFixed(1)} ms/quadro\nmovimento ${lqDpr.toFixed(2)} · parado ${dpr.toFixed(2)} · tela ${DPR_DEV} · ${canvas.dataset.q || '-'} · ${MOBILE ? 'celular' : 'desktop'}\n${innerWidth}×${innerHeight}`; };
  // tone mapping Neutral aplicado no shader dos materiais 3D (vidro, rótulo, metal); o fundo pastel e as fotos ficam fiéis
  renderer.toneMapping = THREE.NoToneMapping;
  // r170 não tem transmissionResolutionScale: o alvo de transmissão segue camera.viewport (1:1 parada, 60% em movimento)
  renderer.setClearColor(list[0].bgC, 1);
  const ANISO = renderer.capabilities.getMaxAnisotropy();
  const NEUTRAL = /* glsl */`
    vec3 fervoNeutral(vec3 c){
      float x = min(c.r, min(c.g, c.b)), off = x < .08 ? x - 6.25*x*x : .04; c -= off;
      float peak = max(c.r, max(c.g, c.b)); if(peak < .76) return c;
      float d = .24, np = 1. - d*d/(peak + d - .76); c *= np/peak;
      return mix(c, vec3(np), 1. - 1./(.15*(peak - np) + 1.));
    }`;
  const neutralTM = (m, key) => {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NEUTRAL)
        .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = fervoNeutral(gl_FragColor.rgb);');
    };
    m.customProgramCacheKey = () => 'fervo-' + key;
    return m;
  };

  const scene = new THREE.Scene();
  const FOV = 30, TANH = Math.tan(FOV / 2 * Math.PI / 180);
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, .1, 60);
  camera.position.set(0, 0, 6.5);
  scene.add(camera);
  const camLo = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, .1, 60);
  camLo.viewport = new THREE.Vector4();
  const mkComposer = (cam, samples, half) => {
    const c = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples }));
    c.addPass(new RenderPass(scene, cam));
    const b = new UnrealBloomPass(new THREE.Vector2(256, 256), .28, .3, .985);
    if (half) { const set = b.setSize.bind(b); b.setSize = (w, h) => set(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2))); }
    c.addPass(b); c.addPass(new OutputPass());
    return c;
  };
  const composer = mkComposer(camera, MOBILE ? 2 : 4, false), composerLo = mkComposer(camLo, 2, true);   // celular: MSAA 2 em DPR 3 já basta
  const sizeLo = () => {
    const w = innerWidth, h = viewH();
    composerLo.setPixelRatio(lqDpr); composerLo.setSize(w, h);
    camLo.viewport.set(0, 0, Math.max(1, Math.round(w * lqDpr * LQ_TS)), Math.max(1, Math.round(h * lqDpr * LQ_TS)));
  };

  // estúdio próprio: cúpula escura + softboxes altas e estreitas (faixas verticais no vidro) + dois rim lights atrás
  {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = vP.y*.5 + .5; gl_FragColor = vec4(mix(vec3(.035, .03, .028), vec3(.34, .32, .3), smoothstep(.15, .95, h)), 1.); }'
    })));
    const box = (x, y, z, w, h, k, look) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      m.material.color.setScalar(k); m.position.set(x, y, z); m.lookAt(look ? look : new THREE.Vector3(0, y, 0)); env.add(m);
    };
    box(-6.5, 1, 7.5, 2.1, 16, 12);          // key: faixa larga à esquerda
    box(7.2, 1, 5.8, .7, 16, 8);             // fill: faixa fina à direita
    box(-5.2, 1, -6.5, .55, 16, 20);         // rim esquerdo (borda)
    box(5.6, 1, -6, .55, 16, 18);            // rim direito (borda)
    box(0, 11, 1, 7, 2.4, 4, new THREE.Vector3(0, 0, 0));   // teto suave
    scene.environment = pmrem.fromScene(env, .012).texture;
    pmrem.dispose();
  }
  mark('env');

  // texturas de imagem (ingrediente atrás do título, foto do Processo): carregam depois do 1º quadro
  const texLoader = new THREE.TextureLoader();
  // ImageBitmap: a decodificação do WebP sai da thread principal (o <img> decodificava na hora do upload, no meio
  // das primeiras trocas). Safari < 17 e qualquer erro caem no TextureLoader
  const UA = navigator.userAgent, BITMAP = typeof createImageBitmap === 'function' && !(/^((?!chrome|android).)*safari/i.test(UA) && !/Version\/(1[7-9]|[2-9]\d)/.test(UA));
  const bmpLoader = BITMAP ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'premultiply' }) : null;
  const imgTex = url => {
    const t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
    t.userData.url = url; t.userData.req = false;
    return t;
  };
  const requestTex = t => {
    if (!t || t.userData.req) return; t.userData.req = true;
    const viaImg = () => texLoader.load(t.userData.url, tex => { t.image = tex.image; t.needsUpdate = true; renderer.initTexture(t); forceDraw = 3; }, undefined, () => {});
    if (!bmpLoader || !t.premultiplyAlpha) { viaImg(); return; }
    // o ImageBitmap já vem invertido e pré-multiplicado (o WebGL ignora flipY/premultiply nesse caso)
    bmpLoader.load(t.userData.url, bmp => { t.image = bmp; t.flipY = false; t.premultiplyAlpha = false; t.needsUpdate = true; renderer.initTexture(t); forceDraw = 3; }, undefined, viaImg);
  };

  // ---------- garrafa de vidro flint (cm; 1 cm = 0,1 unidade) ----------
  // garrafinha ATARRACADA de suco/kombucha, 355 ml, 17,2 cm com a tampa: corpo cilíndrico Ø 6,6 até 10,6 cm, ombro curto
  // e redondo (10,6→13,3), gargalo curto e largo Ø 3,5, anel de vidro (transfer bead) Ø 3,9 sob o lacre e rosca de 38 mm
  // até a boca larga. A proporção baixa (altura ≈ 2,6 × largura; vinho é ≈ 4) e a tampa grande são o que faz ela ler
  // como garrafa pequena de suco, não como garrafa de vinho. Fundo grosso (0,95 cm) com refração forte.
  const CM = .1, FILL = 14.0, TOP = 17.2, MID = 8.6, CROSS = 6.4, TOPC = 17.25;
  const R_BODY = 3.3, R_NECK = 1.75, R_FIN = 1.76, R_BEAD = 1.95, BEAD0 = 15.0, BEAD1 = 15.32, LIP = BEAD1 + 1.77, LIPR = .12;
  const SH0 = 10.6, SH1 = 13.3, BASE_IN = .95;
  const bump = (y, c, w) => Math.exp(-((y - c) / w) * ((y - c) / w));
  const sm5 = x => x * x * x * (x * (x * 6 - 15) + 10);
  const rOut = y => {
    if (y < .7) { const k = 1 - y / .7; return R_BODY - .7 * (1 - Math.sqrt(Math.max(0, 1 - k * k))); }
    if (y < SH0) return R_BODY;
    // ombro curto em S: sai do corpo e chega no gargalo com tangente vertical (ombro redondo de garrafinha)
    if (y < SH1) { const k = (y - SH0) / (SH1 - SH0); return R_NECK + (R_BODY - R_NECK) * (1 - sm5(k)); }
    const rn = R_NECK - .03;
    if (y < BEAD0) return R_NECK - .03 * (y - SH1) / (BEAD0 - SH1);
    if (y < BEAD1) {
      const k = (y - BEAD0) / (BEAD1 - BEAD0), base = rn + (R_FIN - rn) * sm5(k);
      return base + (R_BEAD - base) * Math.pow(Math.sin(Math.PI * k), .6);
    }
    return R_FIN + .05 * bump(y, BEAD1 + .36, .06) + .055 * (bump(y, BEAD1 + .82, .06) + bump(y, BEAD1 + 1.1, .06) + bump(y, BEAD1 + 1.38, .06));
  };
  const prof = [];
  // fundo: domo côncavo (push-up) e anel de apoio
  for (let i = 0; i <= 28; i++) { const r = 2.6 * i / 28; prof.push(new THREE.Vector2(r, .02 + .4 * (1 - Math.pow(r / 2.6, 2)))); }
  prof.push(new THREE.Vector2(2.75, 0));
  for (let y = .015; y < LIP - LIPR;) {
    prof.push(new THREE.Vector2(rOut(y), y));
    y += y < .7 ? .02 : y < SH0 - .2 ? .5 : y < SH1 + .2 ? .05 : y < BEAD0 - .15 ? .25 : y < BEAD1 + .05 ? .01 : .02;
  }
  // boca: canto arredondado e bocal largo Ø ~29 mm (dentro da tampa)
  for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI / 2; prof.push(new THREE.Vector2(R_FIN - LIPR + LIPR * Math.cos(a), LIP - LIPR + LIPR * Math.sin(a))); }
  prof.push(new THREE.Vector2(1.45, LIP));
  const rAt = y => {
    for (let k = 1; k < prof.length; k++) {
      const a = prof[k - 1], b = prof[k];
      if (a.y > 1 && ((a.y <= y && b.y >= y) || (a.y >= y && b.y <= y))) return a.x + (b.x - a.x) * ((y - a.y) / ((b.y - a.y) || 1));
    }
    return 1.3;
  };
  const SEG = 256;
  // casca única (DoubleSide): a parede de trás entra pelo passe de transmissão; sem parede interna (evita contorno escuro)
  const shell = prof;
  const V_OUT = 1;

  const thick = (() => {
    const data = new Uint8Array(shell.length * 4);
    // espessura pelo raio, menor onde a superfície inclina (ombro, base): refração crível sem faixa deslocada
    shell.forEach((p, i) => {
      const a = shell[Math.max(i - 1, 0)], b = shell[Math.min(i + 1, shell.length - 1)];
      const dr = b.x - a.x, dy = b.y - a.y, nx2 = dy * dy / (dr * dr + dy * dy || 1);
      const v = p.y < BASE_IN + .1 ? 255 : Math.round(Math.min(p.x / R_BODY, 1) * nx2 * 120); data.set([v, v, v, 255], i * 4);
    });
    const t = new THREE.DataTexture(data, 1, shell.length);
    t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
  })();

  // ---------- CONDENSAÇÃO real: bake procedural na GPU (Worley multiescala), 4096 no desktop e 2048 no celular ----------
  // coordenadas físicas: x = volta (cm, fecha sem emenda), y = altura (cm). Saída em 2 texturas (MRT):
  //  [0] rg = normal das gotas grandes (2–5 mm) e médias (lentes) · ba = normal da névoa de microgotas
  //  [1] r = cobertura das gotas · g = borda escura embaixo da gota · b = realce no topo · a = densidade da névoa
  // Rastros antigos (limpos), costuras do molde. As gotas que escorrem são analíticas no shader do vidro (com tempo).
  const COND = MOBILE ? 2048 : 4096;
  const condRT = new THREE.WebGLRenderTarget(COND, COND, { count: 2, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  condRT.textures.forEach(tx => { tx.anisotropy = ANISO; tx.wrapS = THREE.RepeatWrapping; tx.colorSpace = THREE.NoColorSpace; tx.channel = 1; });
  {
    const GL_COND = /* glsl */`
      precision highp float;
      in vec2 vUv;
      layout(location = 0) out vec4 oN;
      layout(location = 1) out vec4 oF;
      uniform float uC, uH, uPx;
      float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .103, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f*f*(3. - 2.*f);
        return mix(mix(h21(i), h21(i + vec2(1., 0.)), u.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), u.x), u.y); }
      // uma camada de gotas: células de s cm (colunas inteiras na volta), prob. de existir, raio, achata embaixo (gravidade)
      void layer(vec2 p, float s, float prob, float r0, float r1, float lid, inout float bh, inout vec2 bn, inout vec3 bq){
        float nc = floor(uC / s + .5), sx = uC / nc;
        vec2 g = vec2(p.x / sx, p.y / s), gi = floor(g);
        for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
          vec2 c = gi + vec2(float(i), float(j)), cw = vec2(mod(c.x, nc), c.y) + lid * 31.7;
          if(h21(cw * 1.37) > prob) continue;
          float r = mix(r0, r1, pow(h21(cw * 2.91 + 4.1), 2.2));
          vec2 ctr = (c + .2 + .6 * h22(cw)) * vec2(sx, s);
          vec2 d = p - ctr; d.x -= uC * floor(d.x / uC + .5);
          float ey = d.y < 0. ? d.y / (r * 1.08) : d.y / (r * .9);
          float q = (d.x * d.x) / (r * r) + ey * ey;
          if(q >= 1.) continue;
          float h = sqrt(1. - q) * r;
          if(h > bh){ float Rs = 1.3, den = sqrt(max(Rs * Rs - q, .05)); bh = h; bn = vec2(d.x / r, ey) / den; bq = vec3(q, d.x / r, ey); }
        }
      }
      void main(){
        vec2 p = vec2(vUv.x * uC, vUv.y * uH);
        // densidade: frio abaixo do nível do líquido, menos no ar do gargalo; nada no fundo
        float dens = smoothstep(.35, 1.2, p.y) * (1. - .55 * smoothstep(${(SH1 + .4).toFixed(2)}, ${BEAD0.toFixed(2)}, p.y));
        dens *= .85 + .3 * vn(p * vec2(.9, .5));
        // rastros antigos: escorridas que já passaram (limpas), cada uma termina numa gota parada
        float trail = 0.; float th = 0.; vec2 tn = vec2(0.); vec3 tq = vec3(1.);
        for(int k = 0; k < 9; k++){
          float fk = float(k), x0 = h21(vec2(fk, 7.)) * uC, yT = ${(SH0 * .57).toFixed(2)} + ${(SH0 * .5).toFixed(2)} * h21(vec2(fk, 3.)), yB = 1.5 + ${(SH0 * .33).toFixed(2)} * h21(vec2(fk, 5.));
          float dx = p.x - x0 - (.08 * sin(p.y * 1.7 + fk) + .03 * sin(p.y * 4.7 + fk * 2.));
          dx -= uC * floor(dx / uC + .5);
          float w = .1 + .05 * h21(vec2(fk, 9.)) + .02 * sin(p.y * 6. + fk);
          float inY = step(yB, p.y) * smoothstep(yT, yT - .6, p.y);
          trail = max(trail, (1. - smoothstep(w * .7, w, abs(dx))) * inY);
          // a gota que parou no fim do rastro
          float rr = .15 + .06 * h21(vec2(fk, 11.)), ey = (p.y - yB + rr * .2) / (rr * 1.15), q = dx * dx / (rr * rr) + ey * ey;
          if(q < 1. && sqrt(1. - q) * rr > th){ th = sqrt(1. - q) * rr; tn = vec2(dx / rr, ey) / sqrt(max(1.69 - q, .05)); tq = vec3(q, dx / rr, ey); }
        }
        float bh = 0.; vec2 bn = vec2(0.); vec3 bq = vec3(1.);
        layer(p, .95, .5 * dens, .10, .25, 1., bh, bn, bq);          // grandes, esparsas (2–5 mm)
        layer(p, .34, .78 * dens, .035, .085, 2., bh, bn, bq);       // médias
        layer(p, .21, .55 * dens, .03, .06, 5., bh, bn, bq);
        bh *= 1. - trail; bn *= 1. - trail;
        if(th > bh){ bh = th; bn = tn; bq = tq; }
        // névoa de microgotas (some num halo em volta das gotas grandes e nos rastros)
        float fh = 0.; vec2 fn = vec2(0.); vec3 fq = vec3(1.);
        layer(p, uPx * 9., .92, uPx * 1.6, uPx * 3.6, 3., fh, fn, fq);
        layer(p, uPx * 5., .8, uPx * 1.1, uPx * 2.2, 4., fh, fn, fq);
        float fog = dens * (1. - trail) * (1. - step(.0001, bh));
        // costuras do molde (u = .25 e .75)
        float seam = 0.; for(int k = 0; k < 2; k++){ float sx = (.25 + .5 * float(k)) * uC, dd = p.x - sx; seam += dd / .03 * exp(-dd * dd / .0009) * .35; }
        float cover = step(.0001, bh);
        float rim = cover * smoothstep(.55, 1., bq.x) * smoothstep(.15, -.6, bq.z);
        float hi = cover * exp(-((bq.y + .32) * (bq.y + .32) + (bq.z - .45) * (bq.z - .45)) * 14.);
        oN = vec4(clamp((bn + vec2(seam, 0.)) * .5 + .5, 0., 1.), clamp(fn * fog * .5 + .5, 0., 1.));
        oF = vec4(cover, rim, hi, fog);
      }`;
    const bake = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
      uniforms: { uC: { value: 2 * Math.PI * R_BODY }, uH: { value: TOPC }, uPx: { value: 2 * Math.PI * R_BODY / COND * (MOBILE ? 1.6 : 1) } },
      vertexShader: 'in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: GL_COND
    }));
    // em 8 faixas (scissor do alvo): cada draw fica curto e uma GPU integrada não estoura o tempo-limite do driver (TDR)
    // num quadro só de 16 M pixels com os loops das gotas — era um candidato a "o site crasha" na abertura
    const bcam = new THREE.Camera(), NS = 8;
    for (let s = 0; s < NS; s++) {
      condRT.scissor.set(0, Math.floor(COND * s / NS), COND, Math.ceil(COND / NS)); condRT.scissorTest = true;
      renderer.setRenderTarget(condRT); renderer.render(bake, bcam);
    }
    condRT.scissorTest = false; renderer.setRenderTarget(null);
    bake.geometry.dispose(); bake.material.dispose();
  }
  mark('condensacao');
  // gotas que escorrem (6–10): descem devagar com travadas e arrancadas, a cabeça é uma lente, o rastro fica limpo e
  // volta a embaçar; analíticas (tempo uCT), em coordenadas do vidro (cm)
  const condU = { uCondF: { value: condRT.textures[1] }, uCT: { value: 0 } };
  const GL_RUN = /* glsl */`
    float hh1(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
    void runDrops(vec3 p, float t, inout float trail, inout float hd, inout vec2 hn, inout float rim, inout float hi){
      float ang = atan(p.x, p.z), rr = length(p.xz);
      for(int i = 0; i < 8; i++){
        float fi = float(i), per = 26. + 10. * hh1(fi * 3.7), off = hh1(fi * 9.1);
        float cyc = floor(t / per + off), s = (t / per + off - cyc) * per;
        float sd = fi * 13.7 + cyc * 7.31;
        float a0 = (hh1(sd) * 2. - 1.) * 3.14159, y0 = ${(SH0 * .62).toFixed(2)} + ${(SH0 * .5).toFixed(2)} * hh1(sd + 1.), v = .22 + .3 * hh1(sd + 2.), w = 1.1 + 1.4 * hh1(sd + 3.);
        float rh = .11 + .08 * hh1(sd + 4.);
        float yh = y0 - v * (s - .8 / w * sin(w * s)) - rh;
        float da = ang - a0; da -= 6.28318 * floor((da + 3.14159) / 6.28318);
        float dx = da * rr - (.07 * sin(p.y * 1.9 + sd) + .03 * sin(p.y * 4.3 + sd * 1.7));
        if(abs(dx) > .45) continue;
        float life = smoothstep(0., 1.5, s) * smoothstep(1., 1.5, yh);
        float dy = p.y - yh, ey = dy > 0. ? dy / (rh * 1.35) : dy / (rh * 1.05);
        float q = dx * dx / (rh * rh) + ey * ey;
        if(q < 1. && life > .02){
          float h = sqrt(1. - q) * life;
          if(h > hd){
            hd = h; hn = vec2(dx / rh, ey) / sqrt(max(1.5625 - q, .04)) * life;
            rim = smoothstep(.6, 1., q) * smoothstep(.1, -.5, ey) * life;
            hi = exp(-((dx / rh + .3) * (dx / rh + .3) + (ey - .42) * (ey - .42)) * 16.) * life;
          }
        }
        if(dy > 0. && p.y < y0){
          float age = dy / max(v, .05), wd = rh * (.55 + .15 * sin(p.y * 7. + sd));
          trail = max(trail, (1. - smoothstep(wd * .55, wd, abs(dx))) * exp(-age / 14.) * smoothstep(0., .8, s) * smoothstep(1., 1.4, p.y));
        }
      }
    }`;

  // vidro FLINT (incolor; verde-água levíssimo onde é grosso) com o líquido dentro: o plano de nível (no mundo) separa
  // líquido e ar e balança (slosh). O líquido absorve como Beer-Lambert: mais escuro no centro (caminho longo) e mais
  // claro nas bordas finas; a cor do sabor é a protagonista.
  const liqU = {
    uLiqP: { value: new THREE.Vector3() }, uLiqN: { value: new THREE.Vector3(0, 1, 0) },
    uWave: { value: 0 }, uLTime: { value: 0 }, uLiqTint: { value: new THREE.Color().setRGB(1, .86, .52) }, uFoamK: { value: 0 }
  };
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: .05, metalness: 0, transmission: 1, ior: 1.52, dispersion: DISP,
    thickness: 4, thicknessMap: thick, attenuationColor: new THREE.Color('#EEF9F4'), attenuationDistance: 9,
    clearcoat: 1, clearcoatRoughness: .02, specularIntensity: 1, envMapIntensity: 1.6,
    normalMap: condRT.textures[0], normalScale: new THREE.Vector2(1, 1), side: THREE.DoubleSide
  });
  glassMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, liqU, condU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLoc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uLiqP, uLiqN, uLiqTint; uniform float uWave, uLTime, uFoamK, uCT; uniform sampler2D uCondF; varying vec3 vLoc;
        ${GL_RUN}`)
      // condensação: lê os mapas, soma as gotas que escorrem e decide rugosidade (névoa .35, rastro/gota .02)
      .replace('#include <roughnessmap_fragment>', `
        vec4 cN = texture2D(normalMap, vNormalMapUv), cF = texture2D(uCondF, vNormalMapUv);
        float rTrail = 0., rH = 0., rRim = 0., rHi = 0.; vec2 rN = vec2(0.);
        runDrops(vLoc, uCT, rTrail, rH, rN, rRim, rHi);
        float onDrop = step(.001, rH);
        float cCover = max(cF.r * (1. - rTrail), onDrop);
        float cFog = cF.a * (1. - rTrail) * (1. - onDrop);
        vec2 cNxy = mix((cN.rg * 2. - 1.) * (1. - rTrail), rN, onDrop) + (cN.ba * 2. - 1.) * (1. - rTrail) * .55;
        float cRim = max(cF.g * (1. - rTrail), rRim), cHi = max(cF.b * (1. - rTrail), rHi);
        float roughnessFactor = mix(mix(.02, .35, cFog), .025, cCover);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = normalize(vec3(cNxy * normalScale, 1.));
        normal = normalize(tbn * mapN);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.clearcoat *= (1. - .9 * cCover) * (1. - .55 * cFog);`)
      .replace('#include <transmission_fragment>', `#include <transmission_fragment>
        {
          float lh = dot(vWorldPosition - uLiqP, uLiqN);
          vec3 tg = normalize(cross(uLiqN, vec3(0., 0., 1.)) + vec3(1e-4, 0., 0.));
          lh -= uWave * sin(dot(vWorldPosition, tg) * 42. + uLTime * 8.5) + uWave * .45 * sin(dot(vWorldPosition, tg) * 97. - uLTime * 11.);
          float liq = (1. - smoothstep(-.0025, .0025, lh)) * smoothstep(${(BASE_IN - .04).toFixed(2)}, ${(BASE_IN + .04).toFixed(2)}, vLoc.y);
          float foam = smoothstep(-.006 - .012 * uFoamK, -.0015, lh) * liq * (.25 + .75 * uFoamK);
          vec3 nV = normalize(normal);
          float ndv = abs(dot(nV, normalize(vViewPosition)));
          if(gl_FrontFacing){
            // Beer-Lambert pelo caminho dentro do líquido: centro longo (escuro), borda curta (clara)
            vec3 absorb = pow(max(uLiqTint, vec3(.002)), vec3(mix(.3, 1.75, ndv)));
            vec3 tint = mix(vec3(1.), absorb, liq);
            tint = mix(tint, vec3(1.06, 1.03, .96), foam * .6);
            totalDiffuse *= tint;
            totalDiffuse += vec3(1., .96, .88) * exp(-lh * lh / 3.2e-5) * .32 * step(.001, liq + foam);
            // luz atravessando a bebida: brilho colorido no lado da softbox e nas bordas; realce estreito da parede interna
            vec3 glowC = uLiqTint * uLiqTint;
            float rimL = pow(1. - ndv, 2.), key = exp(-pow((nV.x + .55) / .3, 2.)), spec = exp(-pow((nV.x + .3) / .05, 2.));
            totalDiffuse += (glowC * (rimL * .3 + key * .22) + vec3(1., .98, .93) * spec * .16) * liq * (1. - foam);
            // flint: verde-água levíssimo onde o vidro é grosso (fundo e silhueta) e linha do fundo de vidro
            float thickG = smoothstep(${(BASE_IN + .05).toFixed(2)}, .2, vLoc.y) + pow(1. - ndv, 3.) * .5;
            totalDiffuse *= mix(vec3(1.), vec3(.86, .97, .93), clamp(thickG, 0., 1.) * .55);
            totalDiffuse *= 1. - .25 * exp(-pow((vLoc.y - ${BASE_IN.toFixed(2)}) / .05, 2.));
            totalDiffuse *= mix(.88, 1., smoothstep(.02, .4, ndv));
          } else totalDiffuse *= mix(vec3(1.), pow(max(uLiqTint, vec3(.002)), vec3(.2)), liq);
          // gota: borda escura fina embaixo e realce forte no topo
          totalDiffuse *= 1. - .55 * cRim;
          totalSpecular += vec3(1.) * cHi * .55;
        }`);
  };
  neutralTM(glassMat, 'glass');

  const rig = new THREE.Group(), spin = new THREE.Group(), bottle = new THREE.Group();
  scene.add(rig); rig.add(spin); spin.add(bottle);
  bottle.scale.setScalar(CM); bottle.position.y = -MID * CM;
  {
    const g = new THREE.LatheGeometry(shell, SEG), pos = g.attributes.position, uv1 = new Float32Array(pos.count * 2);
    for (let k = 0; k < pos.count; k++) { uv1[k * 2] = Math.floor(k / shell.length) / SEG; uv1[k * 2 + 1] = pos.getY(k) / TOPC; }   // u = volta, v = altura (cm)
    g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    bottle.add(new THREE.Mesh(g, glassMat));
  }

  // ---------- rótulo (frente) e contrarrótulo (verso), troca de conteúdo por varredura no shader ----------
  const LBL = { r: R_BODY + .05, y: 5.9, L: THREE.MathUtils.degToRad(150) };
  LBL.h = LBL.r * LBL.L / 2;                       // proporção 2:1 = canvas 4096×2048 sem distorcer
  // rótulo 2048×1024: uma textura por CONTEÚDO (marca + 4 sabores, frente e verso = 10), todas desenhadas na abertura e
  // nunca redesenhadas. Redesenhar 4096×2048 (32 MB) a cada hover era a trava da seção final. 2048 basta: no close do
  // desktop em DPR 2 o rótulo tem ~900 px de largura na tela e o arco visível da textura tem ~850 texels.
  const LW = 2048, LH = 1024;
  const LTEX = new Map();
  const blankTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); blankTex.needsUpdate = true;
  const paperN = (() => {
    const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'), img = x.createImageData(n, n), d = img.data, h = new Float32Array(n * n), rr = mulberry32(31);
    for (let i = 0; i < n * n; i++) h[i] = rr();
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n * n; i++) h[i] = (h[i] * 2 + h[(i + 1) % (n * n)] + h[(i + n) % (n * n)]) / 4;
    for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) {
      const i = y * n + xx, dx = h[y * n + (xx + 1) % n] - h[i], dy = h[((y + 1) % n) * n + xx] - h[i];
      const l = Math.hypot(dx * 6, dy * 6, 1);
      d[i * 4] = (-dx * 6 / l * .5 + .5) * 255; d[i * 4 + 1] = (-dy * 6 / l * .5 + .5) * 255; d[i * 4 + 2] = (1 / l * .5 + .5) * 255; d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3);
    return t;
  })();
  // mapa de rugosidade (g) e metal (b) do rótulo: papel fosco com variação e foil dourado no logo
  const orm = side => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const x = c.getContext('2d'), k = 1024 / 1400, rr = mulberry32(41 + side);
    x.fillStyle = 'rgb(0,170,0)'; x.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 4000; i++) { const g = 150 + rr() * 40 | 0; x.fillStyle = `rgb(0,${g},0)`; x.fillRect(rr() * 1024, rr() * 512, 1 + rr() * 2, 1 + rr() * 2); }
    x.scale(k, k); x.fillStyle = 'rgb(0,64,235)'; x.textBaseline = 'alphabetic';
    if (side === 0) { x.textAlign = 'center'; x.font = `800 150px ${FONT_D}`; if ('letterSpacing' in x) x.letterSpacing = '-6px'; x.fillText('fervo', 700, 172); }
    else { x.textAlign = 'left'; x.font = `800 64px ${FONT_D}`; if ('letterSpacing' in x) x.letterSpacing = '-2px'; x.fillText('fervo', 200, 104); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = ANISO;
    return t;
  };
  const labelMats = [0, 1].map(side => {
    const m = new THREE.MeshStandardMaterial({ map: blankTex, roughness: 1, metalness: 1, roughnessMap: orm(side), envMapIntensity: 1, normalMap: paperN, normalScale: new THREE.Vector2(.3, .3), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    m.metalnessMap = m.roughnessMap;
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', `
          #include <map_fragment>
          // papel levemente úmido e mais escuro nas bordas (a condensação encosta no rótulo)
          float eD = min(min(vMapUv.x, 1. - vMapUv.x) * ${(LBL.r * LBL.L).toFixed(2)}, min(vMapUv.y, 1. - vMapUv.y) * ${LBL.h.toFixed(2)});
          float wet = 1. - smoothstep(.04, .3, eD + .1 * (sin(vMapUv.x * 61.) * sin(vMapUv.y * 37.) + sin(vMapUv.x * 23. + vMapUv.y * 41.)));
          diffuseColor.rgb *= 1. - .17 * wet;`);
    };
    return neutralTM(m, 'label');
  });
  const paperBack = new THREE.MeshStandardMaterial({ color: '#E3D9C7', roughness: .85, side: THREE.BackSide });
  const paperEdge = neutralTM(new THREE.MeshStandardMaterial({ color: '#EFE7DA', roughness: .8, side: THREE.DoubleSide }), 'edge');
  [0, 1].forEach(side => {
    const g = new THREE.CylinderGeometry(LBL.r, LBL.r, LBL.h, 192, 1, true, side * Math.PI - LBL.L / 2, LBL.L);
    const front = new THREE.Mesh(g, labelMats[side]), back = new THREE.Mesh(g, paperBack);
    front.position.y = back.position.y = LBL.y;
    front.renderOrder = 2;
    bottle.add(front, back);
    // espessura do papel nas duas bordas verticais
    for (const a of [side * Math.PI - LBL.L / 2, side * Math.PI + LBL.L / 2]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(LBL.r - R_BODY + .01, LBL.h), paperEdge);
      edge.position.set(Math.sin(a) * (R_BODY + LBL.r) / 2, LBL.y, Math.cos(a) * (R_BODY + LBL.r) / 2);
      edge.rotation.y = a + Math.PI / 2;
      bottle.add(edge);
    }
  });

  // cinta do gargalo: anel de 360° (texto que fecha a volta sem emenda), um pouco maior que o vidro,
  // polygonOffset contra z-fighting e bordas retas com espessura de papel
  const NY0 = 13.55, NY1 = 14.65, NR = rAt((NY0 + NY1) / 2) + .045;
  const neckCv = document.createElement('canvas'); neckCv.width = 4096; neckCv.height = Math.round(4096 * (NY1 - NY0) / (2 * Math.PI * NR));
  {
    const c = neckCv.getContext('2d'), H2 = neckCv.height;
    c.fillStyle = '#fff'; c.fillRect(0, 0, 4096, H2);
    c.fillStyle = '#4a4a4a'; c.font = `500 ${Math.round(H2 * .3)}px ${FONT_M}`; c.textBaseline = 'middle';
    if ('letterSpacing' in c) c.letterSpacing = `${Math.round(H2 * .05)}px`;
    const unit = 'FERVO · FERMENTADO NA GARRAFA · ', uw = c.measureText(unit).width, n = Math.max(1, Math.round(4096 / uw));
    c.save(); c.scale(4096 / (uw * n), 1);
    for (let i = 0; i < n; i++) c.fillText(unit, i * uw, H2 / 2);
    c.restore();
    c.fillRect(0, H2 * .1, 4096, Math.max(3, H2 * .025)); c.fillRect(0, H2 * .875, 4096, Math.max(3, H2 * .025));
  }
  const neckTex = new THREE.CanvasTexture(neckCv); neckTex.colorSpace = THREE.SRGBColorSpace; neckTex.anisotropy = ANISO; neckTex.wrapS = THREE.RepeatWrapping;
  const neckMat = neutralTM(new THREE.MeshStandardMaterial({ map: neckTex, roughness: .55, color: list[0].spC.clone(), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'neck');
  {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(NR, NR, NY1 - NY0, 256, 1, true), neckMat);
    band.position.y = (NY0 + NY1) / 2; band.renderOrder = 2;
    bottle.add(band);
    const rimMat = neutralTM(new THREE.MeshStandardMaterial({ color: '#F1EADF', roughness: .8, side: THREE.DoubleSide }), 'rim');
    for (const y of [NY0, NY1]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(rAt(y) - .01, NR, 256, 1), rimMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = y;
      bottle.add(ring);
    }
  }

  // ---------- tampa de rosca de alumínio (ROPP de 38 mm, como kombucha/suco), no MESMO grupo da garrafa, opaca ----------
  // Ø 3,9 × 1,86 cm: topo plano com chanfro, serrilha de ~120 estrias nos 3,3 mm de cima (normal map), 3 anéis de rosca
  // rebaixados na saia (geometria) e o lacre de 4,2 mm embaixo, separado por picote (24 rasgos com pontes). O lacre é
  // uma malha à parte presa ao gargalo: no CTA a tampa desrosqueia e ele fica.
  // O desenho foi feito para Ø 2,94 com a base do lacre a 21,72 cm: cr() escala os raios e cy() desloca as alturas.
  const CK = 1.95 / 1.47, CDY = (BEAD1 + .04) - 21.72;
  const cr = r => r * CK, cy = y => y + CDY;
  const CAP_Y0 = cy(21.7), CAP_H = 1.86, R_CAP = cr(1.47), CAPY = cy(22.6);
  const capV = y => (y - CAP_Y0) / CAP_H;   // v da textura = altura (mesmo mapa para corpo e lacre)
  const capTexW = MOBILE ? 1024 : 2048, capTexH = MOBILE ? 256 : 512;
  const [capCol, capN] = (() => {
    const w = capTexW, h = capTexH, rowOf = y => Math.round((1 - capV(y)) * h);   // flipY
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    // sombra suave no fundo dos anéis de rosca
    for (const y of [cy(22.36), cy(22.64), cy(22.92)]) { const g = x.createLinearGradient(0, rowOf(y + .05), 0, rowOf(y - .05)); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.5, 'rgba(0,0,0,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, rowOf(y + .05), w, rowOf(y - .05) - rowOf(y + .05)); }
    // picote: 24 rasgos escuros com pontes
    x.fillStyle = 'rgb(18,18,18)';
    const r0 = rowOf(cy(22.142)), r1 = rowOf(cy(22.104));
    for (let k = 0; k < 24; k++) x.fillRect((k / 24 + .006) * w, r0, w / 24 * .74, Math.max(1, r1 - r0));
    // normal map: serrilha (estrias com o mesmo passo da tampa pequena) + flocos sutis do alumínio pintado
    const n = x.createImageData(w, h), d = n.data, rr = mulberry32(31), NK = Math.round(90 * CK);
    const k0 = rowOf(cy(23.5)), k1 = rowOf(cy(23.17));
    for (let yy = 0; yy < h; yy++) {
      const inK = yy >= k0 && yy <= k1 ? Math.min(1, (yy - k0) / 3, (k1 - yy) / 3) : 0;
      for (let xx = 0; xx < w; xx++) {
        const ph = (xx / w) * NK * Math.PI * 2, sx = inK * .85 * Math.sin(ph);
        const i = (yy * w + xx) * 4, l = Math.hypot(sx, 1);
        d[i] = (sx / l * .5 + .5) * 255; d[i + 1] = 128; d[i + 2] = (1 / l * .5 + .5) * 255; d[i + 3] = 255;
      }
    }
    for (let f = 0; f < w * h * .012; f++) {
      const fx = rr() * (w - 2) | 0, fy = rr() * (h - 2) | 0, ax = (rr() - .5) * 60, ay = (rr() - .5) * 60;
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((fy + oy) * w + fx + ox) * 4; d[i] = Math.max(0, Math.min(255, d[i] + ax)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + ay)); }
    }
    // poucas gotas de condensação no metal (lentes pequenas)
    const pxU = w / (2 * Math.PI * R_CAP), pxV = h / CAP_H;
    for (let g = 0; g < (MOBILE ? 22 : 34); g++) {
      const cx = rr() * w, cyy = rowOf(cy(21.8) + rr() * 1.35), rc = .045 + Math.pow(rr(), 2) * .07, ax = rc * pxU, ay = rc * pxV * 1.1;
      for (let yy = Math.floor(cyy - ay); yy <= cyy + ay; yy++) for (let xx = Math.floor(cx - ax); xx <= cx + ax; xx++) {
        if (yy < 0 || yy >= h) continue;
        const dx = (xx - cx) / ax, dy = (yy - cyy) / ay, q = dx * dx + dy * dy; if (q >= 1) continue;
        const den = Math.sqrt(1.69 - q), nx = dx / den, ny = -dy / den, l = Math.hypot(nx, ny, 1), i = (yy * w + ((xx % w) + w) % w) * 4;
        d[i] = (nx / l * .5 + .5) * 255; d[i + 1] = (ny / l * .5 + .5) * 255; d[i + 2] = (1 / l * .5 + .5) * 255;
      }
    }
    const nc = document.createElement('canvas'); nc.width = w; nc.height = h; nc.getContext('2d').putImageData(n, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; t.wrapS = THREE.RepeatWrapping;
    const tn = new THREE.CanvasTexture(nc); tn.colorSpace = THREE.NoColorSpace; tn.anisotropy = ANISO; tn.wrapS = THREE.RepeatWrapping;
    return [t, tn];
  })();
  // topo: "f" em baixo relevo discreto e um degrau concêntrico perto da borda
  const [capTopMap, capTopN] = (() => {
    const n = MOBILE ? 512 : 1024, c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, n, n);
    x.fillStyle = 'rgba(0,0,0,.07)'; x.font = `800 ${n * .5}px ${FONT_D}`; x.textAlign = 'center'; x.fillText('f', n / 2, n * .68);
    const hs = 256, hc = document.createElement('canvas'); hc.width = hc.height = hs;
    const hx = hc.getContext('2d'); hx.fillStyle = '#fff'; hx.fillRect(0, 0, hs, hs);
    hx.filter = 'blur(2.5px)'; hx.fillStyle = '#000'; hx.font = `800 ${hs * .5}px ${FONT_D}`; hx.textAlign = 'center'; hx.fillText('f', hs / 2, hs * .68);
    hx.filter = 'none'; hx.strokeStyle = '#000'; hx.lineWidth = 2.5; hx.beginPath(); hx.arc(hs / 2, hs / 2, hs * .44, 0, 6.2832); hx.stroke();
    const hd = hx.getImageData(0, 0, hs, hs).data, nc = document.createElement('canvas'); nc.width = nc.height = hs;
    const nx = nc.getContext('2d'), out = nx.createImageData(hs, hs), od = out.data, Hh = i => hd[i * 4] / 255;
    for (let yy = 0; yy < hs; yy++) for (let xx = 0; xx < hs; xx++) {
      const i = yy * hs + xx, dx = Hh(yy * hs + Math.min(xx + 1, hs - 1)) - Hh(yy * hs + Math.max(xx - 1, 0)), dy = Hh(Math.min(yy + 1, hs - 1) * hs + xx) - Hh(Math.max(yy - 1, 0) * hs + xx);
      const l = Math.hypot(dx * 2.2, dy * 2.2, 1);
      od[i * 4] = (-dx * 2.2 / l * .5 + .5) * 255; od[i * 4 + 1] = (dy * 2.2 / l * .5 + .5) * 255; od[i * 4 + 2] = (1 / l * .5 + .5) * 255; od[i * 4 + 3] = 255;
    }
    nx.putImageData(out, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
    const tn = new THREE.CanvasTexture(nc); tn.colorSpace = THREE.NoColorSpace; tn.anisotropy = ANISO;
    return [t, tn];
  })();
  // alumínio pintado na cor do sabor: metálico com flocos, verniz alto (os realces correm pelos anéis e pela serrilha)
  const capMat = neutralTM(new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, color: list[0].spC.clone(), map: capCol, normalMap: capN, normalScale: new THREE.Vector2(1, 1), metalness: .7, roughness: .26, clearcoat: 1, clearcoatRoughness: .05, clearcoatNormalMap: capN, clearcoatNormalScale: new THREE.Vector2(.7, .7), envMapIntensity: 1.3 }), 'cap');
  const capTopMat = neutralTM(new THREE.MeshPhysicalMaterial({ color: list[0].spC.clone(), map: capTopMap, normalMap: capTopN, normalScale: new THREE.Vector2(.8, .8), metalness: .7, roughness: .24, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.3 }), 'captop');
  const cap = new THREE.Group();
  {
    const lathe = (pts, seg) => {
      const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y - CAPY)), seg);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let k = 0; k < p.count; k++) uv.setY(k, capV(p.getY(k) + CAPY));
      return g;
    };
    const P = pts => pts.map(([r, y]) => [cr(r), cy(y)]);
    // corpo (perfil de baixo para cima: normais para fora). Sulcos de rosca: 3 gaussianas de 0,55 mm.
    const body = P([[1.44, 22.152], [1.455, 22.156], [1.466, 22.17]]);
    for (let y = cy(22.19); y < cy(23.495); y += .01) body.push([R_CAP - .055 * (bump(y, cy(22.36), .035) + bump(y, cy(22.64), .035) + bump(y, cy(22.92), .035)), y]);
    body.push(...P([[1.468, 23.505], [1.463, 23.522], [1.452, 23.538], [1.436, 23.549], [1.415, 23.555]]));
    cap.add(new THREE.Mesh(lathe(body, 256), capMat));
    const top = new THREE.Mesh(new THREE.CircleGeometry(cr(1.415), 128), capTopMat);
    top.rotation.x = -Math.PI / 2; top.position.y = cy(23.555) - CAPY;
    cap.add(top);
    // vedante (só aparece com a tampa no ar)
    const liner = new THREE.Mesh(new THREE.CircleGeometry(cr(1.44), 96), neutralTM(new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: .7 }), 'liner'));
    liner.rotation.x = Math.PI / 2; liner.position.y = cy(23.53) - CAPY;
    cap.add(liner);
    cap.position.y = CAPY;
    bottle.add(cap);
    // lacre: anel de 4,2 mm com bainha enrolada embaixo; fica no gargalo quando a tampa sai
    const band = P([[1.40, 21.72], [1.43, 21.722], [1.455, 21.73], [1.472, 21.745], [1.48, 21.765], [1.481, 21.79], [1.476, 21.815], [1.47, 21.84]]);
    for (let y = cy(21.88); y < cy(22.11); y += .04) band.push([R_CAP, y]);
    band.push(...P([[1.466, 22.132], [1.458, 22.14], [1.445, 22.144]]));
    const seal = new THREE.Mesh(lathe(band, 256), capMat);
    seal.position.y = CAPY;
    bottle.add(seal);
  }

  // bolhas no líquido (opacas: aparecem refratadas pelo vidro)
  const NB = MOBILE ? 36 : 60;
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: '#FFF1D6' }), NB);
  const bub = Array.from({ length: NB }, (_, k) => ({ a: k * 2.39996, q: Math.sqrt(hash(k * 3.1)) * .82, ph: hash(k * 7.7), sp: .05 + hash(k * 1.9) * .07, sz: .045 + hash(k * 5.3) * .085 }));
  bottle.add(bubbles);
  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), bp = new THREE.Vector3(), bs = new THREE.Vector3();
  // gás subindo: mais rápido e mais bolhas quando a garrafa se mexe (act 0..1)
  function updateBubbles(t, act) {
    for (let k = 0; k < NB; k++) {
      const b = bub[k], u = (b.ph + t * b.sp) % 1, y = 1.4 + u * (FILL - 2.1);
      const r = Math.max(rAt(y) - .45, .2) * b.q, a = b.a + Math.sin(t * .7 + k) * .15;
      bp.set(Math.sin(a) * r, y, Math.cos(a) * r);
      const extra = k < NB * .45 ? 1 : Math.min(1, Math.max(0, (act - .05) / .35));
      bs.setScalar(b.sz * extra * (u > .96 ? (1 - u) / .04 : 1) * (u < .03 ? u / .03 : 1));
      bubbles.setMatrixAt(k, bm.compose(bp, bq, bs));
    }
    bubbles.instanceMatrix.needsUpdate = true;
  }
  updateBubbles(0, 0);

  // ---------- ilustrações (traço fino, 200×200) ----------
  const ILLO = {
    cha(c, bg) {
      line(c, 'M98 194 C 96 160, 94 120, 102 78 C 105 60, 110 44, 118 30');
      leaf(c, 97, 162, -1.05, 66, 22, bg); leaf(c, 96, 126, .95, 60, 20, bg);
      leaf(c, 103, 90, -.8, 52, 17, bg); leaf(c, 109, 56, .7, 40, 13, bg);
      shape(c, 'M118 30 C 112 18, 116 6, 124 2 C 128 12, 126 24, 118 30 Z', bg);
    },
    caju(c, bg) {
      shape(c, 'M92 164 C 72 168, 68 194, 89 198 C 103 200, 112 191, 105 182 C 118 186, 130 177, 121 165 Z', bg);
      line(c, 'M100 58 C 100 46, 103 36, 108 26');
      leaf(c, 106, 36, 1.2, 72, 22, bg);
      shape(c, 'M100 58 C 80 56, 56 70, 54 96 C 52 122, 64 142, 76 156 C 86 168, 114 168, 124 156 C 136 142, 148 122, 146 96 C 144 70, 120 56, 100 58 Z', bg);
      line(c, 'M68 92 C 64 108, 68 126, 78 140');
      line(c, 'M84 76 C 80 80, 78 84, 77 88');
      line(c, 'M92 60 C 96 64, 104 64, 108 60');
    },
    jabuticaba(c, bg) {
      line(c, 'M12 184 C 58 142, 116 92, 188 34'); line(c, 'M28 196 C 70 156, 126 106, 194 50');
      line(c, 'M150 72 C 158 58, 168 50, 182 48'); line(c, 'M60 150 C 50 138, 40 132, 26 132');
      [[58, 132, 17], [84, 156, 15], [98, 108, 18], [124, 128, 16], [134, 84, 15], [156, 102, 16], [40, 166, 13], [168, 66, 12], [72, 104, 11]]
        .forEach(([x, y, r]) => {
          c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = bg; c.fill(); c.stroke();
          c.beginPath(); c.arc(x - r * .08, y - r * .08, r * .62, Math.PI * 1.08, Math.PI * 1.5); c.stroke();
        });
    },
    gengibre(c, bg) {
      shape(c, 'M80 84 C 76 64, 84 50, 94 52 C 102 54, 104 66, 98 78 Z', bg);
      shape(c, 'M22 118 C 18 100, 34 90, 48 96 C 50 80, 66 72, 78 82 C 86 66, 106 68, 108 84 C 120 78, 134 88, 128 102 C 140 110, 136 128, 122 130 C 108 138, 86 136, 72 132 C 56 138, 28 136, 22 118 Z', bg);
      ['M44 100 C 40 110, 42 122, 48 130', 'M68 90 C 64 102, 66 118, 72 132', 'M98 86 C 94 100, 96 116, 102 132', 'M86 60 C 90 62, 94 62, 97 60'].forEach(d => line(c, d));
      c.beginPath(); c.arc(146, 150, 36, 0, Math.PI * 2); c.fillStyle = bg; c.fill(); c.stroke();
      c.beginPath(); c.arc(146, 150, 30, 0, Math.PI * 2); c.stroke();
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; c.beginPath(); c.moveTo(146 + Math.cos(a) * 4, 150 + Math.sin(a) * 4); c.lineTo(146 + Math.cos(a) * 27, 150 + Math.sin(a) * 27); c.stroke(); }
      line(c, 'M120 112 C 128 104, 138 102, 148 106');
    },
    hibisco(c, bg) {
      for (let k = 0; k < 5; k++) {
        c.save(); c.translate(94, 110); c.rotate(k * 1.2566 + .2);
        shape(c, 'M0 -4 C -24 -16, -46 -50, -32 -74 C -20 -94, 12 -96, 28 -80 C 48 -58, 30 -18, 0 -4 Z', bg);
        ['M0 -8 C -2 -30, -4 -50, -6 -70', 'M0 -10 C -10 -28, -20 -44, -24 -58', 'M0 -10 C 8 -28, 16 -44, 20 -60'].forEach(d => line(c, d));
        c.restore();
      }
      c.beginPath(); c.arc(94, 110, 8, 0, Math.PI * 2); c.fillStyle = bg; c.fill(); c.stroke();
      line(c, 'M94 110 C 108 96, 122 80, 136 58');
      [[120, 84], [127, 76], [116, 91], [131, 68], [124, 72]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.stroke(); });
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; c.beginPath(); c.arc(138 + Math.cos(a) * 6, 54 + Math.sin(a) * 6, 2.4, 0, Math.PI * 2); c.stroke(); }
    },
    pote(c, bg) {
      shape(c, 'M62 72 L 62 176 C 62 186, 70 192, 80 192 L 120 192 C 130 192, 138 186, 138 176 L 138 72 Z', bg);
      line(c, 'M66 106 C 86 102, 114 110, 134 106'); line(c, 'M66 114 C 90 118, 110 112, 134 116');
      shape(c, 'M54 72 C 54 56, 70 46, 100 46 C 130 46, 146 56, 146 72 C 132 80, 68 80, 54 72 Z', bg);
      line(c, 'M58 76 C 52 88, 50 98, 56 106'); line(c, 'M142 76 C 148 88, 150 98, 144 106');
      line(c, 'M60 68 C 80 74, 120 74, 140 68'); line(c, 'M140 68 C 152 62, 158 66, 152 76'); line(c, 'M140 68 C 150 72, 152 80, 146 84');
      [[84, 150, 5], [100, 130, 4], [114, 162, 6], [92, 176, 3], [121, 134, 3], [76, 132, 3], [104, 150, 2.5]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); });
    },
    tampa(c, bg, fg) {
      // tampa de rosca em 3/4: topo elíptico com "f", serrilha, anéis de rosca e lacre picotado
      const T = 70, B = 150, rx = 46, ry = 15;
      c.beginPath(); c.moveTo(100 - rx, T); c.lineTo(100 - rx, B); c.ellipse(100, B, rx, ry, 0, Math.PI, 0, true); c.lineTo(100 + rx, T); c.closePath();
      c.fillStyle = bg; c.fill(); c.stroke();
      c.beginPath(); c.ellipse(100, T, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = bg; c.fill(); c.stroke();
      for (let k = 1; k < 18; k++) { const th = Math.PI * k / 18, x = 100 - rx * Math.cos(th), y = T + ry * Math.sin(th); c.beginPath(); c.moveTo(x, y + 3); c.lineTo(x, y + 15); c.stroke(); }
      for (const y of [T + 30, T + 42, T + 54]) { c.beginPath(); c.ellipse(100, y, rx, ry, 0, Math.PI, 0, true); c.stroke(); }
      c.save(); c.setLineDash([7, 5]); c.beginPath(); c.ellipse(100, B - 18, rx, ry, 0, Math.PI, 0, true); c.stroke(); c.restore();
      c.save(); c.translate(100, T + 7); c.scale(1, .42); c.fillStyle = fg; c.font = `800 46px ${FONT_D}`; c.textAlign = 'center'; c.fillText('f', 0, 0); c.restore();
      [[160, 40, 6], [174, 22, 4], [148, 20, 3]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); });
    }
  };
  function line(c, d) { c.stroke(new Path2D(d)); }
  function shape(c, d, bg) { const p = new Path2D(d); c.fillStyle = bg; c.fill(p); c.stroke(p); }
  function leaf(c, x, y, ang, L, w, bg) {
    c.save(); c.translate(x, y); c.rotate(ang);
    shape(c, `M0 0 C ${w} ${-L * .22}, ${w * .9} ${-L * .78}, 0 ${-L} C ${-w * .9} ${-L * .78}, ${-w} ${-L * .22}, 0 0 Z`, bg);
    line(c, `M0 0 C ${w * .08} ${-L * .4}, ${w * .05} ${-L * .7}, 0 ${-L * .92}`);
    for (let k = 1; k <= 3; k++) {
      const yy = -L * k / 4.2;
      line(c, `M0 ${yy} Q ${w * .45} ${yy - L * .08}, ${w * .62} ${yy - L * .17}`);
      line(c, `M0 ${yy} Q ${-w * .45} ${yy - L * .08}, ${-w * .62} ${yy - L * .17}`);
    }
    c.restore();
  }
  function drawIllo(c, key, cx, cy, size, fg, bg, lw) {
    c.save(); c.translate(cx - size / 2, cy - size / 2); c.scale(size / 200, size / 200);
    c.strokeStyle = fg; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
    (ILLO[key] || ILLO.cha)(c, bg, fg);
    c.restore();
  }
  const texOpts = t => { t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; return t; };

  // ---------- títulos gigantes (máscara branca sobre preto) ----------
  const TF = MOBILE ? 300 : 460;
  const titles = (() => {
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `800 ${TF}px ${FONT_D}`;
    const lsOf = fl => `${(fl.ls ?? -.035) * TF}px`;   // tracking por palavra (a marca usa o do logotipo)
    let asc = 0, desc = 0;
    list.forEach(fl => { if ('letterSpacing' in probe) probe.letterSpacing = lsOf(fl); const m = probe.measureText(fl.word); asc = Math.max(asc, m.actualBoundingBoxAscent || TF * .78); desc = Math.max(desc, m.actualBoundingBoxDescent || TF * .2); });
    const pad = Math.round(TF * .06);
    return list.map(fl => {
      if ('letterSpacing' in probe) probe.letterSpacing = lsOf(fl);
      const m = probe.measureText(fl.word);
      const L = m.actualBoundingBoxLeft || 0, Rr = m.actualBoundingBoxRight || m.width;
      const c = document.createElement('canvas');
      c.width = Math.ceil(L + Rr + pad * 2); c.height = Math.ceil(asc + desc + pad * 2);
      const x = c.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
      x.font = `800 ${TF}px ${FONT_D}`;
      if ('letterSpacing' in x) x.letterSpacing = lsOf(fl);
      x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
      x.fillText(fl.word, pad + L, pad + asc);
      return { tex: texOpts(new THREE.CanvasTexture(c)), w: c.width, h: c.height };
    });
  })();
  const illos = list.map(fl => {
    const c = document.createElement('canvas'); c.width = c.height = MOBILE ? 384 : 512;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    drawIllo(x, fl.illo, c.width / 2, c.height / 2, c.width * .92, '#fff', '#000', 2.3);
    return texOpts(new THREE.CanvasTexture(c));
  });
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1); blank.needsUpdate = true;
  const ingImg = {};
  Object.values(ING_SETS).forEach(set => set.forEach(([layer, name]) => {
    const big = !MOBILE && (layer === 'front' || layer === 'mid');
    const key = name + (big ? '-1024' : '-512');
    if (!ingImg[key]) { const t = imgTex(`img/${key}.webp`); t.premultiplyAlpha = true; ingImg[key] = t; }
  }));

  // ---------- desenho do rótulo e do contrarrótulo ----------
  const lum = c => .2126 * c.r + .7152 * c.g + .0722 * c.b;
  const INK = '#1E1A17', PAPER = '#F4EEE3';
  const paperBase = (() => {
    const c = document.createElement('canvas'); c.width = LW; c.height = LH;
    const x = c.getContext('2d'), rr = mulberry32(11), k = LW / 1400;
    x.fillStyle = PAPER; x.fillRect(0, 0, LW, LH);
    x.fillStyle = 'rgba(90,60,30,.05)';
    for (let i = 0; i < 2600 * k * k * .5; i++) x.fillRect(rr() * LW, rr() * LH, (1.2 + rr() * 2.2) * k * .6, (1 + rr() * 1.4) * k * .6);
    x.strokeStyle = 'rgba(120,90,50,.07)'; x.lineWidth = Math.max(1, k * .5);
    for (let i = 0; i < 700 * k; i++) { const px = rr() * LW, py = rr() * LH, a = rr() * 6.28, l = (6 + rr() * 18) * k * .6; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + 1) * l * .5, py + Math.sin(a + 1) * l * .5, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    // sombra leve na borda do papel (onde ele encosta no vidro e nas pontas que dão a volta)
    const e = x.createLinearGradient(0, 0, 0, LH); e.addColorStop(0, 'rgba(60,40,20,.22)'); e.addColorStop(.02, 'rgba(60,40,20,0)'); e.addColorStop(.98, 'rgba(60,40,20,0)'); e.addColorStop(1, 'rgba(60,40,20,.22)');
    x.fillStyle = e; x.fillRect(0, 0, LW, LH);
    const s2 = x.createLinearGradient(0, 0, LW, 0); s2.addColorStop(0, 'rgba(60,40,20,.25)'); s2.addColorStop(.015, 'rgba(60,40,20,0)'); s2.addColorStop(.985, 'rgba(60,40,20,0)'); s2.addColorStop(1, 'rgba(60,40,20,.25)');
    x.fillStyle = s2; x.fillRect(0, 0, LW, LH);
    return c;
  })();
  function paper(c) { c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(paperBase, 0, 0); }
  const GOLD = '#B0873C';
  const ls = (c, px) => { if ('letterSpacing' in c) c.letterSpacing = `${px}px`; };
  function wrap(c, text, x, y, maxW, lh) {
    let ln = '';
    for (const w of text.split(' ')) {
      const test = ln ? ln + ' ' + w : w;
      if (c.measureText(test).width > maxW && ln) { c.fillText(ln, x, y); y += lh; ln = w; } else ln = test;
    }
    if (ln) c.fillText(ln, x, y);
    return y + lh;
  }
  function drawFront(cv, fl) {
    const c = cv.getContext('2d'), W = cv.width, k = W / 1400;
    paper(c);
    c.scale(k, k);
    const w = 1400, h = 700, cx = w / 2;
    c.fillStyle = INK; c.fillRect(0, 26, w, 2.5); c.fillRect(0, h - 28, w, 2.5);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = GOLD; c.font = `800 150px ${FONT_D}`; ls(c, -6); c.fillText('fervo', cx, 172);
    c.fillStyle = INK; c.font = `500 24px ${FONT_M}`; ls(c, 8); c.fillText('SODA FERMENTADA VIVA', cx, 214);
    const by = 244, bh = 330;
    if (fl.label) {
      c.fillStyle = fl.sp; c.fillRect(0, by, w, bh);
      const fg = lum(fl.spC) > .32 ? fl.ink : '#F7F1E6';
      c.fillStyle = fg; c.textAlign = 'left';
      const parts = fl.label.includes(' & ') ? [fl.label.split(' & ')[0] + ' &', fl.label.split(' & ')[1]] : [fl.label];
      let fs = parts.length > 1 ? 96 : 140; c.font = `800 ${fs}px ${FONT_D}`; ls(c, -fs * .03);
      const maxW = 640, widest = Math.max(...parts.map(p => c.measureText(p).width));
      if (widest > maxW) { fs *= maxW / widest; c.font = `800 ${fs}px ${FONT_D}`; ls(c, -fs * .03); }
      const lh = fs * .92, y0 = by + bh / 2 - (parts.length - 1) * lh / 2 + fs * .34;
      parts.forEach((p, i) => c.fillText(p, 250, y0 + i * lh));
      drawIllo(c, fl.illo, 1010, by + bh / 2, bh * .84, fg, fl.sp, 3.2);
    } else {
      ['#F2542D', '#5E2D8C', '#EDA21B', '#D6194F'].forEach((col, i) => { c.fillStyle = col; c.fillRect(i * w / 4, by, w / 4 + 1, bh); });
      c.fillStyle = PAPER; c.beginPath(); c.roundRect(cx - 250, by + bh / 2 - 44, 500, 88, 44); c.fill();
      c.fillStyle = INK; c.textAlign = 'center'; c.font = `500 28px ${FONT_M}`; ls(c, 6); c.fillText('QUATRO FRUTAS DO BRASIL', cx, by + bh / 2 + 10);
    }
    c.fillStyle = INK; c.font = `500 26px ${FONT_M}`; ls(c, 4);
    c.textAlign = 'left'; c.fillText('355 ML', 250, h - 56);
    c.textAlign = 'right'; c.fillText('LOTE 07', w - 250, h - 56);
    c.textAlign = 'center'; c.fillText('SABARÁ · MG', cx, h - 56);
  }
  function drawBack(cv, fl) {
    const c = cv.getContext('2d'), W = cv.width, k = W / 1400;
    paper(c);
    c.scale(k, k);
    const w = 1400, h = 700, x0 = 200, x1 = 1200;
    c.fillStyle = INK; c.fillRect(0, 26, w, 2.5); c.fillRect(0, h - 28, w, 2.5);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillStyle = GOLD; c.font = `800 64px ${FONT_D}`; ls(c, -2); c.fillText('fervo', x0, 104);
    c.fillStyle = INK; c.textAlign = 'right'; c.font = `500 21px ${FONT_M}`; ls(c, 5);
    c.fillText((fl.label ? 'SODA FERMENTADA DE ' + fl.label : 'SODA FERMENTADA DE FRUTA').toUpperCase(), x1, 98);
    c.fillStyle = fl.label ? fl.sp : INK; c.fillRect(x0, 124, x1 - x0, 6);
    c.fillStyle = INK; c.textAlign = 'left';
    c.font = `500 19px ${FONT_M}`; ls(c, 4); c.fillText('INGREDIENTES', x0, 168);
    c.font = `500 23px ${FONT_T}`; ls(c, 0);
    const y = wrap(c, fl.ingr || BRAND_INGR, x0, 200, 520, 30);
    c.font = `500 18px ${FONT_M}`; ls(c, 3);
    wrap(c, 'NÃO PASTEURIZADA. MANTENHA REFRIGERADA DE 0 A 6 °C: O GÁS CONTINUA SE FORMANDO.', x0, y + 8, 520, 25);
    const tx = 780, tw = x1 - tx;
    c.fillRect(tx, 146, tw, 3.5);
    c.font = `500 19px ${FONT_M}`; ls(c, 3); c.fillText('INFORMAÇÃO NUTRICIONAL', tx, 178);
    c.font = `500 17px ${FONT_M}`; ls(c, 2); c.fillText('PORÇÃO DE 355 ML (1 GARRAFA)', tx, 204);
    const rows = fl.label
      ? [['Valor energético', `${fl.kcal} kcal`], ['Açúcares totais', `${fl.sug} g`], ['Proteínas', '0 g'], ['Sódio', `${fl.na} mg`], ['Álcool', '< 0,5%']]
      : [['Tanque', '9 dias'], ['Garrafa', '48 a 96 h'], ['Gás', 'natural'], ['Álcool', '< 0,5%']];
    c.font = `500 22px ${FONT_T}`; ls(c, 0);
    rows.forEach(([a, b], i) => {
      const ry = 244 + i * 36;
      c.fillRect(tx, ry - 26, tw, 1.2);
      c.textAlign = 'left'; c.fillText(a, tx, ry); c.textAlign = 'right'; c.fillText(b, x1, ry);
    });
    c.textAlign = 'left'; c.fillRect(tx, 244 + rows.length * 36 - 26, tw, 3.5);
    const bx = x0, byy = h - 196, bw = 330, bhh = 92;
    c.fillStyle = '#fff'; c.fillRect(bx - 14, byy - 14, bw + 28, bhh + 56);
    c.fillStyle = INK;
    const rb = mulberry32(Math.round(fl.seed * 1000) + 3);
    let xx = bx;
    const bar = (wd, tall) => { c.fillRect(xx, byy, wd, bhh + (tall ? 12 : 0)); xx += wd; };
    bar(2.6, 1); xx += 2.6; bar(2.6, 1); xx += 2.6;
    while (xx < bx + bw - 20) { const wd = 1.8 + Math.floor(rb() * 4) * 2.1; bar(wd, xx > bx + bw / 2 - 5 && xx < bx + bw / 2 + 5); xx += 1.8 + Math.floor(rb() * 3) * 2.1; }
    xx = bx + bw - 13; bar(2.6, 1); xx += 2.6; bar(2.6, 1);
    c.textAlign = 'center'; c.font = `500 20px ${FONT_M}`; ls(c, 5);
    c.fillText(`7 908${String(Math.round(fl.seed * 1e6)).padStart(6, '0').slice(0, 6)} 0${Math.round(fl.seed * 97) % 10}`, bx + bw / 2, byy + bhh + 36);
    c.textAlign = 'right'; c.font = `500 20px ${FONT_M}`; ls(c, 4);
    c.fillText('LOTE 07 · FAB 09/2026', x1, h - 150);
    c.fillText('VAL 01/2027', x1, h - 120);
    c.font = `500 17px ${FONT_M}`; ls(c, 3);
    c.fillText('FERMENTARIA FERVO · SABARÁ, MG', x1, h - 82);
    c.fillText('MARCA FICTÍCIA · DEMO DE PORTFÓLIO', x1, h - 58);
  }
  // uma textura por conteúdo (as seções da marca compartilham a mesma); a tela 2D é liberada assim que sobe para a GPU
  function labelTex(side, idx) {
    const fl = list[idx], key = side + ':' + (fl.label ? fl.id : 'marca');
    let t = LTEX.get(key);
    if (!t) {
      const c = document.createElement('canvas'); c.width = LW; c.height = LH;
      (side ? drawBack : drawFront)(c, fl);
      t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
      renderer.initTexture(t); c.width = c.height = 1;
      LTEX.set(key, t);
    }
    return t;
  }
  mark('tampa-e-titulos');
  list.forEach((fl, k) => { labelTex(0, k); labelTex(1, k); });
  mark('rotulos');

  // ---------- fundo opaco: pastel + splash + foto + ingrediente + título + ilustração + sombra ----------
  const GLSL_NOISE = /* glsl */`
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3. - 2.*f);
      return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y); }`;
  const SDF_SPAN = 4.4, SDF_N = MOBILE ? 512 : 768;
  const sdfRT = list.map(() => new THREE.WebGLRenderTarget(SDF_N, SDF_N, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
  {
    // splash: SDF de metaballs + escorridos + raios + respingos + ruído, assado uma vez por seção
    const bake = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { uSeed: { value: 0 }, uSpan: { value: SDF_SPAN }, uFoam: { value: 0 } },
      depthTest: false, depthWrite: false,
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: /* glsl */`
        uniform float uSeed, uSpan, uFoam; varying vec2 vUv;
        ${GLSL_NOISE}
        float fbm(vec2 p){ float s = 0., a = .5; for(int i = 0; i < 5; i++){ s += a*vnoise(p); p = p*2.03 + 7.1; a *= .5; } return s; }
        vec2 h2(float n){ return fract(sin(vec2(n, n + 1.731)) * vec2(43758.5453, 22578.1459)); }
        float smin(float a, float b, float k){ float h = clamp(.5 + .5*(b - a)/k, 0., 1.); return mix(b, a, h) - k*h*(1. - h); }
        float sdSeg(vec2 p, vec2 a, vec2 b, float ra, float rb){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0., 1.); return length(pa - ba*h) - mix(ra, rb, h); }
        float h1(float n){ return fract(sin(n*91.3458)*47453.5453); }
        void main(){
          vec2 q = (vUv - .5)*uSpan; float sd = uSeed;
          if(uFoam > .5){
            // espuma: aglomerado de bolhas (união suave) + distância até a borda de cada bolha
            float d = 1e3, ring = 1e3;
            for(int i = 0; i < 52; i++){
              float fi = float(i), big = i < 36 ? 1. : 0.;
              vec2 r = h2(sd*13.7 + fi*1.913);
              float ang = r.x*6.2832, rad = pow(r.y, .75)*(big > .5 ? .8 : 1.5);
              vec2 c = vec2(cos(ang)*1.3, sin(ang)*.85)*rad;
              float rr = (big > .5 ? .07 + .22*pow(h1(fi*3.7 + sd), 2.) : .02 + .05*h1(fi*5.1 + sd))*(1. - .3*rad/1.5);
              float dc = length(q - c) - rr;
              d = smin(d, dc, .02);
              ring = min(ring, abs(dc));
            }
            gl_FragColor = vec4(d, fbm(q*3.2 + 2.), ring, 1.);
            return;
          }
          vec2 w = vec2(fbm(q*1.5 + sd*17.), fbm(q*1.5 + sd*31. + 5.2)) - .5;
          vec2 p = q + w*.36;
          float d = length(p*vec2(.9, 1.1)) - .44;
          for(int i = 0; i < 7; i++){
            float fi = float(i);
            vec2 r = h2(sd*97.3 + fi*3.71);
            float a = r.x*6.2832, rad = .14 + r.y*.5;
            vec2 c = vec2(cos(a)*1.3, sin(a)*.85)*rad;
            float rr = .17 + .22*fract(r.x*7.31 + r.y*3.17);
            d = smin(d, length(p - c) - rr, .28);
          }
          for(int j = 0; j < 3; j++){
            float fj = float(j);
            vec2 r = h2(sd*53.9 + fj*11.3);
            float x = (r.x - .5)*.9, len = .6 + .6*r.y, wd = .026 + .032*fract(r.y*5.37);
            vec2 a0 = vec2(x, -.25), b0 = vec2(x + (r.x - .5)*.12, -.25 - len);
            float dd = min(sdSeg(q, a0, b0, wd*1.25, wd*.65), length(q - b0) - wd*1.35);
            d = smin(d, dd, .1);
          }
          for(int m = 0; m < 6; m++){
            float fm = float(m);
            vec2 r = h2(sd*71.3 + fm*9.7);
            float a = (fm + r.x*.8)/6.*6.2832;
            vec2 dir = vec2(cos(a)*1.25, sin(a)*.9);
            float dd = sdSeg(q, dir*.5, dir*(.95 + .4*r.y), .075, .01);
            dd = min(dd, length(q - dir*(1.05 + .45*r.y)) - .035*r.y);
            d = smin(d, dd, .05);
          }
          d += (vnoise(q*9. + sd*13.) - .5)*.06 + (vnoise(q*27. + sd*7.) - .5)*.024;
          for(int k = 0; k < 11; k++){
            float fk = float(k);
            vec2 r = h2(sd*19.7 + fk*5.13);
            float a = r.x*6.2832;
            vec2 c = vec2(cos(a)*1.25, sin(a)*.95)*(1.0 + .72*r.y);
            float rr = .01 + .05*pow(fract(r.y*13.7 + r.x), 2.);
            d = min(d, length(q - c) - rr);
          }
          gl_FragColor = vec4(d, fbm(q*3.2 + 2. + sd*5.), 0., 1.);
        }`
    }));
    const cam = new THREE.Camera();
    list.forEach((fl, k) => {
      bake.material.uniforms.uSeed.value = fl.seed; bake.material.uniforms.uFoam.value = fl.foam ? 1 : 0;
      renderer.setRenderTarget(sdfRT[k]); renderer.render(bake, cam);
    });
    renderer.setRenderTarget(null);
    bake.geometry.dispose(); bake.material.dispose();
  }
  mark('splash');

  const bdU = {
    uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uE: { value: 0 }, uTE: { value: 0 }, uIE: { value: 0 }, uBgMix: { value: 1 }, uTime: { value: 0 }, uIntro: { value: REDUCE ? 1 : 0 },
    uBgA: { value: new THREE.Color() }, uBgB: { value: new THREE.Color() }, uSpA: { value: new THREE.Color() }, uSpB: { value: new THREE.Color() },
    uInkA: { value: new THREE.Color() }, uInkB: { value: new THREE.Color() }, uPaper: { value: new THREE.Color(PAPER) },
    uSdfA: { value: sdfRT[0].texture }, uSdfB: { value: sdfRT[1].texture }, uSpan: { value: SDF_SPAN },
    uSplC: { value: new THREE.Vector2() }, uSplR: { value: 200 },
    uTitA: { value: titles[0].tex }, uTitB: { value: titles[1].tex }, uTitRA: { value: new THREE.Vector4() }, uTitRB: { value: new THREE.Vector4() },
    uIlA: { value: illos[0] }, uIlB: { value: illos[1] }, uIlR: { value: new THREE.Vector4() },
    uSplat: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, -1e3)) }, uSplatC: { value: [0, 1, 2, 3].map(() => new THREE.Color()) },
    uFoamA: { value: 0 }, uFoamB: { value: 0 },
    uShadow: { value: new THREE.Vector4(0, 0, 1, 0) }
  };
  const BD_DIST = 14;
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: bdU,
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */`
      uniform vec2 uRes; uniform float uE, uTE, uIE, uBgMix, uTime, uIntro, uSpan, uFoamA, uFoamB;
      uniform vec4 uSplat[4]; uniform vec3 uSplatC[4];
      uniform vec3 uBgA, uBgB, uSpA, uSpB, uInkA, uInkB, uPaper;
      uniform sampler2D uSdfA, uSdfB; uniform vec2 uSplC; uniform float uSplR;
      uniform sampler2D uTitA, uTitB, uIlA, uIlB;
      uniform vec4 uTitRA, uTitRB, uIlR, uShadow;
      varying vec2 vUv;
      ${GLSL_NOISE}
      float ease3(float x){ return x < .5 ? 4.*x*x*x : 1. - pow(-2.*x + 2., 3.)*.5; }
      float mask(sampler2D t, vec4 R, vec2 p){
        vec2 uv = (p - R.xy)/R.zw + .5;
        float inside = step(0., uv.x)*step(uv.x, 1.)*step(0., uv.y)*step(uv.y, 1.);
        return texture2D(t, clamp(uv, 0., 1.)).r*inside;
      }
      float h1(float n){ return fract(sin(n*91.3458)*47453.5453); }
      void main(){
        vec2 px = vUv*uRes;
        float e = uE;
        // fundo: a cor nova inunda a partir de trás da garrafa
        float r = length(px - uSplC)/uRes.y;
        float flood = e*2.6 - .15 - r + (vnoise(px/uRes.y*3.) - .5)*.08;
        vec3 col = mix(uBgA, uBgB, smoothstep(-.012, .012, flood)*uBgMix);
        // splash: lê as duas SDFs, ondula devagar, encolhe e reabre na troca
        vec2 q = (px - uSplC)/uSplR;
        q += .014*vec2(sin(q.y*3.1 + uTime*.7), cos(q.x*2.7 + uTime*.55));
        vec2 su = q/uSpan + .5;
        vec4 sA = texture2D(uSdfA, su), sB = texture2D(uSdfB, su);
        float edge = step(0., su.x)*step(su.x, 1.)*step(0., su.y)*step(su.y, 1.);
        float d = mix(mix(sA.r, sB.r, e), 2., 1. - edge);
        d += .55*sin(3.14159*e) + (1. - uIntro)*1.7;
        float aa = 1.3/uSplR;
        float cov = 1. - smoothstep(-aa, aa, d);
        float rim = smoothstep(-.1, -.004, d);
        vec3 sp = mix(uSpA, uSpB, e);
        col = mix(col, sp*(1. - .2*rim)*(.93 + .12*mix(sA.g, sB.g, e)), cov);
        float rgA = uFoamA > .5 ? sA.b : 9., rgB = uFoamB > .5 ? sB.b : 9.;
        float rg = mix(rgA, rgB, e), lw = 1.4/uSplR;
        float bub = (1. - smoothstep(lw*.5, lw*1.6, rg))*cov*max(uFoamA*(1. - e), uFoamB*e);
        col = mix(col, mix(sp, mix(uInkA, uInkB, e), .32), bub*.75);
        // respingos: quando um ingrediente pousa, gotas da tinta saltam em volta dele e ficam no papel
        float drops = 0.; vec3 dcol = sp;
        for(int k = 0; k < 4; k++){
          vec4 S = uSplat[k]; float age = uTime - S.w;
          if(age < 0. || age > 60.) continue;
          if(length(px - S.xy) > S.z * 1.6) continue;   // as gotas ficam a até ~1,45·S.z do centro: fora disso, nem entra no laço
          float A = clamp(age/.55, 0., 1.), fly = 1. - pow(1. - A, 3.);
          for(int j = 0; j < 9; j++){
            float fj = float(j) + float(k)*17.;
            float a = h1(fj + S.w)*6.2832, sp2 = .5 + h1(fj*3.1 + S.w);
            vec2 c = S.xy + vec2(cos(a), sin(a)*.8)*S.z*(.45 + .9*sp2*fly) - vec2(0., S.z*.25*A*A*sp2);
            float rr = S.z*(.022 + .05*h1(fj*7.7 + S.w)*h1(fj*1.3))*(1. - .35*sin(3.14159*A))*(1. - .9*sin(3.14159*e));
            float dk = 1. - smoothstep(rr - 1., rr + 1., length(px - c));
            if(dk > drops){ drops = dk; dcol = uSplatC[k]; }
          }
        }
        col = mix(col, dcol*(.92 + .08*rim), drops);
        // título: sai subindo por uma máscara (onda da esquerda p/ direita); o novo sobe de baixo
        const float ST = .2, DU = .35;
        vec2 uA = (px - uTitRA.xy)/uTitRA.zw + .5, uB = (px - uTitRB.xy)/uTitRB.zw + .5;
        float inA = step(0., uA.x)*step(uA.x, 1.)*step(0., uA.y)*step(uA.y, 1.);
        float inB = step(0., uB.x)*step(uB.x, 1.)*step(0., uB.y)*step(uB.y, 1.);
        float pA = clamp((uTE - ST*uA.x)/DU, 0., 1.), pI = clamp((uIntro*(ST + DU) - ST*uA.x)/DU, 0., 1.);
        float pB = clamp((uTE - .42 - ST*uB.x)/DU, 0., 1.);
        float oA = (ease3(pA) - (1. - ease3(pI)))*1.02, oB = -(1. - ease3(pB))*1.02;
        float cA = texture2D(uTitA, clamp(uA - vec2(0., oA), 0., 1.)).r*inA;
        float cB = texture2D(uTitB, clamp(uB - vec2(0., oB), 0., 1.)).r*inB;
        // ilustração: desliza e funde com progresso próprio (uIE): na prévia de sabor do final acompanha o giro da garrafa,
        // enquanto o título (uTE) fica parado em "Saúde"
        float qa = ease3(clamp(uIE/.5, 0., 1.)), qb = ease3(clamp((uIE - .5)/.5, 0., 1.));
        float iA = mask(uIlA, uIlR, px - vec2(0., qa*.25*uIlR.w))*(1. - qa)*smoothstep(.3, 1., uIntro);
        float iB = mask(uIlB, uIlR, px + vec2(0., (1. - qb)*.25*uIlR.w))*qb;
        col = mix(col, uInkA, max(cA, iA));
        col = mix(col, uInkB, max(cB, iB));
        // sombra de contato (a garrafa pousada na mesa)
        vec2 sq = (px - uShadow.xy)/vec2(uShadow.z, uShadow.z*.2);
        float sh = exp(-dot(sq, sq)*5.)*.5 + exp(-dot(sq, sq)*1.1)*.22;
        col *= 1. - uShadow.w*sh;
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
        gl_FragColor.rgb *= 1. + (hash12(px*1.37 + 3.1) - .5)*.035;
      }`
  }));
  backdrop.position.z = -BD_DIST; backdrop.renderOrder = -10; backdrop.frustumCulled = false;
  camera.add(backdrop);

  // ---------- partículas: bolhas em volta (Processo) e estouro de gás (CTA) ----------
  const ptU = { uScale: { value: 1 }, uTime: { value: 0 } };
  const ringFrag = /* glsl */`
    uniform vec3 uInk; varying float vA;
    void main(){
      float d = length(gl_PointCoord - .5);
      float ring = smoothstep(.5, .42, d) - smoothstep(.36, .28, d)*.78;
      float spec = smoothstep(.14, .02, length(gl_PointCoord - vec2(.36, .34)));
      gl_FragColor = vec4(mix(uInk, vec3(1.), spec), (ring*.6 + spec*.9)*vA);
      #include <colorspace_fragment>
    }`;
  const NPB = MOBILE ? 48 : 90;
  const procU = { uCenter: { value: new THREE.Vector3() }, uAlpha: { value: 0 }, uInk: { value: new THREE.Color('#2F5BA8') } };
  {
    const g = new THREE.BufferGeometry(), a = new Float32Array(NPB * 4);
    for (let k = 0; k < NPB; k++) a.set([hash(k * 1.3) * 6.2832, .34 + hash(k * 2.9) * 1.05, hash(k * 4.1), .014 + Math.pow(hash(k * 6.7), 2) * .055], k * 4);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NPB * 3), 3));
    g.setAttribute('aS', new THREE.BufferAttribute(a, 4));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { ...procU, uScale: ptU.uScale, uTime: ptU.uTime }, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec4 aS; uniform vec3 uCenter; uniform float uTime, uScale, uAlpha; varying float vA;
        void main(){
          float t = fract(aS.z + uTime*(.045 + .06*fract(aS.x*3.7)));
          vec3 p = uCenter + vec3(cos(aS.x)*aS.y + sin(uTime*1.3 + aS.x*5.)*.04, (t - .5)*2.9, sin(aS.x)*aS.y*.6);
          vec4 mv = modelViewMatrix*vec4(p, 1.);
          gl_PointSize = aS.w*uScale/max(-mv.z, .1);
          vA = uAlpha*sin(t*3.14159);
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: ringFrag
    }));
    pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
  }
  const NG = MOBILE ? 90 : 150;
  const gasU = { uO: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, 1, 0) }, uT: { value: -1 }, uInk: { value: new THREE.Color('#10251A') } };
  {
    const g = new THREE.BufferGeometry(), a = new Float32Array(NG * 4);
    for (let k = 0; k < NG; k++) {
      const th = hash(k * 2.1) * 6.2832, cone = Math.pow(hash(k * 3.3), .7) * .55;
      a.set([Math.sin(cone) * Math.cos(th), Math.cos(cone), Math.sin(cone) * Math.sin(th), .6 + hash(k * 5.9) * 1.6], k * 4);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NG * 3), 3));
    g.setAttribute('aV', new THREE.BufferAttribute(a, 4));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { ...gasU, uScale: ptU.uScale }, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec4 aV; uniform vec3 uO, uAxis; uniform float uT, uScale; varying float vA;
        void main(){
          float t = max(uT, 0.);
          vec3 ax = normalize(uAxis), t1 = normalize(cross(ax, vec3(0., 0., 1.)) + vec3(1e-4)), t2 = cross(ax, t1);
          vec3 dir = ax*aV.y + t1*aV.x + t2*aV.z;
          vec3 p = uO + dir*aV.w*(t - .32*t*t) + vec3(0., .18*t*t, 0.);
          vec4 mv = modelViewMatrix*vec4(p, 1.);
          float sz = (.012 + .02*fract(aV.w*7.3))*(1. + t*1.4);
          gl_PointSize = uT < 0. ? 0. : sz*uScale/max(-mv.z, .1);
          vA = uT < 0. ? 0. : clamp(1. - t/1.15, 0., 1.)*smoothstep(0., .05, t);
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: ringFrag
    }));
    pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
  }

  // ---------- ingredientes: fotos recortadas como planos 3D com mola (entram, pousam e saem a cada sabor) ----------
  const ITEM_GEO = new THREE.PlaneGeometry(1, 1);
  const itemVS = /* glsl */`varying vec2 vUv; varying vec3 vN, vV;
    void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position, 1.); vN = normalize(mat3(modelMatrix)*vec3(0., 0., 1.)); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`;
  const itemFS = /* glsl */`
    uniform sampler2D map; uniform float uBlur, uAlpha, uSheen;
    varying vec2 vUv; varying vec3 vN, vV;
    vec4 tap(vec2 uv, float b){ return texture2D(map, uv, b); }
    vec4 blurred(float b, float o){
      return tap(vUv, b)*.2 + (tap(vUv + vec2(o, 0.), b) + tap(vUv - vec2(o, 0.), b) + tap(vUv + vec2(0., o), b) + tap(vUv - vec2(0., o), b))*.12
        + (tap(vUv + vec2(o, o)*.7, b) + tap(vUv - vec2(o, o)*.7, b) + tap(vUv + vec2(o, -o)*.7, b) + tap(vUv - vec2(o, -o)*.7, b))*.08;
    }
    void main(){
      float ew = smoothstep(0., .07, vUv.x)*smoothstep(1., .93, vUv.x)*smoothstep(0., .07, vUv.y)*smoothstep(1., .93, vUv.y);
    #ifdef ING_SHADOW
      vec4 c = blurred(4., .035)*ew*smoothstep(0., .22, vUv.x)*smoothstep(1., .78, vUv.x)*smoothstep(0., .22, vUv.y)*smoothstep(1., .78, vUv.y);
      gl_FragColor = vec4(0., 0., 0., c.a*uAlpha);
    #else
      vec4 c = (uBlur > .01 ? blurred(uBlur*3.4, uBlur*.02) : texture2D(map, vUv))*ew;
      #ifdef ING_OPAQUE
        if(c.a < .02) discard;
      #endif
      vec3 rgb = c.rgb/max(c.a, 1e-4);
      float ndv = abs(dot(normalize(vN), normalize(vV)));
      float band = exp(-pow((vUv.x*.7 + vUv.y*.7 - .7 - uSheen)/.14, 2.));
      rgb = rgb*(.88 + .12*ndv) + band*.2*(.35 + .65*dot(rgb, vec3(.333)));
      #ifdef ING_OPAQUE
        gl_FragColor = vec4(rgb, clamp((c.a - .5)/max(fwidth(c.a), 1e-3) + .5, 0., 1.));
        #include <colorspace_fragment>
      #else
        gl_FragColor = vec4(rgb, c.a*uAlpha);
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
      #endif
    #endif
    }`;
  function itemMat(tex, kind) {
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uBlur: { value: 0 }, uAlpha: { value: 1 }, uSheen: { value: 0 } },
      vertexShader: itemVS, fragmentShader: itemFS,
      defines: kind === 'opaque' ? { ING_OPAQUE: '' } : kind === 'shadow' ? { ING_SHADOW: '' } : {},
      transparent: kind !== 'opaque', depthWrite: kind === 'opaque', premultipliedAlpha: kind !== 'opaque', side: THREE.DoubleSide
    });
    if (kind === 'opaque') m.alphaToCoverage = true;
    return m;
  }
  const items = [];
  list.forEach((fl, k) => {
    const set = ING_SETS[fl.id]; if (!set) return;
    const side = fl.pose.x > .5 ? 1 : -1;
    set.forEach(([layer, name], j) => {
      const L = LAYERS[layer], big = !MOBILE && (layer === 'front' || layer === 'mid');
      const tex = ingImg[name + (big ? '-1024' : '-512')];
      const mat = itemMat(tex, layer === 'mid' || layer === 'small' ? 'opaque' : 'blend'), smat = itemMat(tex, 'shadow');
      const mesh = new THREE.Mesh(ITEM_GEO, mat), sh = new THREE.Mesh(ITEM_GEO, smat);
      mesh.visible = sh.visible = false; mesh.frustumCulled = sh.frustumCulled = false;
      mesh.renderOrder = layer === 'front' ? 9 : 1; sh.renderOrder = 2;
      scene.add(sh, mesh);
      items.push({ k, j, L, side, mesh, sh, mat, smat, x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, rz: { x: 0, v: 0 }, ry: { x: 0, v: 0 },
        want: false, active: false, at: 0, splat: false, splatAt: 0, init: false, ph: hash(k * 7 + j * 3.3) * 6.28, drop: layer === 'mid' || layer === 'small' });
    });
  });
  const splatOwner = [-1, -1, -1, -1];
  let splatN = 0;

  // ---------- scroll: régua pelos offsets das .sec (medida fora do rAF) ----------
  let anchors = [], scrollYc = scrollY;
  function measure() {
    const vh = viewH();
    anchors = secs.map(el => el.getBoundingClientRect().top + scrollY + (el.offsetHeight - vh) / 2);
  }
  function targetS() {
    if (anchors.length < 2) return 0;
    const y = scrollYc;
    if (y <= anchors[0]) return 0;
    for (let i = 0; i < anchors.length - 1; i++) if (y < anchors[i + 1]) return i + (y - anchors[i]) / Math.max(anchors[i + 1] - anchors[i], 1);
    return anchors.length - 1;
  }
  addEventListener('scroll', () => { scrollYc = scrollY; }, { passive: true });
  measure();
  addEventListener('load', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
  if (document.fonts) document.fonts.ready.then(measure);

  // ---------- hotspots: âncora no vidro, do lado que encara o centro da tela ----------
  const hs = [...document.querySelectorAll('.hs[data-hs]')].map(el => {
    const [id] = el.dataset.hs.split('-'), j = list.findIndex(f => f.id === id);
    if (j < 0) return null;
    const want = list[j].pose.x > .5 ? -.62 : .62, a = want - list[j].spinR, hy = LBL.y + LBL.h * .5 + 1.5;
    return { el, j, p: new THREE.Vector3(Math.sin(a) * R_BODY, hy, Math.cos(a) * R_BODY), ax: new THREE.Vector3(0, hy, 0), x: -1, y: -1, off: false };
  }).filter(Boolean);
  const tv = new THREE.Vector3(), ta = new THREE.Vector3(), tn = new THREE.Vector3();
  function placeHotspots(cur) {
    for (let k = 0; k < hs.length; k++) {
      const h = hs[k];
      let off = h.j !== cur, x = 0, y = 0;
      if (!off) {
        bottle.localToWorld(tv.copy(h.p)); bottle.localToWorld(ta.copy(h.ax));
        tn.subVectors(tv, ta).normalize();
        const facing = tn.dot(ta.subVectors(camera.position, tv).normalize());
        tv.project(camera);
        x = (tv.x * .5 + .5) * W; y = (-tv.y * .5 + .5) * H;
        off = facing < .3 || x < 16 || x > W - 16 || y < 70 || y > H - 60;
      }
      if (off !== h.off) { h.off = off; h.el.classList.toggle('is-hidden', off); }
      if (!off && (Math.abs(x - h.x) > .25 || Math.abs(y - h.y) > .25)) { h.x = x; h.y = y; h.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; }
    }
  }

  // ---------- ponteiro: hover balança, arrastar gira (volta com mola) ----------
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, px: -1e4, py: -1e4, has: false, at: 0 };
  let hover = false, dragging = false, lastX = 0, spinOff = 0, spinVel = 0, dragV = 0, needPick = false, overUI = false, wakeReq = false;
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    mouse.px = e.clientX; mouse.py = e.clientY;
    overUI = !!(e.target.closest && e.target.closest('a,button,.blk,.top,.hs,.flavors,.fcard,.fcards'));
    // sobre a interface o parallax congela (a garrafa não re-renderiza à toa enquanto se usa os cartões) e o mouse NÃO
    // segura o quadro máximo do final: passeando pelos cartões a garrafa fica nítida, não presa no compositor leve
    if (!overUI || dragging) { mouse.x = e.clientX / W * 2 - 1; mouse.y = e.clientY / H * 2 - 1; mouse.at = performance.now(); }
    mouse.has = true; needPick = true; wakeReq = true;
    if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; spinOff += dx * .011; dragV = dx; }
  }, { passive: true });
  addEventListener('pointerdown', e => {
    if (REDUCE || e.button !== 0 || e.pointerType === 'touch' || !hover) return;
    dragging = true; lastX = e.clientX; spinVel = 0; wakeReq = true;
    document.body.classList.add('is-dragging');
    e.preventDefault();
  });
  let touchDown = false;
  addEventListener('touchstart', () => { touchDown = true; }, { passive: true });
  const touchUp = e => { if (!e.touches || e.touches.length === 0) touchDown = false; };
  addEventListener('touchend', touchUp, { passive: true }); addEventListener('touchcancel', touchUp, { passive: true });
  const endDrag = () => { if (!dragging) return; dragging = false; document.body.classList.remove('is-dragging'); };
  addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag); addEventListener('blur', endDrag);
  document.addEventListener('pointerleave', () => { mouse.x = mouse.y = 0; mouse.has = false; needPick = true; wakeReq = true; });

  // ---------- molas ----------
  const mk = v => ({ x: v, v: 0 });
  // criticamente amortecida, solução exata (estável com qualquer dt)
  function crit(st, target, w, dt) {
    const ex = Math.exp(-w * dt), x0 = st.x - target, tmp = (st.v + w * x0) * dt;
    st.x = target + (x0 + tmp) * ex; st.v = (st.v - w * tmp) * ex;
  }
  // subamortecida (com overshoot): inclinação por velocidade e slosh
  function under(st, target, w, z, dt) {
    const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
    for (let k = 0; k < n; k++) { st.v += (-w * w * (st.x - target) - 2 * z * w * st.v) * h; st.x += st.v * h; }
  }
  const sp = { x: mk(0), y: mk(0), sc: mk(list[0].pose.sc), rz: mk(0), ry: mk(0), rx: mk(0) };
  const leanZ = mk(0), leanX = mk(0), slX = mk(0), slZ = mk(0);
  let waveE = 0, dropY = 0, dropV = 0, dropState = REDUCE ? 2 : 0, introK = REDUCE ? 1 : 0, landed = REDUCE, forceDraw = 3, popT = -1;

  // ---------- eventos da UI: voo da navegação e estouro da tampinha ----------
  const fly = { on: false, from: 0, to: 0, k: 0, dur: 1.6 };
  addEventListener('fervo:fly', e => {
    const to = e.detail && e.detail.to;
    if (REDUCE || typeof to !== 'number' || to < 0 || to >= N) return;
    const from = Math.round(targetS());
    if (from === to) return;
    fly.on = true; fly.from = from; fly.to = to; fly.k = 0; fly.dur = e.detail.dur || 1.6; wakeReq = true;
  });
  // prévia de sabor na seção final (cartões). Debounce de 150 ms (passando rápido, vale o último). A garrafa dá uma volta
  // de 360° em 0,9 s (ease-in-out, pico no meio); rótulo e líquido trocam quando a frente está de COSTAS, o líquido faz
  // lerp de cor em ~300 ms em volta desse ponto, o splash faz morph e fundo/tinta fazem tween em ~600 ms, sincronizados
  // com o ângulo. Troca nova no meio do giro: antes das costas só muda o destino; depois, estende até as próximas costas.
  const pvw = { req: -2, reqAt: 0, to: LAST, disp: LAST, from: LAST, ang: 0, vel: 0, a0: 0, a1: 0, v0: 0, t0: 0, dur: .9, on: false, half: 0, rm: -1, fast: false };
  const pvBg = list.map((f, k) => k === LAST ? f.bgC.clone() : list[LAST].bgC.clone().lerp(f.bgC, .35));
  addEventListener('fervo:preview', ev => {
    const id = ev.detail && ev.detail.flavor, k = id ? list.findIndex(f => f.id === id && f.label) : -1;
    // carrossel do celular (fast): espera só 50 ms; mouse passando pelos cartões: 150 ms (não gira a cada cartão cruzado)
    pvw.fast = !!(ev.detail && ev.detail.fast);   // e gira em .6 s em vez de .9 (o rótulo troca de costas, na metade)
    pvw.req = k >= 0 ? k : LAST; pvw.reqAt = performance.now() - (pvw.fast ? 100 : 0); wakeReq = true;
  });
  function pvApply(T, now) {
    if (REDUCE) { if (T !== pvw.disp) pvw.rm = T; return; }
    if (!pvw.on) {
      if (T === pvw.disp) return;
      pvw.to = T; pvw.a0 = pvw.ang; pvw.a1 = pvw.ang - Math.PI * 2; pvw.v0 = 0; pvw.t0 = now; pvw.dur = pvw.fast ? .6 : .9; pvw.on = true; slX.v += .35;
      return;
    }
    if (T === pvw.to) return;
    if (pvw.ang <= pvw.a1 + Math.PI) {   // já passou das últimas costas: mais uma volta, emendada (mantém a velocidade)
      pvw.a0 = pvw.ang; pvw.v0 = pvw.vel; pvw.a1 -= Math.PI * 2; pvw.t0 = now;
      pvw.dur = Math.min(1.3, Math.max(.6, (pvw.fast ? .6 : .9) * (pvw.ang - pvw.a1) / (Math.PI * 2)));
    }
    pvw.to = T;
  }
  // tampa de rosca: sempre no eixo da garrafa e terminando EXATAMENTE em (0, CAPY, 0), sem rotação.
  // Entrada: desce pelo eixo e rosqueia 2 voltas (horário visto de cima). CTA: desrosqueia 2 voltas (anti-horário) subindo
  // 1,5 cm — o lacre fica no gargalo —, dá um pulo LEVE de 9 mm no próprio eixo (nunca sai de cima da boca), balança,
  // as bolhas sobem, e ela volta e rosqueia até assentar.
  const SCREW_H = 1.5, SCREW_T = .95, TURN2 = Math.PI * 4, HOP = .9, HOP_T = .32, HOLD_T = .5, BACK_T = .3;
  let capT = REDUCE ? -1 : -2;   // -2: esperando a garrafa pousar; >= 0: entrando; -1: parada
  const capPose = (x, y, z, rx, ry, rz) => { cap.position.set(x, CAPY + y, z); cap.rotation.set(rx, ry, rz); };
  const screwIn = k => { const e = easeIO(k); capPose(0, SCREW_H * (1 - e), 0, 0, TURN2 * (1 - e), 0); };
  function capEnter(t) {
    if (t < .38) { const k = 1 - t / .38; capPose(0, SCREW_H + 16 * k * k, 0, 0, TURN2, 0); return false; }
    const k = (t - .38) / SCREW_T;
    if (k < 1) { screwIn(k); return false; }
    capPose(0, 0, 0, 0, 0, 0); return true;
  }
  function capPop(t) {
    if (t < SCREW_T) { const e = easeIO(t / SCREW_T); capPose(0, SCREW_H * e, 0, 0, TURN2 * e, 0); return false; }
    t -= SCREW_T;
    if (t < HOP_T) { const s = t / HOP_T, arc = 4 * s * (1 - s); capPose(.12 * arc, SCREW_H + HOP * Math.sin(s * Math.PI / 2), .08 * arc, .16 * arc, TURN2 + .5 * s, -.1 * arc); return false; }
    t -= HOP_T;
    if (t < HOLD_T) { const w = Math.sin(t * 9) * Math.exp(-t * 3); capPose(.05 * w, SCREW_H + HOP + .06 * w, 0, .05 * w, TURN2 + .5 + t * .6, 0); return false; }
    t -= HOLD_T;
    if (t < BACK_T) { const s = easeIO(t / BACK_T); capPose(0, SCREW_H + HOP * (1 - s), 0, 0, TURN2 + (.5 + HOLD_T * .6) * (1 - s), 0); return false; }
    const k = (t - BACK_T) / SCREW_T;
    if (k < 1) { screwIn(k); return false; }
    capPose(0, 0, 0, 0, 0, 0); return true;
  }
  if (!REDUCE) cap.visible = false;
  addEventListener('fervo:pop', () => { if (!REDUCE && popT < 0 && capT === -1 && dropState === 2) { popT = 0; waveE += .3; wakeReq = true; } });
  addEventListener('site:ready', () => {
    if (!REDUCE) setTimeout(() => { if (dropState === 0) dropState = 1; }, 380);
    Object.values(ingImg).forEach((tx, i) => setTimeout(() => requestTex(tx), 500 + i * 220));
  }, { once: true });

  // ---------- layout / resize (nada de leitura de layout dentro do rAF) ----------
  let W = innerWidth, H = viewH(), portrait = W / H < .9, visH = 1, visW = 1, pxU = 1, sized = false;
  function resize() {
    const nw = innerWidth, nh = viewH();
    if (sized && nw === W && nh === H) { measure(); return; }   // barra do Safari: nada a realocar
    sized = true;
    W = nw; H = nh; portrait = W / H < .9;
    camera.aspect = W / H;
    // enquadramento: 19,5 cm ocupam 64% da altura (44% no celular) — a garrafinha de 17,2 cm fica com ~56% em escala 1
    let dist = 1.95 / (portrait ? .44 : .64) / (2 * TANH);
    if (portrait) dist = Math.max(dist, 1.6 / (.62 * camera.aspect * 2 * TANH));
    camera.position.z = dist; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    visH = 2 * dist * TANH; visW = visH * camera.aspect; pxU = H / visH;
    const bh = 2 * BD_DIST * TANH; backdrop.scale.set(bh * camera.aspect, bh, 1);
    dpr = stillDpr();
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    composer.setPixelRatio(dpr); composer.setSize(W, H);
    sizeLo();
    camLo.position.copy(camera.position); camLo.aspect = camera.aspect; camLo.updateProjectionMatrix(); camLo.updateMatrixWorld();
    bdU.uRes.value.set(W, H);
    if (dropState === 0) dropY = visH * 1.15;
    measure();
    forceDraw = 3;
  }
  addEventListener('resize', resize);
  resize();

  // ---------- loop (zero alocação por quadro) ----------
  const clock = new THREE.Clock();
  const sstep = x => x * x * (3 - 2 * x), clamp = (x, a, b) => Math.min(Math.max(x, a), b), lerp = (a, b, k) => a + (b - a) * k;
  const easeIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const pv = new THREE.Vector3(), capW = new THREE.Vector3(), baseW = new THREE.Vector3(), topW = new THREE.Vector3(), axW = new THREE.Vector3();
  const splC = new THREE.Vector2(-1, -1), tmpC = new THREE.Color(), px2 = new THREE.Vector2();
  let t = 0, fpsAcc = 0, fpsN = 0, fpsGood = 0, first = true, lastScroll = scrollYc, scrollVel = 0, prevVx = 0, prevVy = 0, accX = 0;
  // render sob demanda: restT = tempo sem movimento; asleep = quadro máximo já desenhado, nada a fazer até acordar
  let restT = 0, sleepT = 0, wasLast = false, hqDone = false, asleep = false, itemsQuietAt = 0, actS = 0, bubT = 0, ambT = 0, hqAt = 0, hqSlow = 0;
  // parada: as gotas que escorrem continuam descendo — um quadro máximo a cada 1/6 s, só no desktop (no celular custa
  // bateria e aquecimento) e só enquanto o quadro máximo for barato: se a GPU demorar mais de 45 ms para apresentá-lo
  // 3 vezes seguidas, os quadros ambientes param e a garrafa parada fica realmente parada (as gotas voltam a andar no
  // próximo movimento). Era a origem do engasgo no início de cada rolagem em GPU integrada.
  let AMB = MOBILE ? Infinity : 1 / 6;
  const REST = MOBILE ? .45 : .3;   // tempo parado até o quadro máximo
  const TAU = Math.PI * 2;
  const still = (st, tg, eps) => Math.abs(st.v) < eps && Math.abs(st.x - tg) < eps;
  let lastPrev = -2, cutIdx = Math.round(targetS()), cutPhase = 0, cutT = 0, lastS = -1, lastSpin = 0, lastW = 0, lastH = 0;
  const toPx = (v, out) => { v.project(camera); return out.set((v.x * .5 + .5) * W, (v.y * .5 + .5) * H); };
  const SHORT = () => !portrait && H < 800;
  // celular: a garrafa inteira na metade de cima (linha do título a 36% do topo), um pouco menor
  const tyOf = fl => H * (portrait ? (fl.pose.tym ?? .64) : (SHORT() ? (fl.pose.tys ?? fl.pose.ty ?? .5) : (fl.pose.ty ?? .52)));
  const scOf = pz => portrait ? (pz.scm ?? pz.sc * .92) : (SHORT() ? (pz.scs ?? pz.sc) : pz.sc);
  function titleRect(T, out, fl) {
    const capPx = (portrait ? H * .095 : H * (SHORT() ? .25 : .29)) * (fl.pose.tcap ?? 1);
    const font = Math.min(capPx, (portrait ? .9 : .86) * W * TF / T.w);
    const k = font / TF;
    out.set(W * .5, tyOf(fl), T.w * k, T.h * k);
  }
  const D2R = Math.PI / 180, iv = new THREE.Vector3(), ipx = new THREE.Vector2();
  function spawnSplat(it) {
    const S = bdU.uSplat.value[splatN];
    iv.copy(it.mesh.position); toPx(iv, ipx);
    S.set(ipx.x, ipx.y, it.mesh.scale.x * H / (2 * (camera.position.z - it.L.z) * TANH) * .62, REDUCE ? -10 : t);
    bdU.uSplatC.value[splatN].copy(list[it.k].spC);
    splatOwner[splatN] = it.k; splatN = (splatN + 1) % 4; itemsQuietAt = Math.max(itemsQuietAt, t + 2);
  }
  // um ingrediente por vez: entra (cai/voa girando), pousa com mola, flutua com parallax e sai
  function updateItems(cur, sNow, dt) {
    for (let k = 0; k < 4; k++) if (splatOwner[k] >= 0 && splatOwner[k] !== cur) { splatOwner[k] = -1; bdU.uSplat.value[k].w = -1e5; }
    for (let n = 0; n < items.length; n++) {
      const it = items[n], L = it.L, sd = it.side;
      const want = (REDUCE ? cutIdx === it.k : cur === it.k) && (REDUCE || landed);
      if (want !== it.want) { it.want = want; it.at = REDUCE ? t : t + (want ? L.delay + .1 : L.delay * .4); itemsQuietAt = Math.max(itemsQuietAt, it.at + 2.4); }
      if (it.active !== it.want && t >= it.at) { it.active = it.want; if (it.active && it.drop) { it.splat = true; it.splatAt = REDUCE ? -1 : t + .5; } }
      const before = it.k > cur;
      const bx = portrait ? list[it.k].pose.xm : list[it.k].pose.x;
      let tx = bx + sd * (portrait ? L.mdx : L.dx), ty = portrait ? L.my : L.y, trz = L.rot * sd, tRy = 0;
      if (!it.active) { const o = before ? L.inO : L.outO; tx += sd * o[0]; ty += o[1]; trz += sd * (before ? L.inR : L.outR); }
      if (!REDUCE) {
        ty += Math.sin(t * .7 + it.ph) * .007 + (sNow - it.k) * L.par * .05 + mouse.sy * L.par * .008;
        tx -= mouse.sx * L.par * .012;
        trz += Math.sin(t * .45 + it.ph) * 3;
        tRy = Math.sin(t * .5 + it.ph) * .3;
      }
      if (REDUCE || !it.init) { it.x.x = tx; it.y.x = ty; it.rz.x = trz; it.ry.x = tRy; it.x.v = it.y.v = it.rz.v = it.ry.v = 0; it.init = true; }
      else { under(it.x, tx, 4.4, .58, dt); under(it.y, ty, 4.6, .5, dt); under(it.rz, trz, 3.8, .5, dt); under(it.ry, tRy, 3.4, .45, dt); }
      const moving = Math.abs(it.x.x - tx) + Math.abs(it.y.x - ty) > .004 || Math.abs(it.x.v) + Math.abs(it.y.v) > .01;
      const vis = it.active || (moving && !REDUCE);
      it.mesh.visible = it.sh.visible = vis;
      if (!vis) continue;
      const zd = camera.position.z - L.z, vh = 2 * zd * TANH, vw = vh * camera.aspect, size = portrait ? L.msize : L.size;
      it.mesh.position.set((it.x.x - .5) * vw, (it.y.x - .5) * vh, L.z);
      it.mesh.rotation.set(Math.sin(t * .4 + it.ph) * .12, it.ry.x, it.rz.x * D2R);
      it.mesh.scale.set(size, size, 1);
      const lift = (L.z + 2.4) * .045 * size;
      it.sh.position.set(it.mesh.position.x + lift * .6, it.mesh.position.y - lift, L.z - .03);
      it.sh.rotation.copy(it.mesh.rotation); it.sh.scale.set(size * 1.02, size * 1.02, 1);
      it.mat.uniforms.uBlur.value = L.blur; it.mat.uniforms.uSheen.value = it.ry.x * 1.3 + it.rz.v * .01;
      it.smat.uniforms.uAlpha.value = .24 * (1 - L.blur * .45);
      if (it.splat && t >= it.splatAt) { it.splat = false; spawnSplat(it); }
    }
  }

  function frame() {
    if (lost) return;
    requestAnimationFrame(frame);
    if (document.hidden) { clock.getDelta(); return; }
    const raw = clock.getDelta(), dt = Math.min(raw, .05), fT0 = performance.now();
    const scrolled = scrollYc !== lastScroll;
    // custo do último quadro máximo (a GPU segura o rAF seguinte enquanto não o apresenta)
    if (hqAt) { const d = performance.now() - hqAt; if (t > 3 && d > 45 && d < 500) { if (++hqSlow >= 3) AMB = Infinity; } else if (d <= 45) hqSlow = 0; hqAt = 0; }   // > 500 ms = aba escondida, não custo
    if (!REDUCE && asleep) {
      // dormindo: só acorda com scroll, evento (wakeReq), textura nova ou o passo lento das gotas que escorrem
      ambT += raw; sleepT += raw;
      // gotas escorrendo só com a garrafa parada há mais de 1,2 s, e nunca no final (lá o mouse vive passando pelos
      // cartões: um quadro máximo na fila da GPU segurava a troca de sabor seguinte)
      const amb = ambT >= AMB && sleepT > 1.2 && !wasLast;
      if (!scrolled && !wakeReq && forceDraw === 0 && !amb) return;
      if (amb) { ambT = 0; hqDone = false; } else sleepT = 0;
      asleep = false;
    }
    wakeReq = false;
    if (!REDUCE) t += dt;

    // seção A → B e progresso e da troca
    const sNow = targetS();
    let iA, iB, e;
    if (REDUCE) {
      // sem mola: corte suave. O canvas apaga (CSS), a cena troca de pose e o canvas volta.
      const want = Math.round(sNow);
      // a prévia dos cartões vira crossfade (mesmo corte suave, ~300 ms, sem giro)
      if (cutPhase === 0 && (want !== cutIdx || pvw.rm >= 0)) { cutPhase = 1; cutT = 0; canvas.classList.add('is-cut'); }
      else if (cutPhase === 1) { cutT += raw; if (cutT >= .14) { cutIdx = want; if (pvw.rm >= 0) { pvw.disp = pvw.from = pvw.to = pvw.rm; pvw.rm = -1; } cutPhase = 2; } }
      iA = iB = cutIdx; e = 0;
    } else if (fly.on) {
      fly.k = Math.min(1, fly.k + dt / fly.dur);
      iA = fly.from; iB = fly.to; e = easeIO(fly.k);
      if (fly.k >= 1) fly.on = false;
    } else {
      iA = Math.min(Math.floor(sNow), N - 2); iB = iA + 1;
      e = sstep(clamp((sNow - iA - .16) / .68, 0, 1));
    }
    const A = list[iA], B = list[iB], pa = A.pose, pb = B.pose, arc = Math.sin(Math.PI * e);
    const cur = e < .5 ? iA : iB;
    // prévia (só pousada na seção final): debounce, giro por ângulo e cores amarradas ao ângulo
    const onLast = REDUCE ? cutIdx === LAST : !fly.on && sNow > LAST - .2;
    const nowS = performance.now() / 1000;
    if (pvw.req !== -2 && nowS * 1000 - pvw.reqAt >= 150) { const T = onLast ? pvw.req : LAST; pvw.req = -2; pvApply(T, nowS); }
    if (!onLast && pvw.req === -2 && pvw.to !== LAST) { if (REDUCE) pvw.disp = pvw.from = pvw.to = LAST; else pvApply(LAST, nowS); }
    if (pvw.on) {
      const s = clamp((nowS - pvw.t0) / pvw.dur, 0, 1), s2 = s * s, s3 = s2 * s, D = pvw.a1 - pvw.a0, m = pvw.v0 * pvw.dur;
      pvw.ang = pvw.a0 + D * (3 * s2 - 2 * s3) + m * (s - 2 * s2 + s3);
      pvw.vel = (D * (6 * s - 6 * s2) + m * (1 - 4 * s + 3 * s2)) / pvw.dur;
      if (s >= 1) { pvw.on = false; pvw.ang = pvw.a1; pvw.vel = 0; }
    }
    const pt = -pvw.ang / (Math.PI * 2), half = Math.floor(pt * 2 + 1e-5), phi = pvw.on ? pt - Math.floor(pt + 1e-5) : 0;
    if (half !== pvw.half) {
      pvw.half = half;
      if (half & 1) { pvw.disp = pvw.to; slZ.v += .3; }   // de costas: troca rótulo
      else pvw.from = pvw.disp;                          // de frente: o próximo giro parte do que está à mostra
    }
    const pvOn = REDUCE ? onLast && pvw.disp !== LAST : onLast || pvw.on || pvw.disp !== LAST || pvw.from !== LAST;
    const cTo = REDUCE || phi >= .5 ? pvw.disp : pvw.to, cFrom = REDUCE ? pvw.disp : pvw.from;
    const wL = sstep(clamp((phi - .26) / .48, 0, 1)), wB = sstep(clamp((phi - .07) / .86, 0, 1)), wI = sstep(clamp((phi - .15) / .5, 0, 1));
    const bA = pvOn ? list[cFrom] : A, bB = pvOn ? list[cTo] : B, bE = pvOn ? wB : e, tE = pvOn ? 0 : e, lE = pvOn ? wL : e, iE = pvOn ? wI : e;

    // pose-alvo (o ponto CROSS da garrafa cruza a linha do título)
    const tx = portrait ? lerp(pa.xm, pb.xm, e) : lerp(pa.x, pb.x, e);
    // giro: volta inteira por troca, com easing próprio (começa e termina suave, pico de velocidade no meio)
    const es = REDUCE || fly.on ? e : easeIO(clamp((sNow - iA - .1) / .8, 0, 1)), turn = Math.sin(Math.PI * es);
    const tsc = lerp(scOf(pa), scOf(pb), e) * (1 - .1 * turn);
    const trz = lerp(A.tiltR, B.tiltR, e) * (portrait ? .8 : 1);
    const tSpin = lerp(A.spinR, B.spinR, es);
    const dax = (CROSS - MID) * CM * tsc;
    const tpx = (tx - .5) * visW + Math.sin(trz) * dax;
    const tpy = (lerp(tyOf(A), tyOf(B), e) / H - .5) * visH - Math.cos(trz) * dax - turn * visH * (fly.on ? .06 : .05);
    const trx = turn * (fly.on ? .26 : .16);

    if (REDUCE) {
      sp.x.x = tpx; sp.y.x = tpy; sp.sc.x = tsc; sp.rz.x = trz; sp.ry.x = tSpin; sp.rx.x = trx;
    } else {
      crit(sp.x, tpx, 5.2, dt); crit(sp.y, tpy, 5.6, dt); crit(sp.sc, tsc, 6, dt);
      crit(sp.rz, trz, 5.4, dt); crit(sp.ry, tSpin, 4.6, dt); crit(sp.rx, trx, 6, dt);
      // inclina na direção do movimento (proporcional à velocidade) e volta com leve overshoot
      scrollVel = lerp(scrollVel, (scrollYc - lastScroll) / Math.max(dt, 1e-3), .2);
      under(leanZ, clamp(-sp.x.v * .2, -.42, .42), 8.5, .38, dt);
      under(leanX, clamp(scrollVel * 6e-5, -.16, .16), 7.5, .4, dt);
      // slosh: o plano do líquido inclina contra a aceleração e amortece
      const ax = (sp.x.v - prevVx) / Math.max(dt, 1e-3), ay = (sp.y.v - prevVy) / Math.max(dt, 1e-3);
      accX = lerp(accX, ax, .35);
      under(slX, clamp(accX * .05 + leanZ.v * .05 + sp.ry.v * .035, -.55, .55), 7.2, .16, dt);   // ~3 ciclos visíveis
      under(slZ, clamp(sp.rx.v * .08 + leanX.v * .1, -.3, .3), 6.6, .18, dt);
      waveE = waveE * Math.exp(-dt * 1.8) + (Math.abs(ay) * .004 + Math.abs(slX.v) * .02 + Math.abs(sp.ry.v) * .05 + Math.abs(pvw.vel) * .04) * dt * 8;
      // arraste: mola de volta para a pose
      if (!dragging) {
        const target = Math.round(spinOff / (Math.PI * 2)) * Math.PI * 2;
        spinVel += (-(spinOff - target) * 16 - spinVel * 5.5) * dt;
        spinOff += spinVel * dt;
      } else { slX.v += dragV * .004; dragV *= .5; }
      // queda inicial com quique amortecido
      if (dropState === 1) {
        dropV -= 15 * dt; dropY += dropV * dt;
        if (dropY <= 0) {
          dropY = 0; landed = true;
          if (Math.abs(dropV) < .7) { dropState = 2; dropV = 0; if (capT === -2) { capT = 0; cap.visible = true; } }
          else { waveE += Math.abs(dropV) * .45; slX.v += .8; leanZ.v += .5; dropV = -dropV * .34; }
        }
      }
      if (landed && introK < 1) introK = Math.min(1, introK + dt / 1.2);
      mouse.sx += (mouse.x - mouse.sx) * .06; mouse.sy += (mouse.y - mouse.sy) * .06;
    }
    prevVx = sp.x.v; prevVy = sp.y.v; lastScroll = scrollYc;

    // aplica a pose
    const bob = REDUCE ? 0 : Math.sin(t * .9) * .018;
    rig.position.set(sp.x.x, sp.y.x + dropY + bob, 0);
    rig.rotation.set(sp.rx.x + leanX.x + mouse.sy * .07, 0, sp.rz.x + leanZ.x - mouse.sx * .06 + (REDUCE ? 0 : Math.sin(t * .55) * .01));
    rig.scale.setScalar(sp.sc.x);
    spin.rotation.y = sp.ry.x + spinOff + pvw.ang + (REDUCE ? 0 : Math.sin(t * .4) * .04);
    rig.updateMatrixWorld(true);

    // líquido: plano de nível no mundo (ponto no eixo à altura de enchimento)
    bottle.localToWorld(pv.set(0, FILL, 0));
    liqU.uLiqP.value.copy(pv);
    liqU.uLiqN.value.set(slX.x, 1, slZ.x).normalize();
    liqU.uWave.value = Math.min(.012, waveE * .004);
    liqU.uLiqTint.value.setRGB(lerp(bA.liq[0], bB.liq[0], lE), lerp(bA.liq[1], bB.liq[1], lE), lerp(bA.liq[2], bB.liq[2], lE));
    liqU.uLTime.value = t;
    if (!REDUCE) {
      // atividade do líquido: sobe na hora com giro/arranque/parada, cai devagar (espuma fina some em ~2 s)
      const act = clamp(Math.abs(sp.ry.v) * .22 + Math.abs(pvw.vel) * .14 + Math.hypot(sp.x.v, sp.y.v) * .6 + Math.abs(slX.v) + Math.abs(slZ.v) + waveE * .25, 0, 1);
      actS = Math.max(act, actS * Math.exp(-dt * .9));
      bubT += dt * (1 + 2.6 * actS);
      updateBubbles(bubT, actS);
      liqU.uFoamK.value = actS;
    }
    condU.uCT.value = REDUCE ? 41.3 : performance.now() / 1000;

    // rótulos: a frente troca de sabor quando está de costas (meia volta); o contrarrótulo, quando a frente encara a câmera
    const turns = -sp.ry.x / (Math.PI * 2);
    const fI = pvOn ? pvw.disp : REDUCE ? cutIdx : clamp(Math.round(turns), 0, N - 1);
    const bI = pvOn ? (pvw.on ? cTo : pvw.disp) : REDUCE ? cutIdx : clamp(Math.floor(turns) + 1, 0, N - 1);
    for (let side = 0; side < 2; side++) labelMats[side].map = labelTex(side, side ? bI : fI);
    tmpC.copy(bA.spC).lerp(bB.spC, lE); neckMat.color.copy(tmpC); capMat.color.copy(tmpC); capTopMat.color.copy(tmpC);

    // fundo
    bottle.localToWorld(pv.set(0, CROSS, 0));
    toPx(pv, px2);
    const sxT = px2.x - (portrait ? .12 : .075) * W, syT = px2.y - (portrait ? .03 : .06) * H;
    if (splC.x < 0 || REDUCE) splC.set(sxT, syT);
    else { const k = 1 - Math.exp(-dt * 5); splC.x += (sxT - splC.x) * k; splC.y += (syT - splC.y) * k; }
    bdU.uSplC.value.copy(splC);
    bdU.uSplR.value = (portrait ? Math.min(H * .15, W * .36) : H * .24) * clamp(sp.sc.x, .8, 1.1) * lerp(pa.spl ?? 1, pb.spl ?? 1, e);
    const jA = list.indexOf(bA), jB = list.indexOf(bB);
    bdU.uE.value = bE; bdU.uTE.value = tE; bdU.uIE.value = iE; bdU.uTime.value = t; bdU.uIntro.value = REDUCE ? 1 : sstep(introK);
    const bgA = pvOn ? pvBg[jA] : bA.bgC, bgB = pvOn ? pvBg[jB] : bB.bgC;
    bdU.uBgA.value.copy(bgA); bdU.uBgB.value.copy(bgB); bdU.uSpA.value.copy(bA.spC); bdU.uSpB.value.copy(bB.spC);
    bdU.uInkA.value.copy(bA.inkC); bdU.uInkB.value.copy(bB.inkC);
    bdU.uSdfA.value = sdfRT[jA].texture; bdU.uSdfB.value = sdfRT[jB].texture;
    // na prévia o título é sempre o da seção (o sabor do cartão não vira palavra gigante)
    const kA = pvOn ? LAST : jA, kB = pvOn ? LAST : jB;
    bdU.uTitA.value = titles[kA].tex; bdU.uTitB.value = titles[kB].tex;
    titleRect(titles[kA], bdU.uTitRA.value, list[kA]); titleRect(titles[kB], bdU.uTitRB.value, list[kB]);
    bdU.uIlA.value = illos[jA]; bdU.uIlB.value = illos[jB];
    updateItems(cur, sNow, dt);
    bottle.localToWorld(capW.set(0, TOP + .4, 0));
    toPx(capW, px2);
    const isz = portrait ? Math.min(H * .085, W * .2) : Math.min(H * .17, W * .12);
    const sgn = rig.rotation.z >= 0 ? 1 : -1;
    bdU.uIlR.value.set(clamp(px2.x - sgn * (portrait ? .15 : .085) * W, isz * .55 + 8, W - isz * .55 - 8), clamp(px2.y - (portrait ? .01 : .035) * H, isz * .6, H - isz * .6), isz, isz);
    // espuma e bolhas (Processo) e sombra de contato (pouso final, em pé)
    const pA = PROC < 0 ? 0 : REDUCE ? (cutIdx === PROC ? 1 : 0) : clamp(1 - Math.abs((fly.on ? lerp(iA, iB, e) : sNow) - PROC) * 1.9, 0, 1);
    bdU.uFoamA.value = bA.foam ? 1 : 0; bdU.uFoamB.value = bB.foam ? 1 : 0;
    const po = REDUCE ? (A.pose.stand ? 1 : 0) : lerp(pa.stand || 0, pb.stand || 0, e) * (1 - turn * .5);
    const sAlpha = (.3 + .7 * po) * (fly.on ? .5 : 1) * (1 - .6 * turn);
    bottle.localToWorld(baseW.set(0, 0, 0));
    toPx(baseW, px2);
    bdU.uShadow.value.set(px2.x, px2.y - 4 - (1 - po) * 10, .62 * sp.sc.x * pxU * (1.25 - .3 * po), sAlpha * (1 - clamp(dropY * 2, 0, 1)) * .85);
    tmpC.copy(bgA).lerp(bgB, bE); renderer.setClearColor(tmpC, 1);

    // bolhas em volta (Processo) e estouro de gás (CTA)
    procU.uCenter.value.set(sp.x.x, sp.y.x + .1, -.2);
    procU.uAlpha.value = pA;
    ptU.uTime.value = t;
    if (capT >= 0) { capT += dt; if (capEnter(capT)) { capT = -1; waveE += .3; } }
    if (popT >= 0) {
      popT += dt;
      const tt = popT - SCREW_T;   // gás sai quando a rosca solta
      if (tt >= 0 && tt - dt < 0) { waveE += 1.4; slX.v += 1.2; }
      if (capPop(popT)) popT = -1;
      bottle.localToWorld(pv.set(0, TOP - .3, 0));
      gasU.uO.value.copy(pv);
      gasU.uAxis.value.copy(axW.set(0, 1, 0).applyQuaternion(rig.quaternion));
      gasU.uT.value = popT >= 0 && tt >= 0 && tt < 1.3 ? tt : -1;
      gasU.uInk.value.copy(B.inkC);
    }

    // hover: teste analítico contra o eixo da garrafa projetado (sem alocar)
    if (needPick) {
      needPick = false;
      bottle.localToWorld(baseW.set(0, 0, 0)); toPx(baseW, px2); const bx = px2.x, by = H - px2.y;
      bottle.localToWorld(topW.set(0, TOP, 0)); toPx(topW, px2); const qx = px2.x, qy = H - px2.y;
      const vx = qx - bx, vy = qy - by, L2 = vx * vx + vy * vy || 1;
      const u = clamp(((mouse.px - bx) * vx + (mouse.py - by) * vy) / L2, 0, 1);
      const dx = mouse.px - (bx + vx * u), dy = mouse.py - (by + vy * u);
      const rad = 3.4 * CM * sp.sc.x * pxU * (u > .76 ? .6 : 1);
      const h = !REDUCE && mouse.has && !overUI && dx * dx + dy * dy < rad * rad;
      if (h !== hover) { hover = h; document.body.classList.toggle('is-grab', h); if (h) { leanZ.v += .55; waveE += .5; slX.v -= .5; } }
    }

    if (REDUCE) {
      // reduced-motion: só redesenha (em qualidade máxima) quando algo muda
      const dirty = forceDraw > 0 || first || cutIdx !== lastS || pvw.disp !== lastPrev || spinOff !== lastSpin || W !== lastW || H !== lastH;
      if (dirty) {
        lastS = cutIdx; lastSpin = spinOff; lastPrev = pvw.disp; lastW = W; lastH = H; if (forceDraw > 0) forceDraw--;
        placeHotspots(cur);
        ptU.uScale.value = H * dpr / (2 * TANH);
        composer.render();
      }
    } else {
      // movimento? scroll, molas, giro, tilt do mouse, entrada/saída de ingredientes, tampa, estouro, voo, prévia, arraste
      const busy = scrolled || fly.on || dropState !== 2 || introK < 1 || capT >= 0 || popT >= 0 || dragging || first
        || Math.abs(spinVel) > 1e-3 || Math.abs(spinOff - Math.round(spinOff / TAU) * TAU) > 1e-3
        || !still(sp.x, tpx, 6e-4) || !still(sp.y, tpy, 6e-4) || !still(sp.sc, tsc, 6e-4) || !still(sp.rz, trz, 6e-4) || !still(sp.ry, tSpin, 6e-4) || !still(sp.rx, trx, 6e-4)
        // balanço residual do líquido abaixo de ~1,7° (3e-2) não segura o quadro máximo: com 2e-3 o slosh, pouco amortecido,
        // "tocava" por ~8 s depois de cada parada ou hover nos cartões e a garrafa ficava esse tempo todo no compositor leve
        || Math.abs(leanZ.x) + Math.abs(leanZ.v) + Math.abs(leanX.x) + Math.abs(leanX.v) > 1e-2
        || Math.abs(slX.x) + Math.abs(slX.v) + Math.abs(slZ.x) + Math.abs(slZ.v) > 3e-2 || waveE > .05
        || pvw.on || pvw.req !== -2
        || Math.abs(mouse.x - mouse.sx) + Math.abs(mouse.y - mouse.sy) > 4e-3 || t < itemsQuietAt;
      if (busy) { restT = 0; hqDone = false; } else restT += raw;
      // no final, o quadro máximo espera 1 s sem mouse e sem troca de sabor: entre um cartão e outro ele ficava na fila
      // da GPU e travava a troca seguinte, e a nitidez piscava (leve ↔ máxima) a cada pausa curta
      // celular: também espera o dedo sair da tela, e a pausa mínima é .45 s (entre um arraste e outro)
      const nowMs = performance.now(), hold = (onLast && (nowMs - pvw.reqAt < 600 || nowMs - mouse.at < 600)) || touchDown;
      if (hold && !busy && restT >= REST) {
        // parado esperando: o último quadro leve fica na tela, sem redesenhar
      } else if (restT < REST) {
        placeHotspots(cur);
        ptU.uScale.value = H * lqDpr / (2 * TANH);
        if (MOBILE) glassMat.dispersion = 0;   // celular em movimento: sem dispersão (3× menos leituras no vidro); parado volta
        composerLo.render();
        if (canvas.dataset.q !== 'lq') canvas.dataset.q = 'lq';   // QA: #gl[data-q] diz se o quadro na tela é leve ou máximo
        jsAcc += performance.now() - fT0;   // tempo de CPU (JS + submissão) do quadro; a GPU vem depois, fora desta conta
        // DPR do movimento adaptativo: mede só quadros em movimento (abaixo de 50 fps desce, acima de 58 fps por 2 s
        // sobe), mas o novo tamanho só é aplicado com a cena parada — realocar os alvos no meio de uma troca era o tranco
        fpsAcc += raw; fpsN++;
        if (fpsAcc >= 1) {
          const fps = fpsN / fpsAcc; dbgJs = jsAcc / Math.max(1, fpsN); jsAcc = 0; fpsAcc = 0; fpsN = 0;
          dbgFps = fps; dbgShow();
          if (LQ_FORCE > 0) { /* resolução forçada pela URL: sem adaptação */ }
          else if (fps < (MOBILE ? 52 : 50) && lqWant > LQ_MIN) { lqWant = Math.max(LQ_MIN, lqWant - .25); fpsGood = 0; if (MOBILE) lqTop = lqWant; }
          else if (fps > 58 && lqWant < lqMax()) { if (++fpsGood >= 2) { lqWant = Math.min(lqMax(), lqWant + .25); fpsGood = 0; } }
          else fpsGood = 0;
        }
      } else {
        fpsAcc = fpsN = 0;
        if (lqWant !== lqDpr) {   // parada: nenhum dos dois compositores está em uso, pode realocar
          lqDpr = lqWant; sizeLo();
          const nd = stillDpr();
          if (nd !== dpr) { dpr = nd; renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); composer.setPixelRatio(dpr); composer.setSize(W, H); hqDone = false; }
        }
        if (!hqDone || forceDraw > 0) {
          placeHotspots(cur);
          ptU.uScale.value = H * dpr / (2 * TANH);
          glassMat.dispersion = DISP;
          composer.render(); hqAt = performance.now();
          if (canvas.dataset.q !== 'hq') { canvas.dataset.q = 'hq'; dbgShow(); }
          hqDone = true; if (forceDraw > 0) forceDraw--;
        }
        if (forceDraw === 0) asleep = true;
      }
    }
    wasLast = onLast;
    if (cutPhase === 2) { cutPhase = 0; canvas.classList.remove('is-cut'); }
    if (first) { first = false; mark('primeiro-quadro'); window.dispatchEvent(new Event('site:ready')); }

  }

  titles.forEach(T => renderer.initTexture(T.tex));
  illos.forEach(T => renderer.initTexture(T));
  mark('cena');
  try {
    // shaders compilados antes do 1º quadro, para as duas câmeras (o three prepara um alvo de transmissão por câmera)
    await renderer.compileAsync(scene, camera);
    if (MOBILE) glassMat.dispersion = 0;   // a variante sem dispersão (movimento no celular) também pronta
    await renderer.compileAsync(scene, camLo);
  } catch (e) { /* compila no 1º quadro */ }
  glassMat.dispersion = DISP;
  mark('shaders');
  frame();
}

function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
