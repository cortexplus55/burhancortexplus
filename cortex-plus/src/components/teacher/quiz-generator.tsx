"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";

export function TeacherQuizGenerator({
  creditCost,
  locked,
  lockedMessage,
}: {
  creditCost: number | null;
  locked: boolean;
  lockedMessage: string;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked) {
      toast.error(lockedMessage);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/learning/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });

      if (res.status === 402) {
        setPaywall(true);
        return;
      }

      if (res.status === 403) {
        toast.error(lockedMessage);
        return;
      }

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Quiz üretilemedi.");
        return;
      }

      toast.success("Quiz oluşturuldu.");
      setTopic("");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <div className="space-y-2">
          <Label htmlFor="quiz-topic">Konu</Label>
          <Input
            id="quiz-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Örn. Newton yasaları"
            required
            minLength={3}
            disabled={locked}
          />
        </div>
        {creditCost !== null ? (
          <p className="text-xs text-[var(--astra-muted)]">
            {creditCost} kredi kullanılır.
          </p>
        ) : null}
        <Button type="submit" disabled={loading || locked || topic.trim().length < 3}>
          {locked ? "Plus veya doğrulama gerekli" : loading ? "Üretiliyor…" : "Quiz üret"}
        </Button>
      </form>
      <UpgradeSheet
        open={paywall}
        onOpenChange={setPaywall}
        message="Bu işlem için yeterli kredin kalmadı."
        returnPath="/ogretmen-paneli/quizler"
      />
    </>
  );
}
