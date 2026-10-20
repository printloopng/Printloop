"use client";

import { useEffect } from "react";
import { Wordmark } from "./Layout";

export function SystemPage({
  code,
  title,
  message,
  action,
}: {
  code: string;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen grid place-items-center bg-paper px-4">
      <div className="max-w-lg w-full text-center">
        <Wordmark />
        <div className="mt-10 pl-mono text-7xl font-bold text-persimmon">{code}</div>
        <h1 className="mt-3 font-serif text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 font-serif italic text-ink/60">{message}</p>
        <div className="mt-8 flex justify-center gap-2">{action}</div>
      </div>
    </main>
  );
}

export function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <SystemPage
      code="500"
      title="Something broke on our side"
      message={error.digest ? `Reference ${error.digest}. Try again, and contact support if it keeps happening.` : "Try again in a moment."}
      action={
        <>
          <button type="button" className="pl-btn-primary" onClick={reset}>
            Try again
          </button>
          <a href="/" className="pl-btn-ghost">
            Home
          </a>
        </>
      }
    />
  );
}
