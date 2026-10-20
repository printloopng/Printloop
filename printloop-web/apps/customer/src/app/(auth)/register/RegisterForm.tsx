"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Checkbox, Input, Notice } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { register as registerAccount } from "@printloop/auth/client";

const NG_PHONE = /^(\+?234|0)[789][01]\d{8}$/;

const schema = z
  .object({
    firstName: z.string().trim().min(1, "Enter your first name").max(60),
    lastName: z.string().trim().min(1, "Enter your last name").max(60),
    email: z.string().trim().email("Enter a valid email"),
    phoneNumber: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .refine((v) => NG_PHONE.test(v), "Enter a Nigerian phone number, e.g. 0803 000 0000"),
    password: z.string().min(10, "Use at least 10 characters"),
    terms: z.boolean().refine((v) => v, "You need to accept the terms"),
  });

type Values = z.input<typeof schema>;

export function RegisterForm({ next }: { next: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { terms: false } });

  const onSubmit = handleSubmit(async (raw) => {
    setFormError(null);
    const values = schema.parse(raw);
    const phone = values.phoneNumber.startsWith("0") ? `+234${values.phoneNumber.slice(1)}` : values.phoneNumber.startsWith("234") ? `+${values.phoneNumber}` : values.phoneNumber;
    try {
      await registerAccount({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phoneNumber: phone,
        password: values.password,
      });
      window.location.assign(`/verify-email?next=${encodeURIComponent(next)}`);
    } catch (err) {
      setFormError(errorMessage(err, "Could not create your account."));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      {formError ? (
        <div className="mb-3">
          <Notice tone="danger">{formError}</Notice>
        </div>
      ) : null}
      <div className="grid sm:grid-cols-2 gap-x-3">
        <Input label="First name" autoComplete="given-name" error={errors.firstName?.message} {...register("firstName")} />
        <Input label="Last name" autoComplete="family-name" error={errors.lastName?.message} {...register("lastName")} />
      </div>
      <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
      <Input
        label="Phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="0803 000 0000"
        helper="We text your print code here too."
        error={errors.phoneNumber?.message}
        {...register("phoneNumber")}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        helper="At least 10 characters."
        error={errors.password?.message}
        {...register("password")}
      />
      <div className="mt-2 mb-1">
        <Checkbox
          label={
            <>
              I agree to the{" "}
              <a href={`${process.env.NEXT_PUBLIC_LANDING_URL ?? ""}/terms`} className="pl-link" target="_blank" rel="noreferrer">
                terms
              </a>{" "}
              and{" "}
              <a href={`${process.env.NEXT_PUBLIC_LANDING_URL ?? ""}/privacy`} className="pl-link" target="_blank" rel="noreferrer">
                privacy policy
              </a>
            </>
          }
          {...register("terms")}
        />
        {errors.terms ? <div className="text-xs text-persimmon font-semibold mt-1">{errors.terms.message}</div> : null}
      </div>
      <div className="flex items-center justify-between pt-4">
        <Link href="/login" className="text-sm pl-link">
          I have an account
        </Link>
        <Button type="submit" loading={isSubmitting} arrow>
          Create account
        </Button>
      </div>
    </form>
  );
}
