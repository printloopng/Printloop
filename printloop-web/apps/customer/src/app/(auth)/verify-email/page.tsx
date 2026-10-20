import type { Metadata } from "next";
import { safeNextPath } from "@printloop/auth/config";
import { getCurrentUser } from "@printloop/auth/server";
import { CustomerAuthFrame } from "@/components/CustomerAuthFrame";
import { VerifyEmailForm } from "./VerifyEmailForm";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  return (
    <CustomerAuthFrame
      kicker="One last step"
      title={
        <>
          Check your <em className="text-persimmon">inbox</em>.
        </>
      }
      lede="We sent a 6-digit code. It expires in 15 minutes."
    >
      <h2 className="font-serif text-2xl font-bold mb-1">Verify your email</h2>
      <VerifyEmailForm
        email={user?.email ?? params.email ?? ""}
        signedIn={Boolean(user)}
        alreadyVerified={Boolean(user?.isEmailVerified)}
        next={safeNextPath(params.next, "/")}
      />
    </CustomerAuthFrame>
  );
}
