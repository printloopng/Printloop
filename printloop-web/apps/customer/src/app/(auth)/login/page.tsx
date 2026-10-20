import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@printloop/ui";
import { safeNextPath } from "@printloop/auth/config";
import { LoginForm } from "@printloop/auth/forms";
import { getCurrentUser, serverApi } from "@printloop/auth/server";
import { CustomerAuthFrame } from "@/components/CustomerAuthFrame";

export const metadata: Metadata = { title: "Sign in" };

async function handoffEmail(token: string | undefined): Promise<string | undefined> {
  if (!token) return undefined;
  try {
    const api = await serverApi({ auth: false });
    const { data } = await api.GET("/discovery/handoff/verify", { params: { query: { token } } });
    return data?.data?.email ?? undefined;
  } catch {
    return undefined;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; handoff?: string; email?: string; registered?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/");
  if (await getCurrentUser()) redirect(next);
  const email = params.email ?? (await handoffEmail(params.handoff));

  return (
    <CustomerAuthFrame
      kicker="Welcome back"
      title={
        <>
          Your prints, <em className="text-persimmon">waiting</em>.
        </>
      }
      lede="Sign in to upload, pay and pick up from any station at your shop."
    >
      <h2 className="font-serif text-2xl font-bold mb-1">Sign in</h2>
      <p className="text-sm text-ink/60 mb-5">Use the email you registered with.</p>
      <LoginForm
        next={next}
        defaultEmail={email}
        notice={
          params.registered ? (
            <div className="mb-3">
              <Notice tone="success">Your email is verified. Sign in to continue.</Notice>
            </div>
          ) : null
        }
        footer={
          <>
            New to PrintLoop?{" "}
            <Link href={`/register${params.next ? `?next=${encodeURIComponent(next)}` : ""}`} className="pl-link font-semibold">
              Create an account
            </Link>
          </>
        }
      />
    </CustomerAuthFrame>
  );
}
