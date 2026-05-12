/* ─────────────────────────────────────────────────────────
   Manifiesto · site motion
   Aurora + fireflies + wordmark entrance. Emil-grade easings,
   spring-damped cursor parallax on the fern.
   Fallbacks: no-JS shows content; reduced-motion keeps opacity.
   ───────────────────────────────────────────────────────── */

document.documentElement.classList.remove('no-js')

const prefersReducedMotion =
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const $  = (sel, ctx = document) => ctx.querySelector(sel)
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel))

// ─── Firefly field ─────────────────────────────────────────
// Mirrors the app's auth-launch-splash.tsx pattern:
//   left = (i*13 + 8) % 90, top = (i*19 + 15) % 80
//   duration = 8 + (i%5)*1.8 s, delay = i*0.45 s
//   1/3 peach (warm), 2/3 soft-green (mint)
// We add per-particle motion amplitudes (mx, my) so the drift
// keyframe in CSS produces non-identical paths.
function spawnFireflies(host, count) {
  if (!host) return
  const frag = document.createDocumentFragment()
  for (let i = 0; i < count; i++) {
    const fly = document.createElement('i')
    fly.className = 'firefly' + (i % 7 === 0 ? ' firefly--bright' : '')
    const leftPct = (i * 13 + 8) % 90
    const topPct  = (i * 19 + 15) % 80
    const dur     = 8 + (i % 5) * 1.8
    const delay   = i * 0.45
    const color   = i % 3 === 0 ? '#F2B58A' : '#C7EE9C'
    // Motion amplitudes — tiny variance per fly so the field
    // looks asynchronous even with a shared keyframe.
    const mx = 32 + ((i * 7) % 28)   // 32–60 px
    const my = 40 + ((i * 11) % 36)  // 40–76 px
    fly.style.setProperty('--fx',     leftPct + '%')
    fly.style.setProperty('--fy',     topPct + '%')
    fly.style.setProperty('--fdur',   dur + 's')
    fly.style.setProperty('--fdelay', '-' + delay.toFixed(2) + 's')
    fly.style.setProperty('--fc',     color)
    fly.style.setProperty('--fmx',    mx + 'px')
    fly.style.setProperty('--fmy',    my + 'px')
    frag.appendChild(fly)
  }
  host.appendChild(frag)
}

// Mobile gets fewer particles — smaller GPU budget, smaller viewport,
// and the field reads "busy" if the same count fits in less space.
// The breakpoint matches our `min-width: 720px` layout shift.
const isCompactViewport =
  window.matchMedia &&
  (window.matchMedia('(max-width: 720px)').matches ||
    window.matchMedia('(pointer: coarse)').matches)

spawnFireflies($('#hero-fireflies'),   isCompactViewport ? 14 : 24)
spawnFireflies($('#policy-fireflies'), isCompactViewport ?  9 : 14)

// ─── Nav glass on scroll ────────────────────────────────────
const nav = $('.site-nav')
if (nav) {
  const isPolicyPage = document.body.classList.contains('is-policy')
  // On policy pages the dark hero is shorter, so switch to paper-glass
  // sooner; on the landing wait until the user has cleared the hero.
  const update = () => {
    const y = window.scrollY
    const threshold = isPolicyPage ? 220 : window.innerHeight * 0.62
    nav.classList.toggle('is-glass', y > 24)
    nav.classList.toggle('is-glass--paper', y > threshold)
  }
  update()
  window.addEventListener('scroll', update, { passive: true })
}

// ─── GSAP setup ─────────────────────────────────────────────
const hasGSAP = typeof gsap !== 'undefined'

