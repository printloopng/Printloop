import type { Metadata } from "next";
import { AuthFrame } from "@printloop/ui";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Open your shop" };

export default function SignupPage() {
  return (
    <AuthFrame
      kicker="For print shops"
      suffix="SHOP CONSOLE"
      title={
        <>
          Take orders while you <em className="text-persimmon">sleep</em>.
        </>
      }
      lede="Students upload and pay online. Your printer prints when they arrive. You get paid out weekly."
    >
      <h2 className="font-serif text-2xl font-bold mb-1">Open your shop</h2>
      <p className="text-sm text-ink/60 mb-5">Free to start. PrintLoop takes a small commission per paid print.</p>
      <SignupForm />
    </AuthFrame>
  );
}
