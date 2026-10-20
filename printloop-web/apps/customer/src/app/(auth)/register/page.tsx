import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@printloop/auth/config";
import { getCurrentUser } from "@printloop/auth/server";
import { CustomerAuthFrame } from "@/components/CustomerAuthFrame";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNextPath(next, "/"));
  return (
    <CustomerAuthFrame
      kicker="Join PrintLoop"
      title={
        <>
          Print from your phone. <em className="text-persimmon">Collect</em> in seconds.
        </>
      }
      lede="One account works at every PrintLoop shop on campus."
    >
      <h2 className="font-serif text-2xl font-bold mb-1">Create your account</h2>
      <p className="text-sm text-ink/60 mb-5">We&apos;ll email you a 6-digit code to confirm it&apos;s you.</p>
      <RegisterForm next={safeNextPath(next, "/")} />
    </CustomerAuthFrame>
  );
}
