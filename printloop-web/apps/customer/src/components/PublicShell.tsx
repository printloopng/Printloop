import type { ReactNode } from "react";
import Link from "next/link";
import { EditorialFooter, Wordmark, buttonClass } from "@printloop/ui";

export function PublicShell({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-paper/95 backdrop-blur border-b-2 border-ink">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" aria-label="PrintLoop home">
            <Wordmark className="text-[20px]" />
          </Link>
          {signedIn ? (
            <Link href="/" className={buttonClass("ghost", "sm")}>
              My prints
            </Link>
          ) : (
            <div className="flex gap-2">
              <Link href="/login" className={buttonClass("ghost", "sm")}>
                Sign in
              </Link>
              <Link href="/register" className={buttonClass("primary", "sm")}>
                Join
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 sm:py-12">{children}</main>
      <EditorialFooter inverse />
    </div>
  );
}
