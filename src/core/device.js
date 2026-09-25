/** Coarse pointer or a reported touch screen. Safe in the headless test environment. */
export function isTouchDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return !!coarse || (navigator.maxTouchPoints ?? 0) > 0;
}

export function markTouchDevice() {
  if (typeof document === 'undefined') return false;
  const touch = isTouchDevice();
  document.body.classList.toggle('touch', touch);
  return touch;
}

export function isPortrait() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(orientation: portrait)').matches;
}
