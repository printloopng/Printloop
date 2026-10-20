"use client";

import { useState, useSyncExternalStore } from "react";

const KEY = "pl_cookie_notice";

function readDismissed(): boolean {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function CookieConsent({ privacyHref = "/privacy" }: { privacyHref?: string }) {
  const stored = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      setDismissed(true);
      return;
    }
    setDismissed(true);
  };

  if (stored || dismissed) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-md z-50 animate-slide-up"
      role="region"
      aria-label="Cookie notice"
    >
      <div className="bg-paper border-2 border-ink rounded-pl p-4 sm:p-5 shadow-brutal">
        <h3 className="font-bold text-sm sm:text-base">We only use essential cookies</h3>
        <p className="text-ink/70 text-sm mt-1">
          PrintLoop sets a secure, HttpOnly sign-in cookie and remembers which shop you picked. No analytics,
          advertising or tracking cookies.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button type="button" onClick={dismiss} className="pl-btn-primary pl-btn-sm">
            Got it
          </button>
          <a href={privacyHref} className="pl-link text-sm">
            Privacy policy
          </a>
        </div>
      </div>
    </div>
  );
}
