"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { CreditGate } from "@/components/paywall/credit-gate";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type Solution = {
  problem: string;
  steps: string[];
  answer: string;
  tip?: string;
  similar?: string;
};

const ERROR_LABELS: Record<string, string> = {
  unreadable:
    "Fotoğrafın bir kısmı okunmuyor. Daha net, iyi aydınlatılmış bir fotoğraf çek.",
  blurry:
    "Fotoğraf bulanık görünüyor. Sabit tutup daha net bir kare çek.",
  low_quality:
    "Görüntü kalitesi yeterli değil. Daha net bir fotoğraf dene.",
  invalid_input: "Geçerli bir görsel seç.",
  moderation: "Bu görsel işlenemedi. Farklı bir soru fotoğrafı dene.",
};

export function ImageSolver({ creditCost }: { creditCost: number | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [solution, setSolution] = useState<Solution | null>(null);

  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error("Yalnızca JPG, PNG veya WEBP yükleyebilirsin.");
      return;
    }
    if (file.size < 8_000) {
      toast.error(
        "Fotoğraf çok küçük veya kalitesiz görünüyor. Daha net bir kare çek.",
      );
      return;
    }

    setLoading(true);
    setSolution(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (note) form.append("note", note);

      const res = await fetch("/api/ai/solve-image", {
        method: "POST",
        body: form,
      });

      if (res.status === 402) {
        setPaywall(true);
        return;
      }

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = typeof payload.error === "string" ? payload.error : "";
        toast.error(
          ERROR_LABELS[code] ??
            payload.message ??
            "Çözüm üretilemedi. Kredin düşmedi. Tekrar deneyebilirsin.",
        );
        return;
      }

      if (payload.unreadable || payload.code === "unreadable") {
        toast.error(ERROR_LABELS.unreadable);
        return;
      }

      setSolution(payload as Solution);
    } catch {
      toast.error("Bağlantı hatası. Kredin düşmedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="mx-auto max-w-xl space-y-4 px-1">
        <div className="space-y-2">
          <Label>Soru görseli</Label>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-black">
              Fotoğraf çek
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setSolution(null);
                }}
              />
            </label>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-[var(--cs-text)]">
              Galeriden seç
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setSolution(null);
                }}
              />
            </label>
          </div>
          {previewUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Seçilen soru önizlemesi"
                className="max-h-64 w-full object-contain bg-black/30"
              />
              <button
                type="button"
                className="absolute right-2 top-2 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-semibold text-white"
                onClick={() => {
                  setFile(null);
                  setSolution(null);
                }}
              >
                Değiştir
              </button>
            </div>
          ) : (
            <p className="text-xs text-[var(--cs-muted)]">
              Net, iyi aydınlatılmış bir soru fotoğrafı yükle.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="question-note">Eklemek istediğin not (opsiyonel)</Label>
          <Textarea
            id="question-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Örn. 8. sınıf, üslü sayılar"
          />
        </div>

        <Button
          type="submit"
          disabled={!file || loading}
          className="min-h-[48px] w-full rounded-xl bg-amber-500 font-bold text-black hover:bg-amber-400"
        >
          {loading ? "Çözülüyor…" : "Çöz"}
          {creditCost != null ? ` · ${creditCost} kredi` : ""}
        </Button>
      </form>

      {solution ? (
        <div className="mx-auto mt-6 max-w-xl space-y-4 rounded-2xl border border-white/10 p-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--cs-muted)]">
              Sorunun okunmuş hâli
            </p>
            <Markdown content={solution.problem} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--cs-muted)]">
              Adım adım çözüm
            </p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-[var(--cs-text)]">
              {solution.steps.map((step, i) => (
                <li key={i}>
                  <Markdown content={step} />
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--cs-muted)]">
              Sonuç
            </p>
            <p className="mt-1 text-base font-semibold text-[var(--cs-text)]">
              {solution.answer}
            </p>
          </div>
          {solution.tip || solution.similar ? (
            <p className="text-sm text-[var(--cs-muted)]">
              {solution.tip ?? solution.similar}
            </p>
          ) : null}
        </div>
      ) : null}

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Fotoğraftan çözüm için kredin veya ücretsiz hakkın bitti."
        returnPath="/soru-coz"
      />
    </>
  );
}
