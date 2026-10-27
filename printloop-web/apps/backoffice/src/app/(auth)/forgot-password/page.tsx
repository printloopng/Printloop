import type { Metadata } from "next";
import { AuthFrame } from "@printloop/ui";
import { ForgotPasswordForm } from "@printloop/auth/forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthFrame kicker="PrintLoop staff" suffix="BACKOFFICE" title={<>Reset your <em className="text-persimmon">password</em>.</>}>
      <h2 className="font-serif text-2xl font-bold mb-1">Forgot your password</h2>
      <p className="text-sm text-ink/60 mb-5">We&apos;ll email a reset link to your staff account.</p>
      <ForgotPasswordForm />
    </AuthFrame>
  );
}
