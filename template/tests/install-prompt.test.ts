import { describe, it, expect } from 'vitest';
import { isStandalone, isIOS } from '../lib/pwa/install-prompt';

// vitest.config.ts runs this suite in a plain Node environment (no DOM) — the
// same environment these helpers see during SSR, since install-banner.tsx
// only calls them client-side inside useEffect, after mount. This proves the
// SSR guard holds: neither helper should throw or misbehave when window/
// navigator aren't defined, even if that guard is accidentally weakened later.
describe('install-prompt helpers (SSR/no-DOM environment)', () => {
  it('isStandalone returns false without window', () => {
    expect(isStandalone()).toBe(false);
  });

  it('isIOS returns false without navigator', () => {
    expect(isIOS()).toBe(false);
  });
});
