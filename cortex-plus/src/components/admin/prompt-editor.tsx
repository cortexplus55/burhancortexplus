"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePromptVersion } from "@/app/admin/actions";

/**
 * Talimat düzenleyici.
 *
 * Kutu, o an gerçekten yürürlükte olan metinle açılıyor — tabloda yayında bir
 * sürüm varsa o, yoksa koddaki varsayılan. Böylece yönetici "şu an ne
 * geçerli" sorusunu ekrandan okuyabiliyor; eskiden bunu görmenin hiçbir yolu
 * yoktu.
 */
export function PromptEditor({
  promptKey,
  current,
  isBuiltin,
}: {
  promptKey: string;
  current: string;
  isBuiltin: boolean;
}) {
  const [content, setContent] = useState(current);
  const [pending, startTransition] = useTransition();

  const degisti = content.trim() !== current.trim();
  const yeterli = content.trim().length >= 20;

  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        {isBuiltin
          ? "Şu an koddaki varsayılan geçerli. Kaydedersen bu metin yayına alınır."
          : "Şu an yayında olan metin."}
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={6}
          className="adm-input font-mono text-xs leading-relaxed"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          disabled={pending || !degisti || !yeterli}
          onClick={() =>
            startTransition(async () => {
              const result = await savePromptVersion({
                key: promptKey,
                content: content.trim(),
              });
              if (result.ok) toast.success(result.message ?? "Kaydedildi.");
              else toast.error(result.error ?? "Kaydedilemedi.");
            })
          }
        >
          {pending ? "Kaydediliyor…" : "Yeni sürüm olarak yayına al"}
        </button>

        {degisti ? (
          <button
            type="button"
            className="adm-btn"
            disabled={pending}
            onClick={() => setContent(current)}
          >
            Değişikliği geri al
          </button>
        ) : null}

        <span className="text-xs text-[var(--adm-muted)]">
          {content.trim().length} karakter
        </span>
      </div>
    </div>
  );
}
