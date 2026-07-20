// <cold-start logo bg text dot particles> — overlay de arranque en frío: logo crece, wordmark, fade a la pantalla de abajo. Loop demo ~6s.
(function () {
  if (customElements.get('cold-start')) return;
  class ColdStart extends HTMLElement {
    connectedCallback() {
      const logo = this.getAttribute('logo') || '';
      const bg = this.getAttribute('bg') || '#E9EBE0';
      const text = this.getAttribute('text') || '#24382A';
      const dot = this.getAttribute('dot') || '#D97E4F';
      this._colors = (this.getAttribute('particles') || '#7FB069,#E8A87C,#9BB894').split(',');
      this.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;display:block;pointer-events:none;z-index:5';
      this.innerHTML = '';
      const top = parseFloat(this.getAttribute('top')) || 52;
      const bottom = parseFloat(this.getAttribute('bottom')) || 228;
      const ov = document.createElement('div');
      ov.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:' + bg + ';display:flex;flex-direction:column;align-items:center';
      const cv = document.createElement('canvas');
      cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';
      // misma geometría que la Bienvenida: spacer status bar / centro flex / spacer del bloque CTA
      const topSp = document.createElement('div');
      topSp.style.cssText = 'height:' + top + 'px;flex:none';
      const mid = document.createElement('div');
      mid.style.cssText = 'position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center';
      const img = document.createElement('img');
      img.src = logo;
      img.style.cssText = 'width:160px;height:128px;object-fit:contain;opacity:0;transform:scale(0.55)';
      const word = document.createElement('div');
      word.innerHTML = 'Manifiesto<span style="color:' + dot + '">.</span>';
      word.style.cssText = 'font-family:Nunito,sans-serif;font-size:42px;font-weight:900;letter-spacing:-0.01em;color:' + text + ';margin-top:22px;opacity:0;transform:translateY(10px)';
      // reserva la altura del tagline para que el wordmark quede idéntico a la Bienvenida
      const tagSp = document.createElement('div');
      tagSp.style.cssText = 'height:29px;flex:none';
      const botSp = document.createElement('div');
      botSp.style.cssText = 'height:' + bottom + 'px;flex:none';
      mid.appendChild(img); mid.appendChild(word); mid.appendChild(tagSp);
      ov.appendChild(cv); ov.appendChild(topSp); ov.appendChild(mid); ov.appendChild(botSp);
      this.appendChild(ov);
      this._ov = ov; this._img = img; this._word = word; this._cv = cv;
      this._t0 = performance.now();
      this._size();
      this._ro = new ResizeObserver(() => this._size());
      this._ro.observe(this);
      const raf = (now) => { this._draw(now); this._raf = requestAnimationFrame(raf); };
      this._raf = requestAnimationFrame(raf);
      this._timers = [];
      const play = () => {
        // reset instantáneo
        [ov, img, word].forEach((el) => { el.style.transition = 'none'; });
        ov.style.opacity = '1';
        img.style.opacity = '0'; img.style.transform = 'scale(0.55)';
        word.style.opacity = '0'; word.style.transform = 'translateY(10px)';
        void ov.offsetWidth;
        ov.style.transition = 'opacity 0.65s ease';
        img.style.transition = 'opacity 0.7s ease, transform 0.9s cubic-bezier(0.3, 1.5, 0.4, 1)';
        word.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        this._timers.push(setTimeout(() => { img.style.opacity = '1'; img.style.transform = 'scale(1)'; }, 80));
        this._timers.push(setTimeout(() => { word.style.opacity = '1'; word.style.transform = 'translateY(0)'; }, 750));
        this._timers.push(setTimeout(() => { ov.style.opacity = '0'; }, 2400));
      };
      play();
      this._interval = setInterval(() => { this._timers.forEach(clearTimeout); this._timers = []; play(); }, 6200);
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf); clearInterval(this._interval);
      (this._timers || []).forEach(clearTimeout);
      if (this._ro) this._ro.disconnect();
    }
    _size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.clientWidth || 300, h = this.clientHeight || 600;
      this._cv.width = Math.round(w * dpr); this._cv.height = Math.round(h * dpr);
      this._w = w; this._h = h; this._dpr = dpr;
      if (!this._ps) this._ps = Array.from({ length: 16 }, (_, i) => ({
        x: Math.random(), y: Math.random(), r: 1.2 + Math.random() * 2.2,
        s: 0.008 + Math.random() * 0.012, ph: Math.random() * 6.28,
        c: this._colors[i % this._colors.length], tw: 0.6 + Math.random() * 1.2,
      }));
    }
    _draw(now) {
      if (!this._w) return;
      const t = (now - this._t0) / 1000;
      const ctx = this._cv.getContext('2d');
      ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      ctx.clearRect(0, 0, this._w, this._h);
      for (const p of this._ps) {
        const y = (((p.y - t * p.s) % 1) + 1) % 1;
        const x = p.x + Math.sin(t * 0.5 + p.ph) * 0.02;
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * p.tw + p.ph));
        ctx.fillStyle = p.c; ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(x * this._w, y * this._h, p.r, 0, 6.283); ctx.fill();
        ctx.globalAlpha = a * 0.25;
        ctx.beginPath(); ctx.arc(x * this._w, y * this._h, p.r * 2.6, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  customElements.define('cold-start', ColdStart);
})();
