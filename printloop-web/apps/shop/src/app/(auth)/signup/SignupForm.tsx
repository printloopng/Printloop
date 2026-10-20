"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input, Notice } from "@printloop/ui";

const schema = z.object({
  businessName: z.string().trim().min(2, "Enter your shop's name").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/, "3–30 lowercase letters, numbers or dashes; start with a letter"),
  ownerFirstName: z.string().trim().min(1, "Required"),
  ownerLastName: z.string().trim().min(1, "Required"),
  ownerEmail: z.string().trim().email("Enter a valid email"),
  ownerPhone: z.string().trim().regex(/^(\+?234|0)[789][01]\d{8}$/, "Enter a Nigerian phone number"),
  ownerPassword: z.string().min(10, "Use at least 10 characters"),
});

type Values = z.infer<typeof schema>;

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 30);
}

async function post(path: string, body: unknown) {
  const res = await fetch(`/api/pl${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(payload?.message || "Request failed"), { code: payload?.code });
  return payload;
}

export function SignupForm() {
  const [done, setDone] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [slugState, setSlugState] = useState<"idle" | "checking" | "free" | "taken">("idle");
  const [slugTouched, setSlugTouched] = useState(false);
  const { register, handleSubmit, setValue, control, formState } = useForm<Values>({ resolver: zodResolver(schema) });
  const name = useWatch({ control, name: "businessName" });
  const slug = useWatch({ control, name: "slug" });

  useEffect(() => {
    if (!slugTouched && name) setValue("slug", slugify(name), { shouldValidate: false });
  }, [name, slugTouched, setValue]);

  useEffect(() => {
    if (!slug || !/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSlugState("checking");
      try {
        const res = await fetch("/api/pl/saas/check-slug", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug }),
          signal: ctrl.signal,
        });
        const body = await res.json();
        setSlugState(body?.available ?? body?.data?.available ? "free" : "taken");
      } catch {
        setSlugState("idle");
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [slug]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const phone = values.ownerPhone.startsWith("0") ? `+234${values.ownerPhone.slice(1)}` : values.ownerPhone.startsWith("234") ? `+${values.ownerPhone}` : values.ownerPhone;
    try {
      await post("/saas/signup", { ...values, ownerPhone: phone });
      setDone(values.ownerEmail);
    } catch (err) {
      const e = err as Error & { code?: string };
      setFormError(e.code === "SLUG_TAKEN" ? "That web address is taken. Try another." : e.code === "EMAIL_TAKEN" ? "That email already runs a shop. Sign in instead." : e.message);
    }
  });

  if (done) {
    return (
      <div className="space-y-4">
        <Notice tone="success" title="Check your inbox">
          We sent a verification link to <strong>{done}</strong>. Open it to activate your shop.
        </Notice>
        <Link href={`/login?email=${encodeURIComponent(done)}`} className="pl-btn-primary">
          Go to sign in <span className="pl-arrow">→</span>
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
      <Input label="Shop name" placeholder="e.g. Akoka Express Prints" error={formState.errors.businessName?.message} {...register("businessName")} />
      <Input
        label="Web address"
        error={formState.errors.slug?.message ?? (slugState === "taken" ? "Already taken" : undefined)}
        helper={slug ? `${slug}.printloop.app${slugState === "free" ? " · available" : slugState === "checking" ? " · checking…" : ""}` : undefined}
        {...register("slug", { onChange: () => setSlugTouched(true) })}
      />
      <div className="grid sm:grid-cols-2 gap-x-3">
        <Input label="Your first name" autoComplete="given-name" error={formState.errors.ownerFirstName?.message} {...register("ownerFirstName")} />
        <Input label="Last name" autoComplete="family-name" error={formState.errors.ownerLastName?.message} {...register("ownerLastName")} />
      </div>
      <Input label="Email" type="email" autoComplete="email" error={formState.errors.ownerEmail?.message} {...register("ownerEmail")} />
      <Input label="Phone" type="tel" autoComplete="tel" error={formState.errors.ownerPhone?.message} {...register("ownerPhone")} />
      <Input label="Password" type="password" autoComplete="new-password" helper="At least 10 characters." error={formState.errors.ownerPassword?.message} {...register("ownerPassword")} />
      <div className="flex items-center justify-between pt-3">
        <Link href="/login" className="text-sm pl-link">
          I have a shop
        </Link>
        <Button type="submit" loading={formState.isSubmitting} disabled={slugState === "taken"} arrow>
          Create shop
        </Button>
      </div>
    </form>
  );
}
