"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const astraField =
  "w-full rounded-xl border border-[var(--astra-border)] bg-[var(--astra-bg)] px-3 py-2.5 text-sm";

export function SupportForm({
  tone = "default",
}: {
  tone?: "default" | "astra";
}) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const astra = tone === "astra";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Talep gönderilemedi.");
        return;
      }
      toast.success("Talebin alındı.");
      setSubject("");
      setMessage("");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor="support-subject">Konu</Label>
        {astra ? (
          <input
            id="support-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
            minLength={3}
            maxLength={150}
            className={astraField}
          />
        ) : (
          <Input
            id="support-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
            minLength={3}
            maxLength={150}
          />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="support-message">Mesaj</Label>
        {astra ? (
          <textarea
            id="support-message"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            minLength={10}
            className={cn(astraField, "min-h-[8rem]")}
          />
        ) : (
          <Textarea
            id="support-message"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            minLength={10}
          />
        )}
      </div>
      {astra ? (
        <button
          type="submit"
          disabled={loading}
          className="astra-btn-primary w-full rounded-full py-3 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? "Gönderiliyor…" : "Gönder"}
        </button>
      ) : (
        <Button type="submit" disabled={loading}>
          {loading ? "Gönderiliyor…" : "Gönder"}
        </Button>
      )}
    </form>
  );
}
