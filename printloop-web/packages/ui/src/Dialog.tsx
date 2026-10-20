"use client";

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "./cx";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  dismissible?: boolean;
}

const FOCUSABLE =
  'input, select, textarea, button:not([data-dialog-close]), [href], [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  dismissible = true,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useEffectEvent(() => onOpenChange(false));

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) close();
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (!items.length) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, dismissible]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="absolute inset-0 bg-ink/75 backdrop-blur-sm animate-fadein"
        onClick={() => dismissible && onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cx(
          "relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-paper border-4 border-ink shadow-[8px_8px_0_#1A1410] p-6 animate-fadein outline-none",
          className,
        )}
      >
        {dismissible ? (
          <button
            type="button"
            data-dialog-close
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 p-1 text-ink/60 hover:text-persimmon"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        ) : null}
        {title ? (
          <div className="mb-4 pr-8">
            <h2 id={titleId} className="pl-serif text-2xl font-bold tracking-tight leading-tight">
              {title}
            </h2>
            {description ? <p className="text-ink/60 pl-serif italic text-sm mt-1">{description}</p> : null}
          </div>
        ) : null}
        {children}
        {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
