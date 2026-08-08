'use client';

import { useEffect, useState } from 'react';
import { isStandalone, isIOS } from '@/lib/pwa/install-prompt';
import { Download, Share2, X } from '@/lib/icons';

const DISMISSED_KEY = 'upasthiti:install-banner-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallBanner() {
  const [standalone, setStandalone] = useState(true); // default hidden until checked, avoids a flash
  const [dismissed, setDismissed] = useState(true);
  const [ios, setIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setStandalone(isStandalone());
    setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
    setIos(isIOS());

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferredPrompt(null);
      setStandalone(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    setDeferredPrompt(null);
  }

  if (standalone || dismissed) return null;
  if (!ios && !deferredPrompt) return null;

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-[var(--radius)] border border-border p-3 text-sm">
      {ios ? (
        <div className="text-muted">
          <p className="mb-1 font-medium text-foreground">Add to your home screen</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li className="flex items-center gap-1">
              Tap <Share2 className="inline size-3.5" aria-hidden /> Share in Safari&apos;s toolbar
            </li>
            <li>Scroll down and tap &quot;Add to Home Screen&quot;</li>
            <li>Tap &quot;Add&quot;</li>
          </ol>
        </div>
      ) : (
        <button type="button" onClick={install} className="flex items-center gap-2">
          <Download className="size-4" aria-hidden />
          Install this page for quick access
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
