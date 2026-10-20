import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame, Notice } from "@printloop/ui";
import { safeNextPath } from "@printloop/auth/config";
import { LoginForm } from "@printloop/auth/forms";
import { getCurrentUser } from "@printloop/auth/server";
import { canAccessShop } from "@/lib/access";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; denied?: string; email?: string; verified?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/");
  const user = await getCurrentUser();
  if (user && canAccessShop(user) && !params.denied) redirect(next);

  return (
    <AuthFrame
      kicker="Shop console"
      suffix="SHOP CONSOLE"
      title={
        <>
          Your counter, <em className="text-persimmon">anywhere</em>.
        </>
      }
      lede="Queue, kiosks, prices and payouts for your print shop."
    >
      <h2 className="font-serif text-2xl font-bold mb-1">Sign in to your shop</h2>
      <p className="text-sm text-ink/60 mb-5">Owners, admins and staff use the same sign-in.</p>
      <LoginForm
        next={next}
        defaultEmail={params.email}
        notice={
          params.denied ? (
            <div className="mb-3">
              <Notice tone="warn" title="That account isn't a shop account">
                Customers sign in on the PrintLoop app. Ask your shop owner for a team invite if you work here.
              </Notice>
            </div>
          ) : params.verified ? (
            <div className="mb-3">
              <Notice tone="success">Email verified. Sign in to finish setting up your shop.</Notice>
            </div>
          ) : null
        }
        footer={
          <>
            New shop?{" "}
            <Link href="/signup" className="pl-link font-semibold">
              Put your shop on PrintLoop
            </Link>
          </>
        }
      />
    </AuthFrame>
  );
}
