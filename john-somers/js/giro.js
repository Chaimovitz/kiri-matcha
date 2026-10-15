// Giro de foto real: a peça foi girada num vídeo all-intra (todo quadro é chave), então arrastar com o dedo ou o mouse
// escolhe o quadro na hora (busca de 3 a 14 ms). Solta, ela segue com inércia; parada, volta a girar sozinha.
// Duas formas: volta inteira (data-n quadros em loop) ou ARCO (data-arco): o vídeo só tem os ângulos em que a IA não
// deformou a peça, e ela vai e volta dentro deles, com borracha nas pontas. data-zero = quadro da pose do catálogo.
// Ritmo: começa parada na pose do catálogo, gira, para de novo nela (movimento, parada, movimento).
// Não tem relógio próprio: tick() roda no rAF do app.
const FPS = 24;
const amortece = (k, dt) => 1 - Math.exp(-k * dt);
// 540 px só em tela pequena de densidade 1; em todo o resto o arquivo de 960 px (o tamanho nativo do giro), igual ao pôster
const leve = matchMedia('(max-width: 820px) and (max-resolution: 1dppx)');

export class Giro {
  constructor(el, { reduz = false } = {}) {
    this.el = el; this.v = el.querySelector('video'); this.nome = el.dataset.giro;
    this.N = +el.dataset.n || 168; this.zero = +el.dataset.zero || 0; this.arco = 'arco' in el.dataset;
    this.reduz = reduz; this.auto = !reduz;
    this.f = this.zero; this.vel = 0; this.mostrado = -1; this.pend = 0; this.pega = null; this.x0 = 0; this.solto = 0;
    this.modo = 'mao'; this.pronto = false; this.visivel = false; this.ativo = true; this.semPlay = false; this.carregando = false;
    this.espera = 0; this.fase = 0; this.c = (this.N - 1) / 2; this.A = (this.N - 1) / 2 - .5;
    this.larg = el.clientWidth || 400;
    new ResizeObserver(() => { this.larg = el.clientWidth || this.larg; }).observe(el);
    new IntersectionObserver(([e]) => { this.visivel = e.isIntersecting; this.acerta(); }, { threshold: .05 }).observe(el);
    this.v.muted = true; this.v.loop = false; this.v.playsInline = true;
    this.v.addEventListener('loadeddata', () => { if (this.pronto) return; this.pronto = true; el.classList.add('pronto'); this.pose(1400); }, { once: true });
    this.v.addEventListener('ended', () => { if (this.modo === 'auto' && !this.arco) this.pose(2000); }); // uma volta inteira: para na pose do catálogo

    el.addEventListener('pointerdown', e => {
      if (!this.pronto || e.button > 0) return;
      this.pega = e.pointerId; this.x0 = e.clientX; this.pend = 0; this.vel = 0; this.paraAuto();
      el.classList.add('pega', 'usado'); el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', e => { if (e.pointerId !== this.pega) return; this.pend += e.clientX - this.x0; this.x0 = e.clientX; }); // só acumula: aplica uma vez por quadro
    const solta = e => { if (e.pointerId !== this.pega) return; this.pega = null; this.solto = performance.now(); el.classList.remove('pega'); };
    el.addEventListener('pointerup', solta); el.addEventListener('pointercancel', solta); el.addEventListener('lostpointercapture', solta);
    el.addEventListener('keydown', e => { // teclado: setas giram 1/24 de volta
      const d = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0; if (!d || !this.pronto) return;
      e.preventDefault(); this.paraAuto(); this.f += d * 7; this.vel = 0; this.solto = performance.now(); el.classList.add('usado');
    });
  }

  // baixa o vídeo inteiro antes de usar (arrastar não pode esperar rede)
  carrega() {
    if (this.carregando) return this.prom; this.carregando = true;
    const url = `giro/${this.nome}-${leve.matches ? 'm' : 'd'}.mp4?v=11`; // versão no endereço: o cache de 1 dia não segura o arquivo antigo
    this.prom = fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(b => { this.v.src = URL.createObjectURL(b); this.v.preload = 'auto'; this.v.load(); })
      .catch(() => { this.v.src = url; this.v.preload = 'auto'; this.v.load(); });
    return this.prom;
  }

  // peça que chega na tela (vitrine): volta à pose do catálogo e espera antes de girar
  set ligado(on) { if (this.ativo === on) return; this.ativo = on; if (on && !this.el.classList.contains('usado')) this.pose(1400); else this.acerta(); }

  // mostra a pose do catálogo e segura por ms antes de girar sozinha
  pose(ms) {
    this.v.pause(); this.modo = 'auto'; this.f = this.zero; this.vel = 0; this.v.currentTime = (this.zero + .5) / FPS; this.mostrado = this.zero;
    this.espera = performance.now() + ms; this.fase = Math.asin(Math.max(-1, Math.min(1, (this.zero - this.c) / this.A)));
  }

  // vídeo tocando só na volta inteira, com a peça na tela, ativa, fora da espera e sem ninguém girando à mão
  acerta() {
    if (!this.pronto) return;
    const deve = this.visivel && this.ativo && this.auto && this.modo === 'auto' && !this.arco && !this.semPlay && performance.now() >= this.espera;
    if (deve && this.v.paused) this.v.play().catch(() => { this.semPlay = true; }); // iPhone em economia de energia: gira por busca
    else if (!deve && !this.v.paused) this.v.pause();
  }

  paraAuto() {
    if (this.modo === 'auto' && !this.v.paused) { this.v.pause(); this.f = Math.round(this.v.currentTime * FPS - .5); }
    this.modo = 'mao'; this.espera = 0; this.mostrado = -1;
  }

  busca(i) { if (i !== this.mostrado && !this.v.seeking) { this.v.currentTime = (i + .5) / FPS; this.mostrado = i; } }
  quadro(f) { return this.arco ? Math.max(0, Math.min(this.N - 1, Math.round(f))) : ((Math.round(f) % this.N) + this.N) % this.N; }

  tick(now, dt) {
    if (!this.pronto || !this.visivel) { this.pend = 0; return; }
    if (this.modo === 'auto') {
      if (!this.ativo || !this.auto || now < this.espera) return;
      if (!this.arco && !this.semPlay) { if (this.v.paused) this.acerta(); return; } // volta inteira: o vídeo anda sozinho
      if (this.arco) { this.fase += dt * (this.N > 80 ? .36 : .62); this.f = this.c + this.A * Math.sin(this.fase); } // vai e volta, devagar nas pontas
      else { const f0 = this.f; this.f += FPS * .6 * dt; if (Math.floor(f0 / this.N) !== Math.floor(this.f / this.N)) { this.pose(2000); return; } }
      this.busca(this.quadro(this.f)); return;
    }
    if (this.pega !== null) {
      let df = -this.pend * this.N / (this.larg * (this.arco ? 1.15 * this.N / 168 : 1.15)); this.pend = 0; // mesma relação dedo/ângulo nas peças em arco; arrastar para a direita leva a frente para a direita
      if (this.arco && (this.f < 0 && df < 0 || this.f > this.N - 1 && df > 0)) df *= .25; // borracha depois da ponta
      this.f += df; this.vel += (Math.max(-this.N, Math.min(this.N, df / Math.max(dt, .008))) - this.vel) * .35;
    } else {
      this.f += this.vel * dt; this.vel *= Math.exp(-3 * dt);
      if (this.arco && (this.f < 0 || this.f > this.N - 1)) { this.vel = 0; this.f += (Math.max(0, Math.min(this.N - 1, this.f)) - this.f) * amortece(10, dt); } // volta da ponta
      if (this.auto && this.ativo && now - this.solto > 2600 && Math.abs(this.vel) < 3) { // parada: retoma o giro de onde está
        this.modo = 'auto'; this.espera = 0;
        if (this.arco) this.fase = Math.asin(Math.max(-1, Math.min(1, (this.f - this.c) / this.A)));
        else if (!this.semPlay) { this.v.currentTime = (this.quadro(this.f) + .5) / FPS; this.acerta(); }
        return;
      }
    }
    this.busca(this.quadro(this.f));
  }
}
