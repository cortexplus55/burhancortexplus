"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type Solution = {
  problem: string;
  steps: string[];
  answer: string;
  tip?: string;
};

export function ImageSolver({ creditCost }: { creditCost: number | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [solution, setSolution] = useState<Solution | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error("Yalnızca JPG, PNG veya WEBP yükleyebilirsin.");
      return;
    }

    setLoading(true);
    setSolution(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (note) form.append("note", note);

      const res = await fetch("/api/ai/solve-image", { method: "POST", body: form });

      if (res.status === 402) {
        setPaywall(true);
        return;
      }

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Çözüm üretilemedi.");
        return;
      }

      setSolution(payload as Solution);
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
          <Label htmlFor="question-image">Soru görseli</Label>
          <Input
            id="question-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="question-note">Eklemek istediğin not (opsiyonel)</Label>
          <Textarea
            id="question-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Örn. B şıkkında takıldım"
          />
        </div>

        {creditCost !== null ? (
          <p className="text-xs text-muted-foreground">
            Bu işlem {creditCost} kredi kullanır ve gelişmiş modelle çalışır.
          </p>
        ) : null}

        <Button type="submit" disabled={!file || loading}>
          {loading ? "Çözülüyor…" : "Çöz"}
        </Button>
      </form>

      {solution ? (
        <div className="mt-6 space-y-3 rounded-lg border p-4">
          <p className="font-medium">{solution.problem}</p>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {solution.steps.map((step, index) => (
              <li key={index}>
                <Markdown content={step} />
              </li>
            ))}
          </ol>
          <p className="rounded-md bg-accent/50 p-3 text-sm">
            <strong>Sonuç:</strong> {solution.answer}
          </p>
          {solution.tip ? (
            <p className="text-sm text-muted-foreground">İpucu: {solution.tip}</p>
          ) : null}
        </div>
      ) : null}

      <UpgradeSheet
        open={paywall}
        onOpenChange={setPaywall}
        message="Görselden soru çözümü için yeterli kredin kalmadı."
        returnPath="/soru-coz"
      />
    </>
  );
}
