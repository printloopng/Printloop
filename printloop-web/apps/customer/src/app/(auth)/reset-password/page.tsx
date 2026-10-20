import type { Metadata } from "next";
import { ResetPasswordForm } from "@printloop/auth/forms";
import { CustomerAuthFrame } from "@/components/CustomerAuthFrame";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const { email = "", token = "" } = await searchParams;
  return (
    <CustomerAuthFrame kicker="Reset password" title={<>Choose a <em className="text-persimmon">new</em> password.</>}>
      <h2 className="font-serif text-2xl font-bold mb-4">New password</h2>
      <ResetPasswordForm email={email} token={token} />
    </CustomerAuthFrame>
  );
}
