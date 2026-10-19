"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Araçların ortak kurulumu (19 Ekim 2026). Canlıda her aracı ayrı belgeyle denedik ve şunları
 * gördük: kart ve podcast belge seçtirmiyordu (yalnız belge sayfasındaki bağlantıyla), Doğru/Yanlış
 * ve sözlü hiç belge almıyordu, sayı ya da süre seçilemiyordu, yeni belge Araçlar'dan
 * yüklenemiyordu ve belge seçilince örnek konular belgeyle ilgisizdi. Bunların hepsi burada.
 */

export type StudioDocument = { id: string; fileName: string; topics: string[] };
export type StudioSourceMode = "topic" | "document";

/** Belge seçiliyken ilk öneri: belgenin tamamı. Sunucu bu ifadeyi tanır (`isWholeDocumentRequest`). */
export const WHOLE_DOCUMENT_TOPIC = "Belgenin tamamı";

/** Belge seçiliyse önerilen konular: tamamı + belgenin kendi konuları. */
export function documentSuggestions(document: StudioDocument | null | undefined): string[] | undefined {
  if (!document) return undefined;
  return [WHOLE_DOCUMENT_TOPIC, ...document.topics.slice(0, 5)];
}

export function StudioSourcePicker({
  documents,
  mode,
  onModeChange,
  documentId,
  onDocumentChange,
  idPrefix,
}: {
  documents: StudioDocument[];
  mode: StudioSourceMode;
  onModeChange: (mode: StudioSourceMode) => void;
  documentId: string | null;
  onDocumentChange: (id: string | null) => void;
  idPrefix: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pendingNew = documentId && !documents.some((doc) => doc.id === documentId);

  async function upload(file: File) {
    setBusy("Yükleniyor…");
    try {
      const { uploadDocumentFile } = await import("@/lib/documents/upload-client");
      const { documentId: id } = await uploadDocumentFile(file);
      onModeChange("document");
      onDocumentChange(id);
      setBusy("Belgen okunuyor, konuları çıkarılıyor…");
      const { postDocumentProcess, requestDocumentProcessing } = await import("@/lib/documents/process-session");
      const result = await requestDocumentProcessing({ documentId: id, post: postDocumentProcess });
      if (!result.ok) {
        const message = typeof result.body?.error === "string" ? result.body.error : "Belge bu sefer işlenemedi; yeniden dene.";
        throw new Error(message);
      }
      toast.success("Belgen hazır.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Belge yüklenemedi.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ls-setup-block">
      <div className="ls-seg" role="group" aria-label="Kaynak">
        <button type="button" aria-pressed={mode === "topic"} onClick={() => onModeChange("topic")}>
          Konu yaz
        </button>
        <button type="button" aria-pressed={mode === "document"} onClick={() => onModeChange("document")}>
          Belgemden
        </button>
      </div>
      {mode === "document" ? (
        <div className="ls-setup-doc">
          {documents.length ? (
            <>
              <label className="sr-only" htmlFor={`${idPrefix}-document`}>
                Belge
              </label>
              <select
                id={`${idPrefix}-document`}
                className="ls-select"
                value={documentId ?? ""}
                onChange={(event) => onDocumentChange(event.target.value || null)}
                disabled={Boolean(busy)}
              >
                {pendingNew ? <option value={documentId}>Yeni belge hazırlanıyor…</option> : null}
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.fileName}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="ls-setup-note">Henüz hazır bir belgen yok. Ders notunu buradan yükleyebilirsin.</p>
          )}
          <button
            type="button"
            className="ls-upload"
            onClick={() => fileRef.current?.click()}
            disabled={Boolean(busy)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
            {busy ?? "Yeni belge yükle"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.pptx,.docx,application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function StudioChoices<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="ls-setup-block">
      <p className="ls-setup-label">{label}</p>
      <div className="ls-seg" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Belge kaynağının durumu ve kullanılan kapsam, üretimden sonra tek satır. */
export function sourceNotice(source?: { kind?: string; wholeDocument?: boolean; matched?: boolean; fileName?: string | null }): string | null {
  if (!source || source.kind !== "document") return null;
  if (source.matched === false) return "Yazdığın konuyu belgede bulamadım; belgenin tamamından hazırladım.";
  if (source.wholeDocument) return "Belgenin tamamından hazırlandı.";
  return null;
}

export function StudioSetup({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("ls-setup", className)}>{children}</div>;
}
