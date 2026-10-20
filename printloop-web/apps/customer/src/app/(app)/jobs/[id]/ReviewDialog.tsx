"use client";

import { useState } from "react";
import { Camera, Star } from "lucide-react";
import { Button, Dialog, Notice, Textarea, cx, toast } from "@printloop/ui";
import { errorMessage, unwrap, uploadDirect } from "@printloop/api-client";
import { useApiClient, useApiContext } from "@printloop/api-client/react";

export function ReviewDialog({
  slug,
  shopName,
  open,
  onOpenChange,
}: {
  slug: string;
  shopName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const client = useApiClient();
  const { apiOrigin } = useApiContext();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!rating) return setError("Pick a star rating.");
    setBusy(true);
    setError(null);
    try {
      let photoUrl: string | undefined;
      if (photo) {
        const form = new FormData();
        form.append("file", photo, photo.name);
        const stored = await uploadDirect<{ fileURL: string }>({ purpose: "review-photo", path: "/uploads/review-photo", form, apiOrigin });
        photoUrl = stored.fileURL;
      }
      await unwrap(
        client.POST("/customer/shops/{slug}/reviews", {
          params: { path: { slug } },
          body: { rating, comment: comment.trim() || undefined, photoUrl },
        }),
      );
      toast.success("Thanks! Your review is live.");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Review ${shopName}`}
      description="Help other students pick a good shop."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button size="sm" loading={busy} onClick={submit}>
            Post review
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      <div role="radiogroup" aria-label="Rating" className="flex gap-1 mb-4">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => setRating(n)}>
            <Star size={30} className={cx(n <= rating ? "text-ochre" : "text-ink/20")} fill={n <= rating ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <Textarea label="Comment (optional)" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
      <label className="pl-btn-ghost pl-btn-sm cursor-pointer">
        <Camera size={14} /> {photo ? photo.name : "Add a photo"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && f.size > 10 * 1024 * 1024) return toast.error("Photos must be under 10 MB.");
            setPhoto(f ?? null);
          }}
        />
      </label>
    </Dialog>
  );
}