if (hasGSAP) {
  gsap.registerPlugin(ScrollTrigger)

  // Pre-stage hero elements off-screen so the page never flashes
  // a "finished" state before the entrance plays.
  if (!prefersReducedMotion) {
    gsap.set('.hero__eyebrow', { opacity: 0, y: 12 })
    gsap.set('.hero__fern', { opacity: 0, scale: 0.92, transformOrigin: '50% 60%' })
    gsap.set('.fern-silhouette', { opacity: 0 })
    gsap.set('.fern-leaf', { opacity: 0, scale: 0.88, transformOrigin: '50% 50%' })
    gsap.set('.hero__wordmark .letter, .hero__wordmark .dot', { opacity: 0, y: 18, filter: 'blur(6px)' })
    gsap.set('.hero__tagline', { opacity: 0, y: 14 })
    gsap.set('.hero__cta-row > *', { opacity: 0, y: 12 })
    gsap.set('.hero__cue', { opacity: 0, y: 8 })
  }

  // 1. Hero entrance ────────────────────────────────────────
  if (!prefersReducedMotion) {
    const expoOut = 'expo.out'
    const tl = gsap.timeline({ defaults: { ease: expoOut } })

    tl
      .to('.hero__eyebrow', { opacity: 1, y: 0, duration: 0.7 }, 0.05)
      .to('.hero__fern', { opacity: 1, scale: 1, duration: 1.4, ease: 'power2.out' }, 0.0)
      .to('.fern-silhouette', { opacity: 1, duration: 0.9 }, 0.25)
      .to('.fern-leaf-1', { opacity: 1, scale: 1, duration: 1.0, ease: 'back.out(1.5)' }, 0.55)
      .to('.fern-leaf-2', { opacity: 1, scale: 1, duration: 1.0, ease: 'back.out(1.5)' }, 0.70)
      // Letter stagger — Emil-grade: short delay (≤80ms), filter blur
      // bridges the crossfade so letters don't "pop" individually.
      .to('.hero__wordmark .letter', {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.85,
        stagger: 0.05,
      }, 0.55)
      // The dot lands last with a tiny scale-in — it's the brand seal.
      .to('.hero__wordmark .dot', {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        scale: 1,
        duration: 0.7,
        ease: 'back.out(2.2)',
      }, '-=0.05')
      .to('.hero__tagline', { opacity: 1, y: 0, duration: 0.9 }, '-=0.45')
      .to('.hero__cta-row > *', { opacity: 1, y: 0, duration: 0.7, stagger: 0.06 }, '-=0.25')
      .to('.hero__cue', { opacity: 1, y: 0, duration: 0.6 }, '-=0.1')
  }

  // 2. Fern idle motion — slow, breath-like.
  if (!prefersReducedMotion && document.querySelector('.hero__fern svg')) {
    gsap.to('.hero__fern svg', {
      y: 6,
      duration: 4.2,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: 1.6, // start after the entrance has settled
    })
    gsap.to('.fern-leaf-1', {
      rotation: -1.8,
      duration: 5.8,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: 1.6,
    })
    gsap.to('.fern-leaf-2', {
      rotation: 1.6,
      duration: 6.6,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: 1.6,
    })
  }

  // 3. Cursor parallax on the fern (desktop, fine pointer only).
  //    Spring-damped via lerp so it feels alive, not snappy.
  //    Disabled on coarse-pointer (touch) — there's no cursor to track.
  const fineHover =
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !isCompactViewport
  const fern = document.querySelector('.hero__fern')
  if (fern && fineHover && !prefersReducedMotion) {
    let targetX = 0, targetY = 0
    let currX = 0, currY = 0
    const onMove = (e) => {
      const rect = fern.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      targetX = (e.clientX - cx) * 0.020   // max ~12px at the viewport edge
      targetY = (e.clientY - cy) * 0.020
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    // Lerp with 0.08 — feels like a soft spring without a physics lib
    gsap.ticker.add(() => {
      currX += (targetX - currX) * 0.08
      currY += (targetY - currY) * 0.08
      fern.style.transform = `translate3d(${currX.toFixed(2)}px, ${currY.toFixed(2)}px, 0)`
    })
  }

  // 4. Reveal-on-scroll
  const reveals = $$('.reveal')
  if (reveals.length && !prefersReducedMotion) {
    gsap.set(reveals, { opacity: 0, y: 22 })
    ScrollTrigger.batch(reveals, {
      start: 'top 85%',
      onEnter: (batch) =>
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.95,
          stagger: 0.06,
          ease: 'expo.out',
          overwrite: 'auto',
        }),
      onLeaveBack: (batch) =>
        gsap.to(batch, {
          opacity: 0,
          y: 22,
          duration: 0.35,
          ease: 'power2.in',
          overwrite: 'auto',
        }),
    })
  }

  // 5. Policy ToC active section tracking
  const tocLinks = $$('.policy-toc a[href^="#"]')
  if (tocLinks.length) {
    tocLinks.forEach((link) => {
      const id = link.getAttribute('href').slice(1)
      const target = document.getElementById(id)
      if (!target) return
      ScrollTrigger.create({
        trigger: target,
        start: 'top 30%',
        end: 'bottom 30%',
        onToggle: (self) => {
          if (self.isActive) {
            tocLinks.forEach((l) => l.classList.remove('is-active'))
            link.classList.add('is-active')
          }
        },
      })
    })
  }

  // 6. Refresh once fonts have settled (Fraunces variable axes
  //    change measured metrics — without refresh, the last-section
  //    triggers fire ~30px off).
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh())
  }
}
