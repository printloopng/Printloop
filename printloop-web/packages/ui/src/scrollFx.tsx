"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(QUERY).matches || typeof IntersectionObserver === "undefined",
    () => false,
  );
}

export type RevealVariant =
  | "rise"
  | "left"
  | "right"
  | "stamp"
  | "wipe"
  | "fade"
  | "flip"
  | "scale"
  | "blur"
  | "rotate-in"
  | "slide-up";

export function useInView<T extends HTMLElement = HTMLDivElement>(opts: { threshold?: number; once?: boolean } = {}) {
  const { threshold = 0.15, once = true } = opts;
  const ref = useRef<T>(null);
  const reduced = usePrefersReducedMotion();
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          if (once) io.disconnect();
        } else if (!once) {
          setSeen(false);
        }
      },
      { threshold, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold, reduced]);

  return { ref, shown: reduced || seen };
}

export function Reveal({
  children,
  variant = "rise",
  delay = 0,
  once = true,
  threshold = 0.15,
  className = "",
}: {
  children: ReactNode;
  variant?: RevealVariant;
  delay?: number;
  once?: boolean;
  threshold?: number;
  className?: string;
}) {
  const { ref, shown } = useInView({ once, threshold });
  return (
    <div
      ref={ref}
      data-shown={shown ? "" : undefined}
      className={`pl-reveal pl-reveal-${variant} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export function Typeset({ text, className = "" }: { text: string; className?: string }) {
  const { ref, shown } = useInView<HTMLSpanElement>({ threshold: 0.3 });
  return (
    <span ref={ref} data-shown={shown ? "" : undefined} className={`pl-typeset ${className}`}>
      {text.split(" ").map((word, i) => (
        <span key={`${word}-${i}`} className="pl-word" style={{ ["--w" as string]: i }}>
          {word}
          {" "}
        </span>
      ))}
    </span>
  );
}

export function Counter({
  to,
  prefix = "",
  suffix = "",
  duration = 1400,
  className = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const [val, setVal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / duration);
          setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [to, duration, reduced]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {(reduced ? to : val).toLocaleString("en-NG")}
      {suffix}
    </span>
  );
}

function useScrollTransform(compute: (scrollY: number) => string) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const transform = useEffectEvent((y: number) => compute(y));

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      if (ref.current) ref.current.style.transform = transform(window.scrollY);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return ref;
}

export function useParallax(factor: number) {
  return useScrollTransform((y) => `translate3d(0, ${(y * factor).toFixed(1)}px, 0)`);
}

export function useScrollSpin(degPerPx: number, baseDeg = 0) {
  return useScrollTransform((y) => `rotate(${(baseDeg + y * degPerPx).toFixed(2)}deg)`);
}

function useProgress<T extends HTMLElement>(
  onProgress: (p: number) => void,
  measure: (rect: DOMRect, vh: number) => number,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const reduced = usePrefersReducedMotion();
  const report = useEffectEvent((rect: DOMRect | null) => onProgress(rect ? measure(rect, window.innerHeight) : 1));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      report(null);
      return;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      report(el.getBoundingClientRect());
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return ref;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function useScrollScrub(onProgress: (p: number) => void) {
  return useProgress<HTMLDivElement>(onProgress, (r, vh) => {
    const total = r.height + vh;
    return total > 0 ? clamp01((vh - r.top) / total) : 1;
  });
}

export function usePinScrub(onProgress: (p: number) => void) {
  return useProgress<HTMLDivElement>(onProgress, (r, vh) => {
    const span = r.height - vh;
    return span > 0 ? clamp01(-r.top / span) : 1;
  });
}

export function Magnetic({ children, strength = 0.22, className = "" }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * strength;
      const dy = (e.clientY - (r.top + r.height / 2)) * strength;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        });
      }
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.style.transform = "translate(0px, 0px)";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [strength, reduced]);

  return (
    <div ref={ref} className={`transition-transform duration-200 ease-expressive ${className}`}>
      {children}
    </div>
  );
}

export function ScrollProgress({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (ref.current) ref.current.style.transform = `scaleX(${p.toFixed(4)})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`h-[3px] bg-paper ${className}`} aria-hidden="true">
      <div ref={ref} className="h-full w-full bg-persimmon origin-left" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

export function Marquee({ items, reactive = false }: { items: { text: string; accent?: boolean }[]; reactive?: boolean }) {
  const tape = [...items, ...items];
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!reactive || reduced) return;
    const el = ref.current;
    if (!el) return;
    let x = 0;
    let vel = 0;
    let lastY = window.scrollY;
    let raf = 0;
    const tick = () => {
      const y = window.scrollY;
      vel += (Math.abs(y - lastY) - vel) * 0.12;
      lastY = y;
      x -= 0.55 + Math.min(vel * 0.18, 3.2);
      const half = el.scrollWidth / 2;
      if (half > 0 && -x >= half) x += half;
      el.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reactive, reduced]);

  return (
    <div className="bg-ink text-paper py-2 overflow-hidden border-b-2 border-persimmon" aria-hidden="true">
      <div ref={ref} className={`flex gap-12 whitespace-nowrap ${reactive ? "" : "motion-safe:animate-marquee"}`}>
        {tape.map((item, i) => (
          <span key={i} className={`text-[10px] tracking-editorial font-bold ${item.accent ? "text-persimmon" : ""}`}>
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}

export function EditorialFooter({ inverse = false, version = "v2.0" }: { inverse?: boolean; version?: string }) {
  const cls = inverse ? "bg-ink text-paper" : "bg-paper border-t-2 border-ink";
  const { ref, shown } = useInView<HTMLElement>();
  return (
    <footer
      ref={ref}
      data-shown={shown ? "" : undefined}
      className={`pl-reveal pl-reveal-rise ${cls} px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 sm:gap-3 text-sm`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="editorial-label text-persimmon flex-shrink-0">★ PRINTLOOP</span>
        <span className={`font-serif italic text-xs sm:text-sm ${inverse ? "text-paper/80" : "text-ink/60"}`}>
          Every print, recorded. Every station, ready.
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="pl-mono text-[11px] opacity-55">{version} · NG</span>
        <span className="pl-ornament text-ochre text-lg cursor-default" aria-hidden="true">
          ❦
        </span>
      </div>
    </footer>
  );
}
