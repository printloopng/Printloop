"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Copy, Download, KeyRound } from "lucide-react";
import { Button, Card, ConfirmDialog, Input, Notice, Pill, Section, formatDate, toast } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApi, useApiClient, useQueryClient } from "@printloop/api-client/react";
import { signOut } from "@printloop/auth/client";
import type { SessionUser } from "@printloop/auth/config";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Required").max(60),
  lastName: z.string().trim().min(1, "Required").max(60),
  phoneNumber: z.string().trim().regex(/^\+?\d{10,15}$/, "Use digits only, e.g. +2348030000000"),
});

const passwordSchema = z
  .object({
    oldPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(10, "Use at least 10 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

function ProfileForm({ user }: { user: SessionUser }) {
  const client = useApiClient();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: user.firstName ?? "", lastName: user.lastName ?? "", phoneNumber: user.phoneNumber ?? "" },
  });
  const onSubmit = handleSubmit(async (values) => {
    try {
      await unwrap(client.PUT("/customer/auth/me", { body: values }));
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Input label="First name" error={formState.errors.firstName?.message} {...register("firstName")} />
        <Input label="Last name" error={formState.errors.lastName?.message} {...register("lastName")} />
      </div>
      <Input label="Email" value={user.email} disabled helper="Contact support to change your email." />
      <Input label="Phone" type="tel" error={formState.errors.phoneNumber?.message} {...register("phoneNumber")} />
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={formState.isSubmitting}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const client = useApiClient();
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });
  const onSubmit = handleSubmit(async ({ oldPassword, newPassword }) => {
    try {
      await unwrap(client.PUT("/customer/auth/password", { body: { oldPassword, newPassword } }));
      toast.success("Password changed.");
      reset();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate>
      <Input label="Current password" type="password" autoComplete="current-password" error={formState.errors.oldPassword?.message} {...register("oldPassword")} />
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Input label="New password" type="password" autoComplete="new-password" error={formState.errors.newPassword?.message} {...register("newPassword")} />
        <Input label="Confirm" type="password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register("confirm")} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={formState.isSubmitting}>
          Change password
        </Button>
      </div>
    </form>
  );
}

function PrintDriver() {
  const $api = useApi();
  const client = useApiClient();
  const qc = useQueryClient();
  const status = $api.useQuery("get", "/customer/print-token");
  const [fresh, setFresh] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const has = status.data?.data?.hasToken;

  const rotate = async () => {
    const data = await unwrap(client.POST("/customer/print-token/rotate"));
    setFresh(data?.token ?? null);
    await qc.invalidateQueries({ queryKey: ["get", "/customer/print-token"] });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/70">
        Print straight from Word or your browser on a laptop: install the PrintLoop printer and paste this token when asked.
      </p>
      <div className="flex items-center gap-3">
        <KeyRound size={18} className="text-ochre" />
        {has ? <Pill tone="sage">Active {status.data?.data?.hint}</Pill> : <Pill tone="fog">No token yet</Pill>}
      </div>
      {fresh ? (
        <Notice
          tone="warn"
          title="Copy it now. We won't show it again."
          action={
            <Button
              size="sm"
              variant="dark"
              onClick={async () => {
                await navigator.clipboard.writeText(fresh);
                toast.success("Token copied.");
              }}
            >
              <Copy size={13} /> Copy
            </Button>
          }
        >
          <code className="pl-mono text-xs break-all">{fresh}</code>
        </Notice>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => (has ? setConfirm(true) : rotate().catch((e) => toast.error(errorMessage(e))))}>
        {has ? "Replace token" : "Create token"}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Replace your print-driver token?"
        description="Computers using the old token will stop printing until you paste the new one."
        confirmLabel="Replace"
        onConfirm={() => rotate().catch((e) => {
          toast.error(errorMessage(e));
          throw e;
        })}
      />
    </div>
  );
}

function DataAndPrivacy() {
  const client = useApiClient();
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/pl/customer/auth/export", { method: "POST" });
      if (!res.ok) throw new Error("Export failed. Try again in a minute.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `printloop-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    try {
      await unwrap(client.DELETE("/customer/auth/me"));
      toast.success("Account closed.");
      await signOut("/login");
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="font-bold">Download your data</div>
          <p className="text-sm text-ink/60">Jobs, payments, groups and reviews as a JSON file.</p>
        </div>
        <Button variant="ghost" size="sm" loading={exporting} onClick={exportData}>
          <Download size={14} /> Export
        </Button>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t-2 border-ink/10 pt-5">
        <div>
          <div className="font-bold text-persimmon">Close account</div>
          <p className="text-sm text-ink/60">Your uploads are deleted. Payment records are kept as the law requires.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setConfirm(true)}>
          Close account
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Close your PrintLoop account?"
        description="You'll be signed out everywhere. Unused print codes stop working."
        confirmLabel="Close account"
        destructive
        onConfirm={deleteAccount}
      />
    </div>
  );
}

export function SettingsView({ user }: { user: SessionUser }) {
  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <Section title="Profile" description={`Member since ${formatDate(user.createdAt)}`}>
        <Card>
          <ProfileForm user={user} />
        </Card>
      </Section>
      <Section title="Password">
        <Card>
          <PasswordForm />
        </Card>
      </Section>
      <Section title="Desktop print driver">
        <Card>
          <PrintDriver />
        </Card>
      </Section>
      <Section title="Data & privacy">
        <Card>
          <DataAndPrivacy />
        </Card>
      </Section>
    </div>
  );
}
