// <auth-bridge-logo theme="light|dark" state="success|fail" name="Mario"> — bridge auth → home.
// Fusión: logo con la animación del cold start (pop con overshoot) + barra de progreso de la variante E.
// Success: logo brota → "Hola, Mario" → barra completa → "Todo listo ✓" → fade al Inicio.
// Fail: barra se detiene al 65% en durazno + shake → Reintentar / Continuar sin sincronizar (sin fade). Loop demo ~6.8s.
(function () {
  if (customElements.get('auth-bridge-logo')) return;
  const THEMES = {
    light: { bg: '#E9EBE0', text: '#24382A', sub: '#6C7B67', particles: ['#7FB069', '#E8A87C', '#9BB894'], pedBg: '#E9EBE0', ped: '14px 14px 30px rgba(151,160,136,0.46), -14px -14px 30px rgba(255,255,255,0.95)', inset: 'inset 6px 6px 13px rgba(151,160,136,0.4), inset -6px -6px 13px rgba(255,255,255,0.95)', bar: '#2E7434', barFail: '#D97E4F', barTrack: 'rgba(151,160,136,0.35)', failCol: '#B05E2F', logo: 'logo-light.png', glow: 0, btn: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)', btnText: '#F5F2E1', btnShadow: '0 10px 20px rgba(46,116,52,0.35), inset 0 2px 3px rgba(255,255,255,0.3)' },
    dark: { bg: '#16271C', text: '#F1EEDD', sub: '#93A78F', particles: ['#A4E3A6', '#F2A87E', '#F1EEDD'], pedBg: 'linear-gradient(145deg, #1D3426, #132318)', ped: '14px 14px 30px rgba(0,0,0,0.6), -14px -14px 30px rgba(101,152,113,0.12)', inset: 'inset 6px 6px 13px rgba(0,0,0,0.5), inset -6px -6px 13px rgba(101,152,113,0.1)', bar: '#A4E3A6', barFail: '#F2A87E', barTrack: 'rgba(0,0,0,0.45)', failCol: '#F2A87E', logo: 'logo-dark.png', glow: 12, btn: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)', btnText: '#0F1E14', btnShadow: '0 0 20px rgba(140,225,150,0.3), inset 0 2px 3px rgba(255,255,255,0.35)' },
  };
  class AuthBridgeLogo extends HTMLElement {
    connectedCallback() {
      const T = this._T = THEMES[this.getAttribute('theme') || 'light'] || THEMES.light;
      this._state = this.getAttribute('state') || 'success';
      this._name = this.getAttribute('name') || 'Mario';
      this._colors = T.particles;
      this.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;display:block;pointer-events:none;z-index:5';
      this.innerHTML = '';
      const ov = document.createElement('div');
      ov.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:' + T.bg + ';display:flex;flex-direction:column;align-items:center;justify-content:center';
      const cv = document.createElement('canvas');
      cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';
      const ped = document.createElement('div');
      ped.style.cssText = 'position:relative;width:190px;height:190px;border-radius:50%;background:' + T.pedBg + ';box-shadow:' + T.ped + ';display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(0.85)';
      const bowl = document.createElement('div');
      bowl.style.cssText = 'width:154px;height:154px;border-radius:50%;box-shadow:' + T.inset + ';display:flex;align-items:center;justify-content:center';
      const img = document.createElement('img');
      img.src = T.logo;
      img.style.cssText = 'width:104px;height:83px;object-fit:contain;opacity:0;transform:scale(0.55)';
      if (T.glow) img.style.filter = 'drop-shadow(0 0 ' + T.glow + 'px rgba(164,227,166,0.35))';
      bowl.appendChild(img); ped.appendChild(bowl);
      const greet = document.createElement('div');
      greet.textContent = 'Hola, ' + this._name;
      greet.style.cssText = 'font-family:Nunito,sans-serif;font-size:27px;font-weight:900;color:' + T.text + ';margin-top:26px;opacity:0;transform:translateY(10px)';
      const track = document.createElement('div');
      track.style.cssText = 'width:150px;height:8px;border-radius:5px;background:' + T.barTrack + ';margin-top:18px;overflow:hidden;opacity:0';
      const fill = document.createElement('div');
      fill.style.cssText = 'width:0%;height:100%;border-radius:5px;background:' + T.bar + (T.glow ? ';box-shadow:0 0 10px rgba(164,227,166,0.5)' : '');
      track.appendChild(fill);
      const sub = document.createElement('div');
      sub.style.cssText = 'font-family:Nunito,sans-serif;font-size:13.5px;font-weight:700;color:' + T.sub + ';margin-top:10px;opacity:0;min-width:230px;text-align:center';
      const btn = document.createElement('div');
      btn.textContent = 'Reintentar';
      btn.style.cssText = 'font-family:Nunito,sans-serif;border-radius:20px;padding:13px 34px;font-size:14.5px;font-weight:900;color:' + T.btnText + ';background:' + T.btn + ';box-shadow:' + T.btnShadow + ';margin-top:22px;opacity:0;transform:translateY(8px)';
      const skip = document.createElement('div');
      skip.textContent = 'Continuar sin sincronizar';
      skip.style.cssText = 'font-family:Nunito,sans-serif;font-size:12.5px;font-weight:800;color:' + T.sub + ';text-decoration:underline;margin-top:14px;opacity:0';
      ov.appendChild(cv); ov.appendChild(ped); ov.appendChild(greet); ov.appendChild(track); ov.appendChild(sub); ov.appendChild(btn); ov.appendChild(skip);
      this.appendChild(ov);
      Object.assign(this, { _ov: ov, _cv: cv, _ped: ped, _img: img, _track: track, _fill: fill, _greet: greet, _sub: sub, _btn: btn, _skip: skip });
      this._t0 = performance.now();
      this._size();
      this._ro = new ResizeObserver(() => this._size());
      this._ro.observe(this);
      const raf = (now) => { this._particles(now); this._raf = requestAnimationFrame(raf); };
      this._raf = requestAnimationFrame(raf);
      this._timers = [];
      const play = () => this._play();
      play();
      this._interval = setInterval(() => { this._timers.forEach(clearTimeout); this._timers = []; play(); }, 6800);
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf); clearInterval(this._interval);
      (this._timers || []).forEach(clearTimeout);
      if (this._ro) this._ro.disconnect();
    }
    _play() {
      const { _ov: ov, _ped: ped, _img: img, _track: track, _fill: fill, _greet: greet, _sub: sub, _btn: btn, _skip: skip, _T: T } = this;
      const fail = this._state === 'fail';
      [ov, ped, img, track, fill, greet, sub, btn, skip].forEach((el) => { el.style.transition = 'none'; });
      ov.style.opacity = '1';
      ped.style.opacity = '0'; ped.style.transform = 'scale(0.85)';
      img.style.opacity = '0'; img.style.transform = 'scale(0.55)';
      track.style.opacity = '0'; fill.style.width = '0%'; fill.style.background = T.bar;
      greet.style.opacity = '0'; greet.style.transform = 'translateY(10px)';
      sub.style.opacity = '0'; sub.textContent = 'Cargando tu hogar…'; sub.style.color = T.sub;
      btn.style.opacity = '0'; btn.style.transform = 'translateY(8px)';
      skip.style.opacity = '0';
      void ov.offsetWidth;
      ov.style.transition = 'opacity 0.65s ease';
      ped.style.transition = 'opacity 0.45s ease, transform 0.6s ease';
      img.style.transition = 'opacity 0.7s ease 0.12s, transform 0.9s cubic-bezier(0.3, 1.5, 0.4, 1) 0.12s';
      track.style.transition = 'opacity 0.5s ease';
      fill.style.transition = fail ? 'width 1.15s ease-out 0.1s' : 'width 1.6s cubic-bezier(0.5, 0, 0.2, 1) 0.1s';
      greet.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      sub.style.transition = 'opacity 0.6s ease';
      btn.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      skip.style.transition = 'opacity 0.5s ease';
      this._timers.push(setTimeout(() => { ped.style.opacity = '1'; ped.style.transform = 'scale(1)'; img.style.opacity = '1'; img.style.transform = 'scale(1)'; }, 80));
      this._timers.push(setTimeout(() => { greet.style.opacity = '1'; greet.style.transform = 'translateY(0)'; track.style.opacity = '1'; sub.style.opacity = '1'; }, 750));
      this._timers.push(setTimeout(() => { fill.style.width = fail ? '65%' : '100%'; }, 950));
      if (fail) {
        this._timers.push(setTimeout(() => {
          fill.style.background = T.barFail;
          if (T.glow) fill.style.boxShadow = '0 0 10px rgba(242,168,126,0.5)';
          sub.textContent = 'No pudimos sincronizar · revisa tu conexión';
          sub.style.color = T.failCol;
          ped.style.transition = 'opacity 0.45s ease, transform 0.09s ease';
          [[-6, 0], [6, 90], [-4, 180], [0, 270]].forEach(([x, d]) => {
            this._timers.push(setTimeout(() => { ped.style.transform = 'scale(1) translateX(' + x + 'px)'; }, d));
          });
        }, 2200));
        this._timers.push(setTimeout(() => { btn.style.opacity = '1'; btn.style.transform = 'translateY(0)'; skip.style.opacity = '1'; }, 2550));
      } else {
        this._timers.push(setTimeout(() => { sub.textContent = 'Todo listo ✓'; }, 2600));
        this._timers.push(setTimeout(() => { ov.style.opacity = '0'; }, 3100));
      }
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
    _particles(now) {
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
  customElements.define('auth-bridge-logo', AuthBridgeLogo);
})();
