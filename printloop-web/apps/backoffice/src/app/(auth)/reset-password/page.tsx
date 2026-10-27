import type { Metadata } from "next";
import { AuthFrame } from "@printloop/ui";
import { ResetPasswordForm } from "@printloop/auth/forms";

export const metadata: Metadata = { title: "Set your password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string; token?: string }> }) {
  const { email = "", token = "" } = await searchParams;
  return (
    <AuthFrame kicker="PrintLoop staff" suffix="BACKOFFICE" title={<>Choose a new password.</>}>
      <h2 className="font-serif text-2xl font-bold mb-4">New password</h2>
      <ResetPasswordForm email={email} token={token} />
    </AuthFrame>
  );
}
