"use client";

import { Card, ErrorState, KeyValue, Notice, PageHeader, Section, Skeleton, StatCard, formatNumber } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";

export function ReliabilityView() {
  const $api = useApi();
  const q = $api.useQuery("get", "/platform/reliability", {}, { refetchInterval: 30_000 });
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading || !q.data?.data) return <Skeleton className="h-96" />;
  const { agentUptime: u, jobSuccessRate: j, paidUnredeemed: p } = q.data.data;

  return (
    <div className="space-y-8">
      <PageHeader kicker="System" title="Reliability" description="Are kiosks reachable, are jobs finishing, is anyone paid and waiting? Refreshes every 30 seconds." />
      {u.onlineRatePct < 80 && u.totalActiveKiosks > 0 ? (
        <Notice tone="warn" title="Kiosks are dropping offline">
          Only {u.onlineRatePct.toFixed(0)}% of active kiosks checked in recently. Look at the kiosk fleet for the shops affected.
        </Notice>
      ) : null}
      {j.failureRatePct > 5 ? (
        <Notice tone="danger" title="Failure rate is high">
          {j.failureRatePct.toFixed(1)}% of finished jobs failed.
        </Notice>
      ) : null}

      <Section title="Kiosks">
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          <StatCard label="Active kiosks" value={u.totalActiveKiosks} />
          <StatCard label="Online now" value={u.onlineKiosksCount} tone="dark" />
          <StatCard label="Online rate" value={`${u.onlineRatePct.toFixed(0)}%`} />
        </div>
      </Section>

      <Section title="Jobs" description="Every job that has finished, all time.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Completed" value={formatNumber(j.completedJobsCount)} />
          <StatCard label="Failed" value={formatNumber(j.failedJobsCount)} />
          <StatCard label="Success rate" value={`${j.successRatePct.toFixed(1)}%`} tone="dark" />
          <StatCard label="Failure rate" value={`${j.failureRatePct.toFixed(1)}%`} />
        </div>
      </Section>

      <Section title="Paid but not printed" description="Customers who have paid and are waiting. A growing number means something is stuck.">
        <Card className="max-w-md">
          <KeyValue
            items={[
              ["Rendering", p.renderingCount],
              ["Ready for release", p.readyCount],
              ["Releasing to a kiosk", p.releasingCount],
              ["Printing", p.printingCount],
              [<strong key="t">Total</strong>, <strong key="n">{p.totalPaidUnredeemed}</strong>],
            ]}
          />
        </Card>
      </Section>
    </div>
  );
}
