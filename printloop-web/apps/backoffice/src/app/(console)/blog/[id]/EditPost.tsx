"use client";

import { ErrorState, Skeleton } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";
import { BlogEditor } from "../BlogEditor";

export function EditPost({ id }: { id: string }) {
  const $api = useApi();
  const q = $api.useQuery("get", "/platform/blog");
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) return <Skeleton className="h-96" />;
  const post = (q.data?.data ?? []).find((p) => p.id === id);
  if (!post) return <ErrorState message="That post doesn't exist any more." />;
  return <BlogEditor key={post.updatedAt} post={post} />;
}
