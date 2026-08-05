// <brot-particles colors="#hex,#hex,#hex" count="14"> — partículas flotantes de Manifiesto.
(function () {
  if (customElements.get('brot-particles')) return;
  class BrotParticles extends HTMLElement {
    connectedCallback() {
      this.style.display = 'block';
      this.style.pointerEvents = 'none';
      this.style.position = 'absolute';
      this.style.top = '0';
      this.style.left = '0';
      this.style.right = '0';
      this.style.bottom = '0';
      if (!this._c) {
        this._c = document.createElement('canvas');
        this._c.style.cssText = 'width:100%;height:100%;display:block';
        this.appendChild(this._c);
      }
      this._colors = (this.getAttribute('colors') || '#C9F3C6,#FBD9BC,#EFF6E2').split(',');
      this._n = parseInt(this.getAttribute('count')) || 14;
      this._ro = new ResizeObserver(() => this._size());
      this._ro.observe(this);
      this._size();
      this._t0 = performance.now();
      const loop = (now) => { this._draw(now); this._raf = requestAnimationFrame(loop); };
      cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame(loop);
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); if (this._ro) this._ro.disconnect(); }
    _size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.clientWidth || 300, h = this.clientHeight || 200;
      this._c.width = Math.round(w * dpr);
      this._c.height = Math.round(h * dpr);
      this._w = w; this._h = h; this._dpr = dpr;
      if (!this._ps || this._ps.length !== this._n) {
        this._ps = Array.from({ length: this._n }, (_, i) => ({
          x: Math.random(), y: Math.random(), r: 1.2 + Math.random() * 2.2,
          s: 0.006 + Math.random() * 0.012, ph: Math.random() * 6.28,
          c: this._colors[i % this._colors.length], tw: 0.6 + Math.random() * 1.2,
        }));
      }
    }
    _draw(now) {
      if (!this._w) return;
      const t = (now - this._t0) / 1000;
      const ctx = this._c.getContext('2d');
      ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      ctx.clearRect(0, 0, this._w, this._h);
      for (const p of this._ps) {
        const y = (((p.y - t * p.s) % 1) + 1) % 1;
        const x = p.x + Math.sin(t * 0.5 + p.ph) * 0.02;
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * p.tw + p.ph));
        ctx.fillStyle = p.c;
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(x * this._w, y * this._h, p.r, 0, 6.283); ctx.fill();
        ctx.globalAlpha = a * 0.25;
        ctx.beginPath(); ctx.arc(x * this._w, y * this._h, p.r * 2.6, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  customElements.define('brot-particles', BrotParticles);
})();
