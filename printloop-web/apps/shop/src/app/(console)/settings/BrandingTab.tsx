"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button, Card, ErrorState, Input, Notice, Section, Skeleton } from "@printloop/ui";
import { errorMessage, unwrap, uploadDirect, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient, useApiContext } from "@printloop/api-client/react";
import { useAction } from "@printloop/auth/actions";
import { useCanManage, useShopProfile } from "@/lib/shop-context";

type Branding = Schemas["Branding"];
type BrandingInput = Schemas["BrandingInput"];

const HEX = /^#[0-9a-fA-F]{6}$/;
const FIELDS: Array<{ key: keyof BrandingInput; label: string; placeholder?: string; type?: string }> = [
  { key: "wordmark", label: "Display name", placeholder: "How your shop name appears" },
  { key: "tagline", label: "Tagline", placeholder: "e.g. Fast prints beside the Faculty of Arts" },
  { key: "logoUrl", label: "Logo URL", placeholder: "https://…" },
  { key: "supportPhone", label: "Support phone", placeholder: "+234…", type: "tel" },
  { key: "supportEmail", label: "Support email", type: "email" },
  { key: "emailFromName", label: "Email sender name", placeholder: "Shown on receipts" },
];

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <label className="block">
      <span className="editorial-label block mb-1.5">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} disabled={disabled} value={HEX.test(value) ? value : "#1a1410"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-12 border-2 border-ink bg-paper cursor-pointer" />
        <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="#D14B2C" className="pl-input pl-mono uppercase" />
      </span>
      {value && !HEX.test(value) ? <span className="text-xs text-persimmon font-semibold">Use a 6-digit hex colour like #D14B2C.</span> : null}
    </label>
  );
}

function BrandingForm({ initial }: { initial: Branding | null }) {
  const client = useApiClient();
  const manage = useCanManage();
  const { run, isPending } = useAction();
  const [form, setForm] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const f of FIELDS) out[f.key] = String(initial?.[f.key as keyof Branding] ?? "");
    out.primaryColor = initial?.primaryColor ?? "";
    out.accentColor = initial?.accentColor ?? "";
    return out;
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const colorsValid = [form.primaryColor, form.accentColor].every((c) => !c || HEX.test(c));
  const save = () => {
    const body: BrandingInput = {};
    for (const [k, v] of Object.entries(form)) (body as Record<string, string | null>)[k] = v.trim() || null;
    return run("save", () => unwrap(client.PUT("/saas/me/branding", { body })), { success: "Branding saved.", invalidate: ["/saas/me/branding", "/saas/me"] });
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card className="space-y-1">
        <div className="grid sm:grid-cols-2 gap-x-4">
          {FIELDS.map((f) => (
            <Input key={f.key} label={f.label} type={f.type} disabled={!manage} placeholder={f.placeholder} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          ))}
          <ColorField label="Brand colour" value={form.primaryColor} disabled={!manage} onChange={(v) => set("primaryColor", v)} />
          <ColorField label="Accent colour" value={form.accentColor} disabled={!manage} onChange={(v) => set("accentColor", v)} />
        </div>
        {manage ? (
          <div className="pt-3">
            <Button size="sm" disabled={!colorsValid} loading={isPending("save")} onClick={save}>
              Save branding
            </Button>
          </div>
        ) : null}
      </Card>
      <div className="border-2 border-ink h-fit overflow-hidden" aria-label="Preview">
        <div className="p-4 text-paper" style={{ background: HEX.test(form.primaryColor) ? form.primaryColor : "#1A1410" }}>
          {form.logoUrl ? <img src={form.logoUrl} alt="" className="h-8 mb-2 object-contain" /> : null}
          <div className="font-serif text-xl font-bold">{form.wordmark || "Your shop"}</div>
          <div className="text-sm opacity-80">{form.tagline || "Your tagline"}</div>
        </div>
        <div className="p-4 bg-paper-light text-sm">
          <span className="inline-block px-3 py-1.5 font-bold text-paper" style={{ background: HEX.test(form.accentColor) ? form.accentColor : "#D14B2C" }}>
            Print now
          </span>
          <p className="text-xs text-fog mt-3">This is roughly how students see your shop.</p>
        </div>
      </div>
    </div>
  );
}

function Photos() {
  const shop = useShopProfile();
  const client = useApiClient();
  const manage = useCanManage();
  const { apiOrigin } = useApiContext();
  const { run, isPending } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const photos = shop.photos ?? [];
  const upload = async (file: File) => {
    const form = new FormData();
    form.append("photo", file);
    setProgress(0);
    await run("upload", () => uploadDirect({ purpose: "branding-photo", path: "/saas/me/photos", form, apiOrigin, onProgress: setProgress }), {
      success: "Photo added.",
      invalidate: ["/saas/me"],
    });
    setProgress(null);
  };
  return (
    <Section
      title="Shop photos"
      description="Shown on your public shop page. A clear shot of the counter and the street helps students find you."
      actions={
        manage ? (
          <>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
            <Button size="sm" variant="ghost" loading={isPending("upload")} onClick={() => input.current?.click()}>
              <ImagePlus size={14} /> {progress != null ? `${Math.round(progress * 100)}%` : "Add photo"}
            </Button>
          </>
        ) : null
      }
    >
      {photos.length ? (
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {photos.map((url) => (
            <li key={url} className="relative border-2 border-ink aspect-[4/3] bg-paper">
              <img src={url} alt="Shop" className="w-full h-full object-cover" />
              {manage ? (
                <button
                  type="button"
                  aria-label="Remove photo"
                  className="absolute top-1.5 right-1.5 bg-ink text-paper p-1.5 hover:bg-persimmon"
                  onClick={() => void run("del", () => unwrap(client.DELETE("/saas/me/photos", { body: { url } })), { success: "Photo removed.", invalidate: ["/saas/me"] })}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Notice tone="info">No photos yet.</Notice>
      )}
    </Section>
  );
}

export function BrandingTab() {
  const $api = useApi();
  const q = $api.useQuery("get", "/saas/me/branding");
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  return (
    <div>
      <Section title="Look and feel" description="Your name, colours and contact details on receipts and your print page.">
        {q.isLoading ? <Skeleton className="h-72" /> : <BrandingForm key={String(q.data?.data?.updatedAt ?? "new")} initial={(q.data?.data as Branding) ?? null} />}
      </Section>
      <Photos />
    </div>
  );
}
