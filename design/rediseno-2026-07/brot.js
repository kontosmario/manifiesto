// Brot — mascota de Manifiesto, dibujada en canvas.
// <brot-mascot pose="…" size="120" animated="true|false" shadow="true|false">
// Poses/emotes: idle, wave, cheer, coach, sleep, peek, laugh, love, wow, worried,
// sad, dizzy, shy, think, zen, magic, seed, wilted
(function () {
  if (customElements.get('brot-mascot')) return;

  const C = {
    body: '#A9CB80', body2: '#9CC172', outline: '#4E7A44',
    dull: '#B7C4A0', dull2: '#ACBA92', dullOut: '#7A8669',
    leafL: '#8FBE72', leafR: '#6FA35C', stem: '#5E8F4C',
    leafDullL: '#A8B694', leafDullR: '#93A383', stemDull: '#7A8A6C',
    face: '#3D5B36', blush: 'rgba(224,138,110,0.38)',
    shadow: 'rgba(60,90,50,0.16)', heart: '#E0705F',
    seed: '#DCC58F', seedOut: '#8A7648',
  };

  const POSES = {
    idle:    {},
    wave:    { aR: (t) => 2.45 + Math.sin(t * 4.2) * 0.22, tilt: -0.02 },
    cheer:   { aL: (t) => 2.5 + Math.sin(t * 3.1 + 0.4) * 0.12, aR: (t) => 2.5 + Math.sin(t * 3.1) * 0.12, mouth: 'open', bounce: 1, blush: 1, leaves: 'perk' },
    coach:   { aL: (t) => 2.15 + Math.sin(t * 2.2) * 0.06, tilt: -0.035 },
    sleep:   { eyes: 'closed', mouth: 'oo', tilt: 0.09, extras: ['zzz'] },
    peek:    { eyes: 'scan', custom: 'peek' },
    laugh:   { eyes: 'happy', mouth: 'open', blush: 1, bounce: 0.5 },
    love:    { eyes: 'heart', blush: 1, extras: ['hearts'], aL: 0.35, aR: 0.35 },
    wow:     { eyes: 'wide', mouth: 'o', leaves: 'perk', extras: ['bang'], aL: 0.6, aR: 0.6 },
    worried: { eyes: 'worry', mouth: 'wavy', extras: ['sweat'], tilt: 0.02 },
    sad:     { eyes: 'sad', mouth: 'frown', leaves: 'droop', tilt: 0.035 },
    dizzy:   { eyes: 'x', mouth: 'wavy', leaves: 'droop', wobble: 1 },
    shy:     { mouth: 'small', blush: 2, eyes: 'shy', legs: 'pigeon', custom: 'shy', sway: 1, noArms: 1 },
    think:   { eyes: 'think', mouth: 'hmm2', extras: ['thought'], custom: 'think', noArms: 1, tilt: -0.045 },
    zen:     { eyes: 'closed', mouth: 'small', float: 1, legs: 'cross', custom: 'zen', noArms: 1, halo: 1, deep: 1 },
    magic:   { aR: (t) => 2.3 + Math.sin(t * 2.6) * 0.1, extras: ['sparkles'] },
    seed:    { seed: 1 },
    wilted:  { eyes: 'sad', mouth: 'frown', leaves: 'wilt', tilt: 0.055, dull: 1 },
  };

  class BrotMascot extends HTMLElement {
    static get observedAttributes() { return ['pose', 'size', 'animated', 'shadow']; }

    constructor() {
      super();
      this._t0 = performance.now();
      this._phase = Math.random() * 10;
      this._raf = 0;
    }

    connectedCallback() {
      this.style.display = 'inline-block';
      this.style.lineHeight = '0';
      if (!this._canvas) {
        this._canvas = document.createElement('canvas');
        this.appendChild(this._canvas);
      }
      this._resize();
      const loop = (now) => { this._draw(now); this._raf = requestAnimationFrame(loop); };
      cancelAnimationFrame(this._raf);
      if (this._animated()) this._raf = requestAnimationFrame(loop);
      else this._draw(performance.now());
    }

    disconnectedCallback() { cancelAnimationFrame(this._raf); }

    attributeChangedCallback() {
      if (!this._canvas) return;
      this._resize();
      if (!this._animated()) this._draw(performance.now());
    }

    _animated() { return this.getAttribute('animated') !== 'false'; }
    _pose() { return this.getAttribute('pose') || 'idle'; }
    _shadowOn() { return this.getAttribute('shadow') !== 'false'; }
    _dims() { return { W: 84, H: this._pose() === 'peek' ? 72 : 108 }; }

    _resize() {
      const size = parseFloat(this.getAttribute('size')) || 120;
      const { W, H } = this._dims();
      const cssH = size, cssW = size * (W / H);
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 3), 4);
      this._canvas.width = Math.round(cssW * dpr);
      this._canvas.height = Math.round(cssH * dpr);
      this._canvas.style.width = cssW + 'px';
      this._canvas.style.height = cssH + 'px';
      this._scale = (cssH / H) * dpr;
    }

    _capsule(ctx, x1, y1, x2, y2, w, fill, out) {
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.lineWidth = w + 4.4; ctx.strokeStyle = out; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.lineWidth = w; ctx.strokeStyle = fill; ctx.stroke();
    }

    _leaf(ctx, bx, by, tx, ty, fill, out) {
      const mx = (bx + tx) / 2, my = (by + ty) / 2;
      const dx = tx - bx, dy = ty - by;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const k = len * 0.30;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(mx + nx * k, my + ny * k, tx, ty);
      ctx.quadraticCurveTo(mx - nx * k, my - ny * k, bx, by);
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.strokeStyle = out; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(mx + nx * k * 0.25, my + ny * k * 0.25, bx + dx * 0.72, by + dy * 0.72);
      ctx.lineWidth = 1.4; ctx.strokeStyle = out; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
    }

    _heart(ctx, x, y, s, color) {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(-s * 0.35, -s * 0.22, s * 0.42, 0, Math.PI * 2);
      ctx.arc(s * 0.35, -s * 0.22, s * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.72, -s * 0.05);
      ctx.lineTo(0, s * 0.62);
      ctx.lineTo(s * 0.72, -s * 0.05);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    _star(ctx, x, y, s, color) {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.22, -s * 0.22, s, 0);
      ctx.quadraticCurveTo(s * 0.22, s * 0.22, 0, s);
      ctx.quadraticCurveTo(-s * 0.22, s * 0.22, -s, 0);
      ctx.quadraticCurveTo(-s * 0.22, -s * 0.22, 0, -s);
      ctx.fill(); ctx.restore();
    }

    _leaves(ctx, state, t, dull) {
      const sway = Math.sin(t * 1.15) * (state === 'perk' ? 0.08 : state === 'droop' ? 0.025 : state === 'wilt' ? 0.015 : 0.05);
      const lL = dull || state === 'wilt' ? C.leafDullL : C.leafL;
      const lR = dull || state === 'wilt' ? C.leafDullR : C.leafR;
      const st = dull || state === 'wilt' ? C.stemDull : C.stem;
      const out = dull || state === 'wilt' ? C.dullOut : C.outline;
      let tipL = [22, 5], tipR = [63, 3];
      if (state === 'perk') { tipL = [20, 0]; tipR = [65, -2]; }
      if (state === 'droop') { tipL = [21, 15]; tipR = [64, 13]; }
      if (state === 'wilt') { tipL = [25, 19]; tipR = [61, 18]; }
      ctx.save();
      ctx.translate(42, 28); ctx.rotate(sway); ctx.translate(-42, -28);
      ctx.beginPath(); ctx.moveTo(42, 29); ctx.quadraticCurveTo(41, 20, 42, 15);
      ctx.lineWidth = 2.4; ctx.strokeStyle = st; ctx.lineCap = 'round'; ctx.stroke();
      this._leaf(ctx, 42, 16, tipL[0], tipL[1], lL, out);
      this._leaf(ctx, 42, 15, tipR[0], tipR[1], lR, out);
      ctx.restore();
    }

    _drawSeed(ctx, t) {
      const blink = ((t % 3.7) < 0.12) ? 0.15 : 1;
      if (this._shadowOn()) {
        ctx.beginPath(); ctx.ellipse(42, 100, 15, 2.8, 0, 0, Math.PI * 2);
        ctx.fillStyle = C.shadow; ctx.fill();
      }
      ctx.save();
      ctx.translate(42, 84); ctx.rotate(Math.sin(t * 1.2) * 0.04);
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 15, 0, 0, Math.PI * 2);
      ctx.fillStyle = C.seed; ctx.fill();
      ctx.lineWidth = 2.4; ctx.strokeStyle = C.seedOut; ctx.stroke();
      ctx.save(); ctx.translate(-4, -8); ctx.rotate(-0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 1.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill(); ctx.restore();
      ctx.fillStyle = C.face;
      [-4.2, 4.2].forEach((ex) => {
        ctx.save(); ctx.translate(ex, -2); ctx.scale(1, blink);
        ctx.beginPath(); ctx.ellipse(0, 0, 1.9, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
      ctx.beginPath(); ctx.moveTo(-2.8, 3); ctx.quadraticCurveTo(0, 5.6, 2.8, 3);
      ctx.lineWidth = 1.9; ctx.strokeStyle = C.face; ctx.lineCap = 'round'; ctx.stroke();
      // brotecito arriba
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(-0.5, -18, 0, -21);
      ctx.lineWidth = 2; ctx.strokeStyle = C.stem; ctx.stroke();
      this._leaf(ctx, 0, -20, -8, -25, C.leafL, C.outline);
      this._leaf(ctx, 0, -20.5, 7, -26, C.leafR, C.outline);
      ctx.restore();
    }

    _eyes(ctx, type, t) {
      const blink = ((t % 3.7) < 0.12) ? 0.15 : 1;
      const y = 56, L = 33.5, R = 50.5;
      ctx.fillStyle = C.face; ctx.strokeStyle = C.face; ctx.lineCap = 'round';
      if (type === 'closed') {
        ctx.lineWidth = 2.2;
        [L, R].forEach((ex) => {
          ctx.beginPath(); ctx.moveTo(ex - 3, y); ctx.quadraticCurveTo(ex, y + 2.6, ex + 3, y); ctx.stroke();
        });
      } else if (type === 'happy') {
        ctx.lineWidth = 2.2;
        [L, R].forEach((ex) => {
          ctx.beginPath(); ctx.moveTo(ex - 3, y + 0.5); ctx.quadraticCurveTo(ex, y - 3, ex + 3, y + 0.5); ctx.stroke();
        });
      } else if (type === 'heart') {
        const pulse = 1 + 0.12 * Math.sin(t * 5);
        [L, R].forEach((ex) => this._heart(ctx, ex, y, 4.4 * pulse, C.heart));
      } else if (type === 'x') {
        ctx.lineWidth = 2.2;
        [L, R].forEach((ex) => {
          ctx.beginPath(); ctx.moveTo(ex - 2.4, y - 2.4); ctx.lineTo(ex + 2.4, y + 2.4);
          ctx.moveTo(ex + 2.4, y - 2.4); ctx.lineTo(ex - 2.4, y + 2.4); ctx.stroke();
        });
      } else if (type === 'wide') {
        [L, R].forEach((ex) => {
          ctx.beginPath(); ctx.ellipse(ex, y, 3.5, 4.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#F4F8EC';
          ctx.beginPath(); ctx.ellipse(ex + 1, y - 1.4, 1.1, 1.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = C.face;
        });
      } else if (type === 'scan') {
        const px = Math.sin(t * 0.9) * 2.2;
        [L, R].forEach((ex) => {
          ctx.save(); ctx.translate(ex + px, y); ctx.scale(1, blink);
          ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
      } else if (type === 'shy') {
        const glance = Math.pow(Math.max(0, Math.sin(t * 0.5)), 8);
        const px = -1.4 + glance * 1.2, py = 1.6 - glance * 3.2;
        [L, R].forEach((ex) => {
          ctx.save(); ctx.translate(ex + px, y + py); ctx.scale(1, blink * 0.85);
          ctx.beginPath(); ctx.ellipse(0, 0, 2.3, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
      } else if (type === 'think') {
        const px = Math.tanh(Math.sin(t * 0.55) * 3) * 2;
        [L, R].forEach((ex) => {
          ctx.save(); ctx.translate(ex + px, y - 3); ctx.scale(1, blink);
          ctx.beginPath(); ctx.ellipse(0, 0, 2.3, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(R - 3.5, y - 8); ctx.lineTo(R + 3, y - 7); ctx.stroke();
      } else if (type === 'up') {
        [L + 1, R + 1].forEach((ex) => {
          ctx.save(); ctx.translate(ex, y - 3); ctx.scale(1, blink);
          ctx.beginPath(); ctx.ellipse(0, 0, 2.3, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
      } else {
        // dot (default) + variantes con cejas
        [L, R].forEach((ex) => {
          ctx.save(); ctx.translate(ex, y); ctx.scale(1, blink * (type === 'sad' ? 0.75 : 1));
          ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        if (type === 'worry') {
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(L - 3.5, y - 6.5); ctx.lineTo(L + 2.5, y - 5);
          ctx.moveTo(R + 3.5, y - 6.5); ctx.lineTo(R - 2.5, y - 5); ctx.stroke();
        }
        if (type === 'sad') {
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(L + 3.5, y - 6.5); ctx.lineTo(L - 2.5, y - 5);
          ctx.moveTo(R - 3.5, y - 6.5); ctx.lineTo(R + 2.5, y - 5); ctx.stroke();
        }
      }
    }

    _mouth(ctx, type, t, br) {
      ctx.strokeStyle = C.face; ctx.fillStyle = C.face; ctx.lineCap = 'round';
      if (type === 'open') {
        ctx.beginPath(); ctx.arc(42, 63.5, 4.4, 0, Math.PI); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#D98A76';
        ctx.beginPath(); ctx.ellipse(42, 66.2, 2.3, 1.3, 0, 0, Math.PI); ctx.fill();
      } else if (type === 'o') {
        ctx.beginPath(); ctx.ellipse(42, 64.5, 2.4, 3.1, 0, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'wavy') {
        ctx.lineWidth = 2.1;
        ctx.beginPath(); ctx.moveTo(37, 64);
        ctx.quadraticCurveTo(39.5, 62, 42, 64);
        ctx.quadraticCurveTo(44.5, 66, 47, 64); ctx.stroke();
      } else if (type === 'frown') {
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(37.5, 65.3); ctx.quadraticCurveTo(42, 61.6, 46.5, 65.3); ctx.stroke();
      } else if (type === 'small') {
        ctx.lineWidth = 2.1;
        ctx.beginPath(); ctx.moveTo(39.6, 63.4); ctx.quadraticCurveTo(42, 65.4, 44.4, 63.4); ctx.stroke();
      } else if (type === 'hmm') {
        ctx.lineWidth = 2.1;
        ctx.beginPath(); ctx.moveTo(38.6, 64); ctx.lineTo(45, 63.2); ctx.stroke();
      } else if (type === 'hmm2') {
        ctx.lineWidth = 2.1;
        ctx.beginPath(); ctx.moveTo(36.5, 64.3); ctx.quadraticCurveTo(39.5, 63.1, 42.5, 63.6); ctx.stroke();
      } else if (type === 'oo') {
        ctx.save(); ctx.translate(42, 64.5); ctx.scale(1 + br * 0.12, 1 + br * 0.12);
        ctx.beginPath(); ctx.ellipse(0, 0, 1.7, 2.1, 0, 0, Math.PI * 2);
        ctx.lineWidth = 1.8; ctx.stroke(); ctx.restore();
      } else {
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(37, 63); ctx.quadraticCurveTo(42, 67.5, 47, 63); ctx.stroke();
      }
    }

    _extras(ctx, list, t) {
      if (!list) return;
      for (const ex of list) {
        if (ex === 'zzz') {
          const fl = (Math.sin(t * 1.4) + 1) / 2;
          ctx.fillStyle = C.face; ctx.globalAlpha = 0.5 + fl * 0.4;
          ctx.font = '700 8px Nunito, sans-serif';
          ctx.fillText('z', 68, 30 - fl * 4);
          ctx.font = '700 5.5px Nunito, sans-serif';
          ctx.fillText('z', 74, 22 - fl * 6);
          ctx.globalAlpha = 1;
        } else if (ex === 'hearts') {
          for (let i = 0; i < 3; i++) {
            const yy = (t * 0.45 + i * 0.33) % 1;
            ctx.globalAlpha = (1 - yy) * 0.95;
            this._heart(ctx, 60 + i * 6 - yy * 5, 32 - yy * 20, 3 + i * 0.7, C.heart);
          }
          ctx.globalAlpha = 1;
        } else if (ex === 'bang') {
          const pop = 1 + 0.12 * Math.sin(t * 5);
          ctx.save(); ctx.translate(68, 16); ctx.scale(pop, pop); ctx.translate(-68, -16);
          ctx.strokeStyle = '#D97E4F'; ctx.lineCap = 'round'; ctx.lineWidth = 3.6;
          ctx.beginPath(); ctx.moveTo(68, 6); ctx.lineTo(68, 17); ctx.stroke();
          ctx.fillStyle = '#D97E4F';
          ctx.beginPath(); ctx.arc(68, 23.5, 2, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if (ex === 'sweat') {
          const sy = 36 + ((t * 0.55) % 1) * 6;
          ctx.save(); ctx.translate(64, sy); ctx.globalAlpha = 0.92;
          ctx.beginPath(); ctx.moveTo(0, -4);
          ctx.quadraticCurveTo(3.4, 1.6, 0, 3.9);
          ctx.quadraticCurveTo(-3.4, 1.6, 0, -4); ctx.closePath();
          ctx.fillStyle = '#A8CFEA'; ctx.fill();
          ctx.lineWidth = 1.6; ctx.strokeStyle = '#7FAECF'; ctx.stroke();
          ctx.restore(); ctx.globalAlpha = 1;
        } else if (ex === 'dots') {
          for (let i = 0; i < 3; i++) {
            const a = (Math.sin(t * 2.4 - i * 0.9) + 1) / 2;
            ctx.globalAlpha = 0.25 + a * 0.75;
            ctx.fillStyle = C.face;
            ctx.beginPath(); ctx.arc(61 + i * 6.5, 26 - i * 4.5, 1.6 + i * 0.3, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else if (ex === 'thought') {
          ctx.fillStyle = C.face;
          [[57.5, 33, 1.4], [62.5, 26, 2.1]].forEach((d) => {
            ctx.beginPath(); ctx.arc(d[0], d[1], d[2], 0, Math.PI * 2); ctx.fill();
          });
          const bob = Math.sin(t * 1.8) * 1.2;
          ctx.save(); ctx.translate(70, 14 + bob);
          ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(252,252,246,0.95)'; ctx.fill();
          ctx.lineWidth = 1.8; ctx.strokeStyle = C.outline; ctx.stroke();
          const ch = Math.floor(t * 0.35) % 2 ? '$' : '?';
          ctx.fillStyle = C.face; ctx.font = '800 9.5px Nunito, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(ch, 0, 0.5);
          ctx.restore();
        } else if (ex === 'sparkles') {
          const pts = [[20, 18], [66, 8], [72, 34]];
          pts.forEach((p, i) => {
            const tw = (Math.sin(t * 3 + i * 2.1) + 1) / 2;
            this._star(ctx, p[0], p[1], 1.8 + tw * 2.6, i % 2 ? '#E8C46E' : '#7FB069');
          });
        }
      }
    }

    _draw(now) {
      const ctx = this._canvas.getContext('2d');
      const t = (now - this._t0) / 1000 + this._phase;
      const pose = this._pose();
      const P = POSES[pose] || {};
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      ctx.setTransform(this._scale, 0, 0, this._scale, 0, 0);

      if (P.seed) { this._drawSeed(ctx, t); return; }

      const cx = 42;
      const isPeek = pose === 'peek';
      const br = Math.sin(t * 1.9);
      const bounce = P.bounce ? -3.2 * P.bounce * Math.abs(Math.sin(t * 3.1)) : 0;
      const floatY = P.float ? Math.sin(t * 1.6) * 3 - 4 : 0;
      const tilt = (P.tilt || 0) + (P.wobble ? Math.sin(t * 2.8) * 0.06 : 0) + (P.sway ? 0.02 + Math.sin(t * 1.3) * 0.03 : 0);
      const bodyFill = P.dull ? C.dull : C.body;
      const bodyFill2 = P.dull ? C.dull2 : C.body2;
      const out = P.dull ? C.dullOut : C.outline;

      if (!isPeek && this._shadowOn()) {
        const rx = 19 - bounce * 0.8 + floatY * 1.0;
        ctx.beginPath();
        ctx.ellipse(cx, 103, Math.max(rx, 10), 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = C.shadow; ctx.fill();
      }

      ctx.save();
      if (isPeek) {
        const duck = Math.pow(Math.max(0, Math.sin(t * 0.55)), 10) * 11 + Math.sin(t * 2.1) * 0.8;
        ctx.translate(0, duck);
        ctx.translate(cx, 72); ctx.rotate(-0.04 + Math.sin(t * 0.5) * 0.035); ctx.translate(-cx, -72);
      }
      ctx.translate(0, bounce + floatY);
      ctx.translate(cx, 96); ctx.rotate(tilt); ctx.translate(-cx, -96);
      const brA = P.deep ? Math.sin(t * 1.05) * 2.1 : br;
      ctx.translate(cx, 96); ctx.scale(1 - 0.008 * brA, 1 + 0.016 * brA); ctx.translate(-cx, -96);

      // halo zen
      if (P.halo) {
        const pr = 33 + Math.sin(t * 1.05) * 2;
        ctx.beginPath(); ctx.arc(cx, 58, pr + 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(159,220,159,0.08)'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, 58, pr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(159,220,159,0.13)'; ctx.fill();
      }

      // patas
      if (!isPeek && P.legs !== 'cross') {
        if (P.legs === 'pigeon') {
          const tw = Math.sin(t * 2.6) * 1.2;
          this._capsule(ctx, 32, 92, 34.5 + tw, 97.5, 8.5, bodyFill, out);
          this._capsule(ctx, 52, 92, 49.5, 97.5, 8.5, bodyFill, out);
        } else {
          this._capsule(ctx, 32, 92, 32, 97.5, 8.5, bodyFill, out);
          this._capsule(ctx, 52, 92, 52, 97.5, 8.5, bodyFill, out);
        }
      }

      // brazos traseros
      const armL = 15, armW = 8.5;
      const resolveA = (v, dflt) => typeof v === 'function' ? v(t) : (v != null ? v : dflt);
      const hang = 0.1 + Math.sin(t * 1.9) * 0.05;
      const drawArm = (sx, sy, a, dir) => {
        const exx = sx + dir * Math.sin(a) * armL;
        const eyy = sy + Math.cos(a) * armL;
        this._capsule(ctx, sx, sy, exx, eyy, armW, bodyFill, out);
      };
      if (!isPeek && !P.armsFront && !P.noArms) {
        drawArm(19, 62, resolveA(P.aL, hang), -1);
        if (!P.chin) drawArm(65, 62, resolveA(P.aR, hang), 1);
      }

      // cuerpo (huevo)
      const grad = ctx.createLinearGradient(0, 26, 0, 98);
      grad.addColorStop(0, bodyFill);
      grad.addColorStop(1, bodyFill2);
      ctx.beginPath();
      ctx.moveTo(cx, 27);
      ctx.bezierCurveTo(cx + 20, 27, cx + 27, 48, cx + 27, 66);
      ctx.bezierCurveTo(cx + 27, 84, cx + 16, 97, cx, 97);
      ctx.bezierCurveTo(cx - 16, 97, cx - 27, 84, cx - 27, 66);
      ctx.bezierCurveTo(cx - 27, 48, cx - 20, 27, cx, 27);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      ctx.lineWidth = 2.4; ctx.strokeStyle = out; ctx.stroke();

      // brillo
      ctx.save();
      ctx.translate(30, 37); ctx.rotate(-0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(9, 4, 2, 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
      ctx.restore();

      // rubor
      if (P.blush) {
        ctx.fillStyle = C.blush;
        ctx.globalAlpha = P.blush === 2 ? 1 : 0.8;
        ctx.beginPath(); ctx.ellipse(28.5, 62.5, 3.8, 2.1, 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(55.5, 62.5, 3.8, 2.1, -0.1, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // cara
      this._eyes(ctx, P.eyes || 'dot', t);
      this._mouth(ctx, P.mouth || 'smile', t, br);

      // hojas
      this._leaves(ctx, P.leaves || 'normal', t, P.dull);

      // detalles por pose (frente)
      if (P.custom === 'shy') {
        const press = Math.sin(t * 2.6) * 0.9;
        this._capsule(ctx, 19, 63, 38.2 + press, 81, armW, bodyFill, out);
        this._capsule(ctx, 65, 63, 45.8 - press, 81, armW, bodyFill, out);
      }
      if (P.custom === 'think') {
        this._capsule(ctx, 19, 63, 44, 76, armW, bodyFill, out);
        this._capsule(ctx, 65, 63, 51, 71.5, armW, bodyFill, out);
        ctx.save();
        ctx.translate(49.5, 69.5); ctx.rotate(-0.35);
        ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 3.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = bodyFill; ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = out; ctx.stroke();
        ctx.restore();
      }
      if (P.custom === 'zen') {
        this._capsule(ctx, 31, 90.5, 47, 95, 8, bodyFill, out);
        this._capsule(ctx, 53, 90.5, 37, 95, 8, bodyFill, out);
        this._capsule(ctx, 19, 63, 25, 81, armW, bodyFill, out);
        this._capsule(ctx, 65, 63, 59, 81, armW, bodyFill, out);
        [[25.5, 82.5], [58.5, 82.5]].forEach((h) => {
          ctx.beginPath(); ctx.ellipse(h[0], h[1], 4.4, 3.2, 0, 0, Math.PI * 2);
          ctx.fillStyle = bodyFill; ctx.fill();
          ctx.lineWidth = 2.2; ctx.strokeStyle = out; ctx.stroke();
        });
        const oa = t * 0.7;
        const ox = cx + Math.cos(oa) * 31, oy = 56 + Math.sin(oa) * 13;
        ctx.globalAlpha = 0.35 + 0.4 * (0.5 - Math.sin(oa) / 2);
        this._leaf(ctx, ox, oy, ox + Math.sin(oa) * 7, oy - 5, C.leafL, C.outline);
        ctx.globalAlpha = 1;
      }

      // manitos con deditos agarrados al borde (peek)
      if (isPeek) {
        [26, 58].forEach((hx, i) => {
          ctx.save();
          ctx.translate(hx, 68.8 + Math.sin(t * 2 + i) * 0.35);
          ctx.beginPath(); ctx.ellipse(0, 1.2, 5.6, 3.4, 0, 0, Math.PI * 2);
          ctx.fillStyle = bodyFill; ctx.fill();
          ctx.lineWidth = 2.2; ctx.strokeStyle = out; ctx.stroke();
          for (let f = -1; f <= 1; f++) {
            ctx.beginPath(); ctx.arc(f * 3.1, -2.2, 1.75, 0, Math.PI * 2);
            ctx.fillStyle = bodyFill; ctx.fill();
            ctx.lineWidth = 1.9; ctx.strokeStyle = out; ctx.stroke();
          }
          ctx.restore();
        });
      }

      // accesorios
      this._extras(ctx, P.extras, t);

      ctx.restore();
    }
  }

  ['pose', 'size', 'animated', 'shadow'].forEach((k) => {
    Object.defineProperty(BrotMascot.prototype, k, {
      get() { return this.getAttribute(k); },
      set(v) { if (v == null || v === false) this.removeAttribute(k); else this.setAttribute(k, String(v)); },
    });
  });

  customElements.define('brot-mascot', BrotMascot);
})();
