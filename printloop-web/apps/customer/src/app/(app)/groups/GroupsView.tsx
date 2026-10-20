"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Button, Card, Checkbox, EmptyState, ErrorState, Input, Pill, Select, Skeleton, formatDateTime, timeAgo, toast } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApi, useApiClient, useQueryClient } from "@printloop/api-client/react";
import { useShop } from "@/lib/shop-context";
import { ShopRequired } from "@/components/ShopRequired";

function defaultDeadline(): string {
  const d = new Date(Date.now() + 2 * 864e5);
  d.setMinutes(0, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function CreateGroup() {
  const client = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [paper, setPaper] = useState("A4");
  const [color, setColor] = useState<"bw" | "color">("bw");
  const [sided, setSided] = useState<"single" | "double">("single");
  const [enforce, setEnforce] = useState(true);
  const [busy, setBusy] = useState(false);
  const [max] = useState(() => new Date(Date.now() + 7 * 864e5 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Name the group.");
    const when = new Date(deadline);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 15 * 60_000) return toast.error("Set a deadline at least 15 minutes away.");
    setBusy(true);
    try {
      const data = await unwrap(
        client.POST("/groups", {
          body: {
            groupName: name.trim(),
            deadline: when.toISOString(),
            defaultOptions: { paper, color, sided, qualityDpi: 300, orientation: "portrait", enforce },
          },
        }),
      );
      await qc.invalidateQueries({ queryKey: ["get", "/groups"] });
      toast.success("Group created. Share the link with your classmates.");
      router.push(`/groups/${data?.session.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="font-serif text-2xl font-bold mb-4">Start a group</h2>
      <form onSubmit={submit} noValidate>
        <Input label="Group name" placeholder="e.g. CSC 401 project report" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Input
          label="Upload deadline"
          type="datetime-local"
          value={deadline}
          max={max}
          onChange={(e) => setDeadline(e.target.value)}
          helper="Up to 7 days from now. Uploads close at this time."
        />
        <div className="grid grid-cols-3 gap-3">
          <Select label="Paper" value={paper} onChange={(e) => setPaper(e.target.value)} options={["A4", "A3", "LETTER"].map((p) => ({ value: p, label: p }))} />
          <Select
            label="Colour"
            value={color}
            onChange={(e) => setColor(e.target.value as "bw" | "color")}
            options={[
              { value: "bw", label: "B&W" },
              { value: "color", label: "Colour" },
            ]}
          />
          <Select
            label="Sides"
            value={sided}
            onChange={(e) => setSided(e.target.value as "single" | "double")}
            options={[
              { value: "single", label: "Single" },
              { value: "double", label: "Double" },
            ]}
          />
        </div>
        <Checkbox
          checked={enforce}
          onChange={(e) => setEnforce(e.target.checked)}
          label="Same settings for everyone"
          description="Keeps the bound copy consistent. Members can still choose copies."
        />
        <div className="flex justify-end mt-5">
          <Button type="submit" loading={busy} arrow>
            Create group
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function GroupsView() {
  const shop = useShop();
  const $api = useApi();
  const groups = $api.useQuery("get", "/groups", {}, { refetchInterval: 30_000 });
  const sessions = groups.data?.data?.sessions ?? [];
  const [now] = useState(() => Date.now());

  if (!shop) return <ShopRequired action="start a group" />;

  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6 items-start">
      <CreateGroup />
      <section aria-labelledby="my-groups">
        <h2 id="my-groups" className="font-serif text-2xl font-bold mb-3">
          Your groups
        </h2>
        {groups.error ? (
          <ErrorState message={errorMessage(groups.error)} />
        ) : groups.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : sessions.length ? (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const open = s.status === "open" && new Date(s.deadline).getTime() > now;
              return (
                <li key={s.id}>
                  <Link href={`/groups/${s.id}`} className="pl-card block">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-serif text-xl font-bold">{s.groupName}</span>
                      <Pill tone={open ? "sage" : s.batchCode ? "ink" : "fog"} live={open}>
                        {open ? "Collecting" : s.batchCode ? "Ready" : "Closed"}
                      </Pill>
                    </div>
                    <div className="mt-1 text-xs text-fog">
                      {open ? `Closes ${formatDateTime(s.deadline)}` : `Created ${timeAgo(s.createdAt)}`}
                      {s.batchCode ? <span className="ml-3 pl-mono font-bold text-ink">{s.batchCode}</span> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Users size={30} />} title="No groups yet" description="Create one and share the link in your class chat." />
        )}
      </section>
    </div>
  );
}
