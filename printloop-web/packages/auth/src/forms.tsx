"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input, Notice } from "@printloop/ui";
import { errorMessage, isApiError } from "@printloop/api-client";
import { signIn } from "./client";
import { safeNextPath } from "./config";

const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  totpCode: z.string().trim().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm({
  next,
  defaultEmail,
  fallbackPath = "/",
  forgotHref = "/forgot-password",
  footer,
  notice,
}: {
  next?: string | null;
  defaultEmail?: string;
  fallbackPath?: string;
  forgotHref?: string;
  footer?: ReactNode;
  notice?: ReactNode;
}) {
  const [needsCode, setNeedsCode] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: defaultEmail ?? "", password: "", totpCode: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn({
        email: values.email,
        password: values.password,
        totpCode: needsCode ? values.totpCode : undefined,
      });
      window.location.assign(safeNextPath(next, fallbackPath));
    } catch (err) {
      if (isApiError(err) && (err.code === "TOTP_REQUIRED" || err.code === "TOTP_INVALID")) {
        setNeedsCode(true);
        if (err.code === "TOTP_INVALID") setFormError("That code didn't match. Try the latest one from your app.");
        return;
      }
      setFormError(errorMessage(err, "Could not sign you in."));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-1">
      {notice}
      {formError ? (
        <div className="mb-3">
          <Notice tone="danger">{formError}</Notice>
        </div>
      ) : null}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      {needsCode ? (
        <Input
          label="Authenticator code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          helper="Open your authenticator app and enter the 6-digit code."
          autoFocus
          error={errors.totpCode?.message}
          {...register("totpCode")}
        />
      ) : null}
      <div className="flex items-center justify-between pt-2">
        <Link href={forgotHref} className="text-sm pl-link">
          Forgot password?
        </Link>
        <Button type="submit" loading={isSubmitting} arrow>
          Sign in
        </Button>
      </div>
      {footer ? <div className="pt-5 text-sm text-ink/70">{footer}</div> : null}
    </form>
  );
}

const forgotSchema = z.object({ email: z.string().trim().email("Enter a valid email") });

export function ForgotPasswordForm({ loginHref = "/login" }: { loginHref?: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      const res = await fetch("/api/pl/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok && res.status !== 200) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Could not send the reset link.");
      }
      setSent(email);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  if (sent) {
    return (
      <div className="space-y-4">
        <Notice tone="success" title="Check your inbox">
          If <strong>{sent}</strong> has a PrintLoop account, a reset link is on its way. It expires in 30 minutes.
        </Notice>
        <Link href={loginHref} className="pl-link text-sm">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {formError ? (
        <div className="mb-3">
          <Notice tone="danger">{formError}</Notice>
        </div>
      ) : null}
      <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
      <div className="flex items-center justify-between pt-2">
        <Link href={loginHref} className="text-sm pl-link">
          Back to sign in
        </Link>
        <Button type="submit" loading={isSubmitting} arrow>
          Send link
        </Button>
      </div>
    </form>
  );
}

const resetSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

export function ResetPasswordForm({
  email,
  token,
  loginHref = "/login",
  invite = false,
}: {
  email: string;
  token: string;
  loginHref?: string;
  invite?: boolean;
}) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  if (!email || !token) {
    return (
      <Notice tone="danger" title="This link is incomplete">
        Open the link from your email again, or request a new one.
      </Notice>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    const res = await fetch("/api/pl/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, token, password }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setFormError(body?.message || "That link is no longer valid. Request a new one.");
      return;
    }
    setDone(true);
  });

  if (done) {
    return (
      <div className="space-y-4">
        <Notice tone="success" title={invite ? "You're all set" : "Password updated"}>
          Sign in with your new password.
        </Notice>
        <a href={`${loginHref}?email=${encodeURIComponent(email)}`} className="pl-btn-primary">
          Sign in <span className="pl-arrow">→</span>
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {formError ? (
        <div className="mb-3">
          <Notice tone="danger">{formError}</Notice>
        </div>
      ) : null}
      <div className="text-sm text-ink/70 mb-4">
        {invite ? "Choose a password for" : "New password for"} <strong>{email}</strong>
      </div>
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        helper="At least 10 characters."
        error={errors.password?.message}
        {...register("password")}
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register("confirm")}
      />
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={isSubmitting} arrow>
          {invite ? "Set password" : "Update password"}
        </Button>
      </div>
    </form>
  );
}
