// Peças torneadas: perfil -> LatheGeometry, e a punção "JS ✕ MG" em relevo.
// A punção vive num 2º UV (uv1) calculado em coordenadas cilíndricas: um carimbo pequeno (bump + cor + rugosidade)
// em vez de uma textura do tamanho da peça inteira.
import * as THREE from 'three';

const V2 = THREE.Vector2;

// Catmull-Rom centrípeta + reamostragem por comprimento de arco: o torno fica liso e o v do UV, uniforme
export function reamostrar(pts, n) {
  const P = pts.map(([r, y]) => new V2(r, y));
  const curva = new THREE.SplineCurve(P);
  return curva.getSpacedPoints(n).map(p => new V2(Math.max(0, p.x), p.y));
}

// Douglas-Peucker: corta pontos redundantes do perfil medido (mantém anéis e quinas)
export function enxugar(pts, tol) {
  if (pts.length < 3) return pts;
  const dist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy; let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  let im = 0, dm = 0; for (let i = 1; i < pts.length - 1; i++) { const d = dist(pts[i], pts[0], pts[pts.length - 1]); if (d > dm) { dm = d; im = i; } }
  if (dm <= tol) return [pts[0], pts[pts.length - 1]];
  return [...enxugar(pts.slice(0, im + 1), tol).slice(0, -1), ...enxugar(pts.slice(im), tol)];
}

// ---------- cálice P105D: silhueta medida na foto do catálogo (px; 100 px = 1 un. da foto) ----------
const CALICE_PX = [[0,752],[150,752],[160,748],[160,733],[150,722],[128,710],[96,697],[62,684],[47,668],[40,653],[36,638],[36,608],[38,593],[46,563],[52,548],[58,533],[63,518],[60,503],[53,488],[42,473],[38,458],[40,443],[53,428],[58,413],[95,398],[114,383],[128,368],[136,353],[142,338],[146,323],[150,308],[154,278],[158,248],[162,203],[166,173],[170,128],[175,113],[180,83],[183,68],[185,55],[182,44],[176,38],
  [170,40],[166,60],[160,120],[154,200],[146,280],[134,330],[112,362],[70,380],[0,386]];
export const CALICE_ALT = 1.45; // 14,5 cm (1 unidade da cena = 10 cm)
export function caliceGeo(segs = 200) {
  const s = CALICE_ALT / 7.14;
  const pts = reamostrar(CALICE_PX.map(([r, y]) => [r / 100 * s, (752 - y) / 100 * s]), 260);
  const g = new THREE.LatheGeometry(pts, segs);
  return g;
}

// ---------- caneca P34B: corpo refeito do perfil medido no scan (fora, borda, dentro, fundo) ----------
export function canecaGeo(perfil, altura, segs = 200) {
  const s = altura / perfil.H;
  const O = perfil.outer.map(([y, r]) => new V2(r * s, y * s));
  const I = perfil.inner.map(([y, r]) => new V2(r * s, y * s));
  const yF = perfil.yFloor * s;
  const fora = enxugar(O, 0.0012), dentro = enxugar(I, 0.0016);
  const topo = fora[fora.length - 1], topoI = dentro[dentro.length - 1];
  // borda arredondada: meia-volta entre a parede de fora e a de dentro
  const yb = Math.max(topo.y, topoI.y), cr = (topo.x + topoI.x) / 2, a = (topo.x - topoI.x) / 2, borda = [];
  for (let k = 1; k < 10; k++) { const t = k / 10 * Math.PI; borda.push(new V2(cr + a * Math.cos(t), yb + a * .7 * Math.sin(t))); }
  const pts = [new V2(0, 0.004), new V2(fora[0].x * .96, 0), ...fora, ...borda, ...dentro.slice().reverse(), new V2(dentro[0].x * .98, yF), new V2(0, yF)];
  return new THREE.LatheGeometry(pts, segs);
}

