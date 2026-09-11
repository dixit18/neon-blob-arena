// DOM UI animation via GSAP — lazy-loaded so first paint stays tiny.
// LAW: this module never touches the canvas loop. rAF hot path stays hand-rolled.
import type { gsap as GsapType } from 'gsap';

let cached: Promise<typeof GsapType> | null = null;
function loadGsap(): Promise<typeof GsapType> {
  if (!cached) cached = import('gsap').then((m) => m.gsap);
  return cached;
}

// Menu entrance: staggered elastic pop. Elements are visible by default,
// so a failed/slow load degrades to "no animation", never a blank menu.
export async function uiMenuIn(): Promise<void> {
  try {
    const gsap = await loadGsap();
    gsap.from('#menu .card > *', {
      y: 26, opacity: 0, scale: 0.96, duration: 0.55,
      ease: 'back.out(1.6)', stagger: 0.07, overwrite: 'auto', clearProps: 'all',
    });
  } catch { /* offline: menu just appears */ }
}

let crownTl: { kill: () => void } | null = null;
export async function uiCrownPop(): Promise<void> {
  const banner = document.getElementById('banner');
  if (!banner) return;
  banner.style.display = 'block';
  banner.style.opacity = '';
  try {
    const gsap = await loadGsap();
    crownTl?.kill();
    const inner = '#banner .inner';
    gsap.set(banner, { opacity: 1 });
    const tl = gsap.timeline();
    crownTl = tl;
    tl.fromTo(inner,
      { scale: 0.4, rotation: -6, opacity: 0 },
      { scale: 1, rotation: 0, opacity: 1, duration: 0.5, ease: 'elastic.out(1,.45)' })
      .to(inner, { rotation: 2, duration: 0.12, yoyo: true, repeat: 3 }, '>-0.1')
      .to(banner, {
        opacity: 0, duration: 0.35, delay: 3.2,
        onComplete: () => { banner.style.display = 'none'; banner.style.opacity = ''; },
      });
  } catch {
    setTimeout(() => { banner.style.display = 'none'; }, 4500);
  }
}

export async function uiDeathIn(): Promise<void> {
  try {
    const gsap = await loadGsap();
    gsap.from('#dead .card', { scale: 0.7, y: 20, opacity: 0, duration: 0.45, ease: 'back.out(1.8)', overwrite: 'auto', clearProps: 'all' });
  } catch { /* visible by default */ }
}

// Squishy press feedback for key buttons (transform-only, no layout).
export function uiPressify(selector: string): void {
  const btn = document.querySelector(selector);
  if (!btn) return;
  const down = async () => {
    try {
      const gsap = await loadGsap();
      gsap.to(btn, { scale: 0.9, duration: 0.08, overwrite: 'auto' });
    } catch { /* no-op */ }
  };
  const up = async () => {
    try {
      const gsap = await loadGsap();
      gsap.to(btn, { scale: 1, duration: 0.3, ease: 'elastic.out(1,.5)', overwrite: 'auto' });
    } catch { /* no-op */ }
  };
  btn.addEventListener('pointerdown', () => void down());
  btn.addEventListener('pointerup', () => void up());
  btn.addEventListener('pointerleave', () => void up());
}
