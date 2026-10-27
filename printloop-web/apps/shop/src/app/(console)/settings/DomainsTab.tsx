"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button, Card, ConfirmDialog, DataTable, ErrorState, Input, Notice, Pill, Section, Skeleton, formatDateTime, toast } from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@/lib/actions";
import { useCanManage } from "@/lib/shop-context";

type Domain = Schemas["TenantDomain"];
type Dns = { txt?: { name?: string; value?: string }; cname?: { name?: string; value?: string } };

function Record({ type, name, value }: { type: string; name?: string; value?: string }) {
  return (
    <tr className="border-t border-ink/15">
      <td className="py-2 pr-3 font-bold">{type}</td>
      <td className="py-2 pr-3 pl-mono text-xs break-all">{name}</td>
      <td className="py-2 pr-3 pl-mono text-xs break-all">{value}</td>
      <td className="py-2 text-right">
        <button type="button" aria-label={`Copy ${type} value`} className="hover:text-persimmon" onClick={() => void navigator.clipboard.writeText(value ?? "").then(() => toast.success("Copied."))}>
          <Copy size={14} />
        </button>
      </td>
    </tr>
  );
}

export function DomainsTab() {
  const $api = useApi();
  const client = useApiClient();
  const manage = useCanManage();
  const { run, isPending } = useAction();
  const [domain, setDomain] = useState("");
  const [dns, setDns] = useState<{ domain: string; records: Dns } | null>(null);
  const [removing, setRemoving] = useState<Domain | null>(null);
  const q = $api.useQuery("get", "/saas/me/domains");
  const valid = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain.trim());

  const add = () =>
    run("add", () => unwrap(client.POST("/saas/me/domains", { body: { domain: domain.trim().toLowerCase() } })), { invalidate: ["/saas/me/domains"] }).then((r) => {
      if (!r) return;
      setDns({ domain: r.domain, records: r.dns as Dns });
      setDomain("");
    });
  const verify = (d: Domain) =>
    run(`verify-${d.id}`, () => unwrap(client.POST("/saas/me/domains/{id}/verify", { params: { path: { id: d.id } } })), { invalidate: ["/saas/me/domains"] }).then((r) => {
      if (!r) return;
      if (r.verified) toast.success(`${d.domain} is live.`);
      else toast.warning("DNS isn't showing the records yet. Changes can take up to a few hours.");
    });

  return (
    <div>
      <Section title="Custom domain" description="Serve your print page from your own web address, like print.yourshop.ng.">
        {manage ? (
          <Card className="space-y-2 max-w-xl">
            <Input label="Domain" placeholder="print.yourshop.ng" value={domain} onChange={(e) => setDomain(e.target.value)} />
            <Button size="sm" disabled={!valid} loading={isPending("add")} onClick={add}>
              Add domain
            </Button>
          </Card>
        ) : (
          <Notice tone="info">Only owners and admins can add domains.</Notice>
        )}
      </Section>
      {dns ? (
        <Section title={`DNS records for ${dns.domain}`} description="Add these at your domain registrar, then press Check DNS.">
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left editorial-label">
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dns.records.txt ? <Record type="TXT" {...dns.records.txt} /> : null}
                {dns.records.cname ? <Record type="CNAME" {...dns.records.cname} /> : null}
              </tbody>
            </table>
          </Card>
        </Section>
      ) : null}
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-32" />
      ) : (
        <DataTable<Domain>
          rows={q.data?.data ?? []}
          rowKey={(d) => d.id}
          empty="No custom domains."
          columns={[
            { label: "Domain", cell: (d) => <span className="pl-mono font-semibold">{d.domain}</span> },
            {
              label: "Status",
              cell: (d) => (
                <div>
                  <Pill tone={d.status === "verified" ? "sage" : d.status === "failed" ? "persimmon" : "ochre"}>{d.status}</Pill>
                  {d.lastCheckError ? <div className="text-xs text-fog mt-1">{d.lastCheckError}</div> : null}
                </div>
              ),
            },
            { label: "Last checked", hideOnMobile: true, cell: (d) => (d.lastCheckedAt ? formatDateTime(d.lastCheckedAt) : "Never") },
            {
              label: "",
              align: "right",
              cell: (d) =>
                manage ? (
                  <div className="flex justify-end gap-3">
                    {d.status !== "verified" ? (
                      <Button size="sm" variant="ghost" loading={isPending(`verify-${d.id}`)} onClick={() => void verify(d)}>
                        Check DNS
                      </Button>
                    ) : null}
                    <button type="button" className="text-xs pl-link" onClick={() => setRemoving(d)}>
                      Remove
                    </button>
                  </div>
                ) : null,
            },
          ]}
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.domain ?? ""}?`}
        description="Students using this address will stop reaching your shop. Your PrintLoop link keeps working."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await run("remove", () => unwrap(client.DELETE("/saas/me/domains/{id}", { params: { path: { id: removing.id } } })), {
            success: "Domain removed.",
            invalidate: ["/saas/me/domains"],
            rethrow: true,
          });
          setRemoving(null);
        }}
      />
    </div>
  );
}