// ---------- punção: 2º UV cilíndrico em volta de (ang, y) ----------
// ang no mesmo sentido do torno do three: x = r·sen(φ), z = r·cos(φ)  =>  φ = atan2(x, z)
export function carimbar(geo, { ang, y, w, h }) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), yy = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
    const d = Math.atan2(x, z) - ang, fora = r > 1e-4 ? (n.getX(i) * x + n.getZ(i) * z) / r : 0;
    // tudo contínuo: sen(d) não tem costura atrás; (1-cos d)² empurra o verso para fora do carimbo
    // e (1-fora)² empurra a parede de dentro; nenhum salto de UV => nenhuma linha de mipmap grosso
    uv[i * 2] = .5 + Math.sin(d) * r / w;
    uv[i * 2 + 1] = .5 + (yy - y) / h + 1.2 * (1 - Math.cos(d)) ** 2 + 1.5 * (1 - fora) ** 2;
  }
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
}

// mapas da punção redesenhada a partir da foto da P34B (normal + cor + rugosidade no canal G), no 2º UV
// as texturas nascem neutras (1 px) e recebem a imagem quando ela chega: o cálice aparece no 1º quadro
// e o shader não recompila quando a punção carrega (o programa já foi compilado com os três mapas)
export function texturasPuncao(renderer) {
  const an = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const um = (url, px, srgb) => {
    const c = document.createElement('canvas'); c.width = c.height = 1; c.getContext('2d').fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`; c.getContext('2d').fillRect(0, 0, 1, 1);
    const t = new THREE.Texture(c); t.channel = 1; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = an; t.needsUpdate = true;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    const im = new Image(); im.decoding = 'async';
    im.onload = () => (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { t.dispose(); t.image = im; t.needsUpdate = true; }); // dispose: o armazenamento da GPU tem tamanho fixo
    im.src = url;
    return t;
  };
  return { nrm: um('img/puncao-normal.png', [128, 128, 255, 255]), cor: um('img/puncao-cor.png', [255, 255, 255, 255], true), rug: um('img/puncao-rug.png', [0, 82, 0, 255]) };
}

// estanho: metal com sulcos finos de torno (rugosidade e normal variando com a altura, somem de longe)
// e a punção opcional (normal map que se apaga em ângulo rasante, para não serrilhar quando a peça gira)
export const LINHAS = { value: 1 }; // multiplicador global dos sulcos (o close da punção baixa)
export function estanho({ cor = 0xe8e8e8, rug = .15, linhas = 0, punc = null, env = 1, envMap = null } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: cor, metalness: 1, roughness: rug, clearcoat: 1, clearcoatRoughness: .05, reflectivity: 1, envMapIntensity: env, envMap }); // estanho de joalheria (pedido): metal 1, rugosidade .15, verniz 1/.05
  if (punc) { m.normalMap = punc.nrm; m.normalScale.set(1, 1); m.map = punc.cor; m.roughnessMap = punc.rug; m.roughness = rug / .32; } // o mapa da punção tem a superfície em .32: a rugosidade final da superfície fica = rug
  m.onBeforeCompile = sh => {
    sh.uniforms.uLinhas = { value: linhas }; sh.uniforms.uFreq = { value: 1100 }; sh.uniforms.uLinhasG = LINHAS;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vYm;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvYm = (modelMatrix * vec4(transformed, 1.)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vYm; uniform float uLinhas; uniform float uFreq; uniform float uLinhasG;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          float pequeno = smoothstep( .008, .022, fwidth( vMapUv.x ) ); // punção pequena na tela: menos contraste (de longe virava mancha)
          sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, vec3( 1. ), pequeno * .75 );
          diffuseColor *= sampledDiffuseColor;
        #endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float fl = vYm * uFreq; float fadeL = (1. - smoothstep(.15, .45, fwidth(fl))) * uLinhasG;
        float hsh = fract(sin(floor(fl) * 91.7) * 43758.5453);
        roughnessFactor = clamp(roughnessFactor * (1. + uLinhas * fadeL * (hsh - .5) * .16), .06, 1.);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef USE_NORMALMAP
          float rasante = smoothstep(.16, .5, abs(dot(nonPerturbedNormal, normalize(vViewPosition))));
          normal = normalize(mix(nonPerturbedNormal, normal, rasante));
        #endif
        vec3 cimaV = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
        normal = normalize(normal + cimaV * sin(fl * 6.2832) * uLinhas * .0035 * fadeL);`);
  };
  m.customProgramCacheKey = () => 'estanho' + (punc ? 'p' : '');
  return m;
}

