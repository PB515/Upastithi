/**
 * install-prompt — pure platform-detection helpers for the /e/[token]
 * install banner. Kept separate from the component so they're plain,
 * testable functions rather than logic buried in a useEffect.
 */

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}
