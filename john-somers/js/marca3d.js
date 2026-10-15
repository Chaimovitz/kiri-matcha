// A marca no metal: close da punção JS ✕ MG batida no cálice, em 3D, com luz rasante que segue o mouse (no celular,
// a inclinação ou a rolagem). É o único lugar do site com three: as peças inteiras são foto real girando (giro.js).
// Carregado sob demanda quando a seção se aproxima; só desenha enquanto ela está na tela.
import * as THREE from 'three';
import { caliceGeo, carimbar, texturasPuncao, estanho } from './torno.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t;
const amortece = (k, dt) => 1 - Math.exp(-k * dt);
const cede = (ms = 0) => new Promise(r => setTimeout(r, ms)); // devolve a vez à página entre as etapas pesadas (montar tudo de uma vez travava 330–500 ms)

export async function marca3d(canvas, { movel, reduz }) {
  let R;
  try { R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' }); if (!R.getContext()) throw 0; }
  catch (e) { return null; }
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.3;
  R.setClearColor(0x0b0b0b, 1);
  await cede();
  const cena = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, .04, 40);

  // ---- estúdio fotográfico (cubemap 512 → PMREM): softboxes, janelas com caixilhos, pontos de luz e bandas pretas ----
  {
    const s = new THREE.Scene();
    const sala = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x625d57, side: THREE.BackSide })); sala.scale.set(30, 18, 30); s.add(sala);
    const grad = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const macia = grad(256, 256, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, '#fff'); r.addColorStop(.55, '#f2f2f2'); r.addColorStop(.86, '#4a4a4a'); r.addColorStop(1, '#000'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
    const tira = grad(64, 512, (g, w, h) => {
      const l = g.createLinearGradient(0, 0, w, 0); l.addColorStop(0, '#000'); l.addColorStop(.22, '#d8d8d8'); l.addColorStop(.5, '#fff'); l.addColorStop(.78, '#d8d8d8'); l.addColorStop(1, '#000'); g.fillStyle = l; g.fillRect(0, 0, w, h);
      const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, '#000'); v.addColorStop(.07, 'rgba(0,0,0,0)'); v.addColorStop(.93, 'rgba(0,0,0,0)'); v.addColorStop(1, '#000'); g.fillStyle = v; g.fillRect(0, 0, w, h); });
    const janela = grad(512, 384, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const cols = 3, rows = 2, m = 16;
      for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) { const x = m + a * (w - m) / cols, y = m + b * (h - m) / rows, pw = (w - m) / cols - m, ph = (h - m) / rows - m;
        const l = g.createLinearGradient(x, y, x, y + ph); l.addColorStop(0, '#ffffff'); l.addColorStop(1, '#cdd5dc'); g.fillStyle = l; g.fillRect(x, y, pw, ph); } });
    const janelaV = grad(256, 640, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const cols = 2, rows = 4, m = 12;
      for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) { const x = m + a * (w - m) / cols, y = m + b * (h - m) / rows, pw = (w - m) / cols - m, ph = (h - m) / rows - m;
        const l = g.createLinearGradient(x, y, x + pw, y); l.addColorStop(0, '#e9eef2'); l.addColorStop(.5, '#ffffff'); l.addColorStop(1, '#dfe5ea'); g.fillStyle = l; g.fillRect(x, y, pw, ph); } });
    const painel = (tex, k, cor, pos, esc) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(cor).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.scale.set(esc[0], esc[1], 1); m.lookAt(0, 1.5, 0); s.add(m); };
    painel(macia, 5, 0xffffff, [0, 9, 1], [14, 9]);
    painel(janelaV, 12, 0xffffff, [-9.5, 2.5, 9.5], [4.2, 15]);
    painel(janelaV, 9, 0xffffff, [9.5, 2.5, 9.5], [3, 15]);
    painel(tira, 6, 0xffffff, [-2.2, 2.5, 13], [1.2, 13]);
    painel(janela, 4, 0xfff6ea, [3.5, 4, 12.5], [5, 3.6]);
    painel(tira, 3.2, 0xeef3ff, [-4, 2.5, -13], [1.4, 13]);
    painel(tira, 3.2, 0xfff3e6, [4, 2.5, -13], [1.4, 13]);
    painel(macia, 1.2, 0xd9d2c8, [0, -8.5, 0], [22, 22]);
    for (const [x, z, w] of [[-14.4, 3, 7], [14.4, 3, 7], [-12, -9, 4], [12, -9, 4]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 17), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })); m.position.set(x, 1.5, z); m.lookAt(0, 1.5, 0); s.add(m); }
    const bola = new THREE.SphereGeometry(1, 16, 12);
    for (const [p, r, k] of [[[-6, 6, 7], .45, 60], [[7, 5, 6], .35, 45], [[-2, 7.5, -6], .3, 30]]) { const m = new THREE.Mesh(bola, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(k) })); m.position.set(...p); m.scale.setScalar(r); s.add(m); }
    const rtc = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(.1, 100, rtc); cc.position.set(0, 1.5, 0);
    R.setRenderTarget(rtc); await R.compileAsync(s, cc); R.setRenderTarget(null); await cede(); // shaders do estúdio compilam fora da linha principal
    cc.update(R, s); await cede();
    const pm = new THREE.PMREMGenerator(R); pm.compileCubemapShader(); await cede(120);
    cena.environment = pm.fromCubemap(rtc.texture).texture; pm.dispose(); rtc.dispose(); await cede();
    s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  }
  // no close o estúdio quase apaga e quem faz o relevo é a lanterna rasante; um preenchimento mínimo deixa os três escudos legíveis
  const chave = new THREE.DirectionalLight(0xffffff, .26); chave.position.set(-5, 5, 5); cena.add(chave);
  cena.add(new THREE.HemisphereLight(0xfff4e8, 0x1c1a18, .4));
  const recorte = new THREE.DirectionalLight(0xa9c4ff, .64); recorte.position.set(6, 2.5, -5); cena.add(recorte);
  const recorteQ = new THREE.DirectionalLight(0xffc9a0, .52); recorteQ.position.set(-6, 2.5, -5); cena.add(recorteQ);
  const lanterna = new THREE.PointLight(0xfff1df, .11, 0, 2); cena.add(lanterna);
  const preenche = new THREE.DirectionalLight(0xfff6ec, 1.1); preenche.position.set(0, 3, 8); cena.add(preenche);
  cena.environmentIntensity = .35; // reflexo do estúdio vivo o bastante para não virar cinza fosco

  // ---- o cálice no torno, com a punção na face da taça (ângulo 0 = de frente para +z) ----
  const PUN = { ang: 0, y: 1.273, w: .22, h: .061, r: .345 };
  const tp = texturasPuncao(R);
  const g = caliceGeo(200); carimbar(g, PUN);
  const calice = new THREE.Mesh(g, estanho({ cor: 0xe2dfd9, rug: .28, metal: .85, punc: tp })); cena.add(calice);

  // ---- câmera: chega um pouco mais longe e encosta na punção conforme a seção passa ----
  let W = 0, H = 0, qa = 1, dpr = 1;
  function tamanho() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2); R.setPixelRatio(dpr * qa); R.setSize(w, h, false);
    W = w; H = h; cam.aspect = w / h; cam.fov = w / h < .8 ? 34 : 28; cam.updateProjectionMatrix();
  }
  tamanho();
  const v3 = new THREE.Vector3();
  let lx = 0, ly = 0, mediaDt = 16.7, lentoDesde = 0, ang = 0;

  [tp.nrm, tp.cor, tp.rug].forEach(t => R.initTexture(t));
  await R.compileAsync(cena, cam); await cede();
  R.render(cena, cam); // 1º desenho com o canvas ainda invisível: sobe a geometria antes de a seção chegar
  let iv = 16.7, rapidoDesde = 0; const ivs = []; // intervalo real do relógio (60, 40 ou 30 Hz): tela de 40 Hz não é GPU lenta

  // prog: 0 quando a seção encosta no topo, 1 no fim do trecho fixo; luz: alvo da luz em -1..1 (mouse, inclinação ou varredura)
  function quadro(now, dt, prog, luzX, luzY) {
    const perto = movel ? (W / H < .6 ? 1.16 : 1.0) : .58; // celular em pé: os três escudos inteiros na largura
    const d = perto * lerp(1.32, 1, Math.min(1, prog / .45 + .15)); // aproxima no começo e fica
    const sx = movel ? 0 : .11, sy = movel ? .2 : 0; // a punção sai do lado do texto
    cam.position.set(0, PUN.y + .03, PUN.r + d); cam.lookAt(0, PUN.y, PUN.r);
    cam.setViewOffset(W, H, -sx * W, sy * H, W, H); cam.updateMatrixWorld();
    const ka = reduz ? 1 : amortece(3, dt);
    ang += ((reduz ? 0 : (prog - .5) * (movel ? .18 : .34)) - ang) * ka; calice.rotation.y = ang; // a punção desliza devagar com a rolagem: é metal girando, não foto parada
    const kl = amortece(4, dt); lx += (luzX - lx) * kl; ly += (luzY - ly) * kl;
    v3.set(Math.max(lx, movel ? -1 : -.3) * .2, PUN.y - .025 + ly * .07, PUN.r + .075); lanterna.position.copy(v3); // o brilho rasante cai em cima do carimbo
    cena.environmentRotation.y = .35 + Math.PI + (movel ? Math.sin(now / 1000 * .2) * .25 : lx * .45);
    // resolução adaptativa: GPU integrada não trava no close
    if (ivs.length < 40) { ivs.push(dt * 1000); if (ivs.length === 40) iv = [...ivs].sort((a, b) => a - b)[20]; }
    mediaDt += ((dt * 1000) - mediaDt) * .05;
    if (ivs.length >= 40 && mediaDt < iv * 1.06 && qa < 1) { if (!rapidoDesde) rapidoDesde = now; if (now - rapidoDesde > 3500) { qa = Math.min(1, qa * 1.08); R.setPixelRatio(dpr * qa); R.setSize(W, H, false); rapidoDesde = now; } } else rapidoDesde = 0;
    if (ivs.length >= 40 && mediaDt > Math.max(23, iv * 1.35)) { if (!lentoDesde) lentoDesde = now; if (now - lentoDesde > 900 && qa > .62) { qa = Math.max(.62, qa * .86); R.setPixelRatio(dpr * qa); R.setSize(W, H, false); lentoDesde = now; } } else lentoDesde = 0;
    R.render(cena, cam);
  }
  return { quadro, tamanho };
}
