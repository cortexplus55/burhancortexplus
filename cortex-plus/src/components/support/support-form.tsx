"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SUPPORT_CATEGORIES, type SupportCategoryId } from "@/lib/support/categories";

const parityField =
  "w-full rounded-xl border border-[var(--cs-border)] bg-[var(--cs-bg)] px-3 py-2.5 text-sm";

const defaultField =
  "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Konu türüne göre ipucu: iade ve KVKK başvurusunda ne yazılacağını söyler. */
const CATEGORY_HINTS: Partial<Record<SupportCategoryId, string>> = {
  odeme: "Hangi ödeme olduğunu (tarih ya da tutar) ve iade nedenini kısaca yaz.",
  kvkk: "Ne istediğini açıkça yaz (ör. verilerimin bir kopyası, düzeltme, silme). En geç 30 gün içinde cevaplarız.",
};

export function SupportForm({
  tone = "default",
  defaultCategory = "genel",
}: {
  tone?: "default" | "parity";
  defaultCategory?: SupportCategoryId;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<SupportCategoryId>(defaultCategory);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const parity = tone === "parity";
  const hint = CATEGORY_HINTS[category];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, category }),
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
        <Label htmlFor="support-category">Konu türü</Label>
        <select
          id="support-category"
          value={category}
          onChange={(event) => setCategory(event.target.value as SupportCategoryId)}
          className={cn(parity ? parityField : defaultField, "min-h-11")}
        >
          {SUPPORT_CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="support-subject">Konu</Label>
        {parity ? (
          <input
            id="support-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
            minLength={3}
            maxLength={120}
            className={parityField}
          />
        ) : (
          <Input
            id="support-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
            minLength={3}
            maxLength={120}
          />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="support-message">Mesaj</Label>
        {parity ? (
          <textarea
            id="support-message"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            minLength={10}
            className={cn(parityField, "min-h-[8rem]")}
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
      {parity ? (
        <button
          type="submit"
          disabled={loading}
          className="cs-btn-primary w-full rounded-full py-3 text-sm font-semibold disabled:opacity-60"
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
