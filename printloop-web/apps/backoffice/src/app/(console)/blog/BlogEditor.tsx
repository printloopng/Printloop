"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ConfirmDialog, Input, PageHeader, Prose, Segmented, Textarea } from "@printloop/ui";
import { unwrap, type Schemas } from "@printloop/api-client";
import { useApiClient } from "@printloop/api-client/react";
import { useAction } from "@/lib/actions";

type Post = Schemas["BlogPost"];
type Status = "draft" | "published";

export function BlogEditor({ post }: { post: Post | null }) {
  const client = useApiClient();
  const router = useRouter();
  const { run, isPending } = useAction();
  const [title, setTitle] = useState(post?.title ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [cover, setCover] = useState(post?.coverImageUrl ?? "");
  const [author, setAuthor] = useState(post?.authorName ?? "PrintLoop Team");
  const [tags, setTags] = useState((post?.tags ?? []).join(", "));
  const [status, setStatus] = useState<Status>(post?.status ?? "draft");
  const [view, setView] = useState<"write" | "preview">("write");
  const [deleting, setDeleting] = useState(false);
  const valid = title.trim().length > 2 && content.trim().length > 10;

  const save = async () => {
    const body = {
      title: title.trim(),
      excerpt: excerpt.trim() || null,
      content,
      coverImageUrl: cover.trim() || null,
      authorName: author.trim() || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10),
      status,
    };
    const saved = await run("save", () => unwrap(post ? client.PATCH("/platform/blog/{id}", { params: { path: { id: post.id } }, body }) : client.POST("/platform/blog", { body })), {
      success: status === "published" ? "Saved and live." : "Saved as a draft.",
      invalidate: ["/platform/blog"],
    });
    if (saved && !post) router.replace(`/blog/${saved.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={<Link href="/blog" className="pl-link">Blog</Link>}
        title={post ? "Edit post" : "New post"}
        description={post ? <span className="pl-mono text-xs">/blog/{post.slug}</span> : "Written in simple Markdown."}
        actions={
          <>
            {post ? (
              <Button size="sm" variant="ghost" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            ) : null}
            <Button size="sm" disabled={!valid} loading={isPending("save")} onClick={save}>
              {status === "published" ? "Save & publish" : "Save draft"}
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Input label="Title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          <Textarea label="Summary (shown in lists)" rows={2} maxLength={400} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="editorial-label">Body</span>
              <Segmented
                label="Editor view"
                value={view}
                onChange={setView}
                items={[
                  { value: "write", label: "Write" },
                  { value: "preview", label: "Preview" },
                ]}
              />
            </div>
            {view === "write" ? (
              <textarea
                aria-label="Body"
                rows={22}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="pl-input pl-mono text-sm leading-relaxed"
                placeholder={"## A heading\n\nA paragraph with **bold**, *italic* and a [link](https://printloop.app).\n\n- a list item"}
              />
            ) : (
              <Card className="min-h-[24rem]">{content.trim() ? <Prose markdown={content} /> : <p className="text-fog text-sm">Nothing to preview yet.</p>}</Card>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="editorial-label">Visibility</div>
            <Segmented
              label="Status"
              value={status}
              onChange={setStatus}
              items={[
                { value: "draft", label: "Draft" },
                { value: "published", label: "Published" },
              ]}
            />
            <p className="text-xs text-fog">{status === "published" ? "Visible on the public blog as soon as you save." : "Only staff can see drafts."}</p>
          </Card>
          <Card className="space-y-1">
            <Input label="Author" value={author} onChange={(e) => setAuthor(e.target.value)} />
            <Input label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} helper="Comma separated, up to 10" />
            <Input label="Cover image URL" value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://…" />
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this post?"
        description="It disappears from the public blog straight away. This can't be undone."
        confirmLabel="Delete post"
        destructive
        onConfirm={async () => {
          if (!post) return;
          await run("delete", () => unwrap(client.DELETE("/platform/blog/{id}", { params: { path: { id: post.id } } })), { success: "Post deleted.", invalidate: ["/platform/blog"], rethrow: true });
          router.replace("/blog");
        }}
      />
    </div>
  );
}
