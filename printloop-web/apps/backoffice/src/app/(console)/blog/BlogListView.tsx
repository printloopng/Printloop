"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { DataTable, ErrorState, PageHeader, Pill, Skeleton, formatDate } from "@printloop/ui";
import { errorMessage, type Schemas } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";

type Post = Schemas["BlogPost"];

export function BlogListView() {
  const $api = useApi();
  const router = useRouter();
  const q = $api.useQuery("get", "/platform/blog");
  return (
    <div>
      <PageHeader
        kicker="Content"
        title="Blog"
        description="Posts shown on the public PrintLoop blog. Drafts stay private."
        actions={
          <Link href="/blog/new" className="pl-btn-primary pl-btn-sm inline-flex items-center gap-1.5">
            <Plus size={14} /> New post
          </Link>
        }
      />
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable<Post>
          rows={q.data?.data ?? []}
          rowKey={(p) => p.id}
          onRowClick={(p) => router.push(`/blog/${p.id}`)}
          empty="No posts yet."
          columns={[
            {
              label: "Post",
              cell: (p) => (
                <div>
                  <div className="font-semibold">{p.title}</div>
                  <div className="pl-mono text-[11px] text-fog">/blog/{p.slug}</div>
                </div>
              ),
            },
            { label: "Status", cell: (p) => <Pill tone={p.status === "published" ? "sage" : "ochre"}>{p.status}</Pill> },
            { label: "Author", hideOnMobile: true, cell: (p) => p.authorName ?? "—" },
            { label: "Updated", hideOnMobile: true, cell: (p) => (p.updatedAt ? formatDate(p.updatedAt) : "—") },
          ]}
        />
      )}
    </div>
  );
}
