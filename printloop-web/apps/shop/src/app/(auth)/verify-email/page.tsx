import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame, Notice } from "@printloop/ui";
import { serverApi } from "@printloop/auth/server";
import { ResendVerification } from "./ResendVerification";

export const metadata: Metadata = { title: "Verify your email" };

async function verify(email: string, token: string): Promise<boolean> {
  if (!email || !token) return false;
  try {
    const api = await serverApi({ auth: false });
    const { data } = await api.POST("/saas/verify-email", { body: { email, token } });
    return Boolean(data?.data?.verified);
  } catch {
    return false;
  }
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string; token?: string }> }) {
  const { email = "", token = "" } = await searchParams;
  const ok = await verify(email, token);
  return (
    <AuthFrame kicker="Shop console" suffix="SHOP CONSOLE" title={ok ? <>You&apos;re <em className="text-persimmon">verified</em>.</> : <>Verify your email.</>}>
      {ok ? (
        <div className="space-y-4">
          <Notice tone="success" title="Email confirmed">
            Sign in to connect a printer, set prices and go live.
          </Notice>
          <Link href={`/login?verified=1&email=${encodeURIComponent(email)}`} className="pl-btn-primary">
            Sign in <span className="pl-arrow">→</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <Notice tone="warn" title="That link didn't work">
            It may have expired or been used already. Send yourself a fresh one.
          </Notice>
          <ResendVerification defaultEmail={email} />
        </div>
      )}
    </AuthFrame>
  );
}
