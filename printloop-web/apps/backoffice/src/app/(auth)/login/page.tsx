import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame, Notice } from "@printloop/ui";
import { safeNextPath } from "@printloop/auth/config";
import { LoginForm } from "@printloop/auth/forms";
import { getCurrentUser } from "@printloop/auth/server";
import { canAccessBackoffice } from "@/lib/access";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string }> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/");
  const user = await getCurrentUser();
  if (user && canAccessBackoffice(user) && !params.denied) redirect(next);

  return (
    <AuthFrame
      kicker="PrintLoop staff"
      suffix="BACKOFFICE"
      title={
        <>
          The whole network, <em className="text-persimmon">one screen</em>.
        </>
      }
      lede="Shops, people, disputes and payouts across PrintLoop."
    >
      <h2 className="font-serif text-2xl font-bold mb-1">Staff sign-in</h2>
      <p className="text-sm text-ink/60 mb-5">Accounts here must use two-step sign-in.</p>
      <LoginForm
        next={next}
        notice={
          params.denied ? (
            <div className="mb-3">
              <Notice tone="warn" title="That account isn't PrintLoop staff">
                Shop owners sign in to the shop console instead.
              </Notice>
            </div>
          ) : null
        }
      />
    </AuthFrame>
  );
}
