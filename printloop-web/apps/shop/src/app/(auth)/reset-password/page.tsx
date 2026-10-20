import type { Metadata } from "next";
import { AuthFrame } from "@printloop/ui";
import { ResetPasswordForm } from "@printloop/auth/forms";

export const metadata: Metadata = { title: "Set your password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string; invite?: string }>;
}) {
  const { email = "", token = "", invite } = await searchParams;
  const isInvite = invite === "1";
  return (
    <AuthFrame
      kicker={isInvite ? "You're invited" : "Shop console"}
      suffix="SHOP CONSOLE"
      title={isInvite ? <>Welcome to the <em className="text-persimmon">team</em>.</> : <>Choose a new password.</>}
    >
      <h2 className="font-serif text-2xl font-bold mb-4">{isInvite ? "Set your password" : "New password"}</h2>
      <ResetPasswordForm email={email} token={token} invite={isInvite} />
    </AuthFrame>
  );
}
