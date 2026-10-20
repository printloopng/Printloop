import type { Metadata } from "next";
import { ForgotPasswordForm } from "@printloop/auth/forms";
import { CustomerAuthFrame } from "@/components/CustomerAuthFrame";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <CustomerAuthFrame kicker="Locked out?" title={<>It happens. <em className="text-persimmon">Reset</em> it.</>}>
      <h2 className="font-serif text-2xl font-bold mb-1">Forgot your password</h2>
      <p className="text-sm text-ink/60 mb-5">Enter your email and we&apos;ll send a reset link.</p>
      <ForgotPasswordForm />
    </CustomerAuthFrame>
  );
}