// alça da P34B refeita da foto do catálogo: fita larga e chata (9,4 × 2,5 mm), apoio do polegar com três frisos
// e a ponta de baixo encostada no corpo. O scan do Tripo tinha inventado uma alça fina, redonda e com folha.
export function alcaP34B(perfil, altura, mat) {
  const s = altura / perfil.H, O = perfil.outer.map(([y, r]) => [y * s, r * s]);
  const rFora = y => { if (y <= O[0][0]) return O[0][1]; for (let i = 1; i < O.length; i++) if (O[i][0] >= y) { const t = (y - O[i - 1][0]) / (O[i][0] - O[i - 1][0]); return O[i - 1][1] + (O[i][1] - O[i - 1][1]) * t; } return O[O.length - 1][1]; };
  const H = altura, G = new THREE.Group();
  // linha de centro no plano (afastamento da parede d, altura relativa h), lida na foto
  const C = [[-.03, .885], [.07, .89], [.17, .893], [.26, .888], [.33, .862], [.37, .79], [.378, .67], [.355, .55], [.3, .45], [.21, .37], [.11, .315], [.04, .29], [-.02, .278]];
  const curva = new THREE.CatmullRomCurve3(C.map(([d, h]) => new THREE.Vector3(rFora(h * H) + d, h * H, 0)), false, 'centripetal');
  const w = .13, e = .052, r = .014, sec = new THREE.Shape(); // 13 × 5 mm: a fita larga que aparece na foto
  sec.moveTo(-w / 2 + r, -e / 2); sec.lineTo(w / 2 - r, -e / 2); sec.quadraticCurveTo(w / 2, -e / 2, w / 2, -e / 2 + r * .6); sec.lineTo(w / 2, e / 2 - r * .6); sec.quadraticCurveTo(w / 2, e / 2, w / 2 - r, e / 2);
  sec.lineTo(-w / 2 + r, e / 2); sec.quadraticCurveTo(-w / 2, e / 2, -w / 2, e / 2 - r * .6); sec.lineTo(-w / 2, -e / 2 + r * .6); sec.quadraticCurveTo(-w / 2, -e / 2, -w / 2 + r, -e / 2);
  const fita = new THREE.ExtrudeGeometry(sec, { steps: 160, extrudePath: curva, bevelEnabled: false, curveSegments: 6 });
  G.add(new THREE.Mesh(fita, mat));
  // três frisos no apoio do polegar (perto da ponta de fora da placa de cima)
  const friso = new THREE.BoxGeometry(.016, .014, w * .96), hEm = d => { for (let i = 1; i < C.length; i++) if (C[i][0] >= d) { const t = (d - C[i - 1][0]) / (C[i][0] - C[i - 1][0]); return C[i - 1][1] + (C[i][1] - C[i - 1][1]) * t; } return C[C.length - 1][1]; };
  [.17, .205, .24].forEach(d => { const yc = hEm(d) * H, y = yc + e / 2 + .004; const m = new THREE.Mesh(friso, mat); m.position.set(rFora(yc) + d, y, 0); G.add(m); }); // encostados na placa
  // a ponta de baixo, encostada no corpo
  const ponta = new THREE.Mesh(new THREE.BoxGeometry(.034, .08, w), mat); ponta.position.set(rFora(.265 * H) + .008, .265 * H, 0); G.add(ponta);
  return G;
}
