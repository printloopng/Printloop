"use client";

import { useState } from "react";
import { Button, Input, Notice, Textarea } from "@printloop/ui";

export function ContactForm({ email }: { email: string }) {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !/^\S+@\S+\.\S+$/.test(form.email.trim()) || form.message.trim().length < 5) {
      setError("Fill in your name, a valid email and a message. We can't reply to half a message.");
      return;
    }
    setError(null);
    const subject = encodeURIComponent(`PrintLoop message from ${form.name.trim()}`);
    const body = encodeURIComponent(`${form.message.trim()}\n\n${form.name.trim()} (${form.email.trim()})`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <form onSubmit={submit} noValidate className="border-4 border-ink bg-paper-light p-6 sm:p-8 space-y-1">
      <Input label="Your name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Amina Bello" />
      <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@university.edu.ng" />
      <Textarea label="Message" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="What's on your mind?" />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {sent ? <Notice tone="success">Opening your mail app. If nothing opens, email {email} directly.</Notice> : null}
      <div className="pt-2">
        <Button type="submit" arrow>
          Send message
        </Button>
      </div>
    </form>
  );
}
