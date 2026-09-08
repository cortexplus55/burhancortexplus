"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type TopicRow = {
  id: string;
  title: string;
  learningObjective: string | null;
  studentNotes: string | null;
  pageNumbers: number[];
  isStudentEdited: boolean;
};

type Coverage = {
  status: string;
  summary: string;
  contentPages: number;
  coveredPages: number;
  skippedPages: { pageNumber: number; kind: string; reason: string }[];
  unreadablePages: { pageNumber: number; reason: string }[];
  uncoveredContentPages: { pageNumber: number; reason: string }[];
};

type Props = {
  documentId: string;
  initialTopics: TopicRow[];
  initialBoundary: "documents_only" | "allow_supporting";
  initialStatus: string;
  coverage: Coverage | null;
};

export function TopicMapEditor({
  documentId,
  initialTopics,
  initialBoundary,
  initialStatus,
  coverage,
}: Props) {
  const router = useRouter();
  const [topics, setTopics] = useState(initialTopics);
  const [boundary, setBoundary] = useState(initialBoundary);
  const [pending, startTransition] = useTransition();

  const dirty = useMemo(() => {
    if (boundary !== initialBoundary) return true;
    if (topics.length !== initialTopics.length) return true;
    return topics.some((topic, index) => {
      const base = initialTopics[index];
      if (!base || base.id !== topic.id) return true;
      return (
        topic.title !== base.title ||
        (topic.learningObjective ?? "") !== (base.learningObjective ?? "") ||
        (topic.studentNotes ?? "") !== (base.studentNotes ?? "")
      );
    });
  }, [boundary, initialBoundary, topics, initialTopics]);

  function updateTopic(id: string, patch: Partial<TopicRow>) {
    setTopics((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removeTopic(id: string) {
    setTopics((rows) => rows.filter((row) => row.id !== id));
  }

  function save(markReviewed: boolean) {
    startTransition(async () => {
      const deletedIds = initialTopics
        .filter((base) => !topics.some((topic) => topic.id === base.id))
        .map((base) => ({ id: base.id, delete: true as const }));

      const edited = topics.map((topic) => {
        const base = initialTopics.find((row) => row.id === topic.id);
        return {
          id: topic.id,
          title: topic.title,
          learningObjective: topic.learningObjective,
          studentNotes: topic.studentNotes,
          ...(base &&
          topic.title === base.title &&
          (topic.learningObjective ?? "") === (base.learningObjective ?? "") &&
          (topic.studentNotes ?? "") === (base.studentNotes ?? "")
            ? {}
            : {}),
        };
      });

      const response = await fetch(
        `/api/documents/${documentId}/topic-map`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceBoundaryMode: boundary,
            topics: [...edited, ...deletedIds],
            markReviewed,
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(
          result.error === "feature_disabled"
            ? "PDF öğrenme v2 kapalı."
            : "Konu haritası kaydedilemedi.",
        );
        return;
      }
      toast.success(markReviewed ? "Harita onaylandı." : "Değişiklikler kaydedildi.");
      router.refresh();
    });
  }

  function rebuild() {
    startTransition(async () => {
      const response = await fetch(
        `/api/documents/${documentId}/topic-map`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rebuild" }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(result.error ?? "Yeniden oluşturulamadı.");
        return;
      }
      toast.success("Konu haritası yenilendi.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {coverage ? (
        <section className="astra-pay-card space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--astra-text)]">
              Kapsam raporu
            </h2>
            <span className="text-xs text-[var(--astra-muted)]">
              {coverage.coveredPages}/{coverage.contentPages} içerik sayfası ·{" "}
              {coverage.status}
            </span>
          </div>
          <p className="text-sm text-[var(--astra-text)]">{coverage.summary}</p>
          {coverage.unreadablePages.length ? (
            <ul className="space-y-1 text-xs text-red-300">
              {coverage.unreadablePages.map((page) => (
                <li key={`u-${page.pageNumber}`}>
                  Sayfa {page.pageNumber}: {page.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {coverage.uncoveredContentPages.length ? (
            <ul className="space-y-1 text-xs text-amber-200">
              {coverage.uncoveredContentPages.map((page) => (
                <li key={`c-${page.pageNumber}`}>
                  Sayfa {page.pageNumber}: {page.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {coverage.skippedPages.length ? (
            <ul className="space-y-1 text-xs text-[var(--astra-muted)]">
              {coverage.skippedPages.map((page) => (
                <li key={`s-${page.pageNumber}`}>
                  Sayfa {page.pageNumber} ({page.kind}): {page.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-[var(--astra-muted)]">
          Henüz kapsam raporu yok. Aşağıdan yeniden oluşturabilirsiniz.
        </p>
      )}

      <section className="astra-pay-card space-y-3 px-4 py-4">
        <h2 className="text-sm font-semibold text-[var(--astra-text)]">
          Kaynak sınırı
        </h2>
        <label className="flex items-start gap-2 text-sm text-[var(--astra-text)]">
          <input
            type="radio"
            name="boundary"
            checked={boundary === "documents_only"}
            onChange={() => setBoundary("documents_only")}
            className="mt-1"
          />
          <span>
            Yalnızca bu belge — pratik soru üretilebilir; belgede olmayan yeni
            bilgi alanı eklenmez. Okunamayan yerler açıkça belirtilir.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-[var(--astra-text)]">
          <input
            type="radio"
            name="boundary"
            checked={boundary === "allow_supporting"}
            onChange={() => setBoundary("allow_supporting")}
            className="mt-1"
          />
          <span>
            Destekleyici kaynaklara izin ver — ek bilgi ayrı etiketlenir (Aşama
            3+ üretimde kullanılacak).
          </span>
        </label>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--astra-text)]">
            Konu haritası ({topics.length})
          </h2>
          <p className="text-xs text-[var(--astra-muted)]">Durum: {initialStatus}</p>
        </div>

        {topics.map((topic) => (
          <article
            key={topic.id}
            className="astra-pay-card space-y-2 px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                value={topic.title}
                onChange={(event) =>
                  updateTopic(topic.id, { title: event.target.value })
                }
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-[var(--astra-text)]"
              />
              <button
                type="button"
                onClick={() => removeTopic(topic.id)}
                className="text-xs text-red-300 underline"
              >
                Sil
              </button>
            </div>
            <p className="text-[11px] text-[var(--astra-muted)]">
              Sayfalar:{" "}
              {topic.pageNumbers.length
                ? topic.pageNumbers.join(", ")
                : "bağlı sayfa yok"}
              {topic.isStudentEdited ? " · düzenlendi" : ""}
            </p>
            <textarea
              value={topic.learningObjective ?? ""}
              onChange={(event) =>
                updateTopic(topic.id, {
                  learningObjective: event.target.value || null,
                })
              }
              placeholder="Öğrenme hedefi"
              rows={2}
              className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-[var(--astra-text)]"
            />
            <textarea
              value={topic.studentNotes ?? ""}
              onChange={(event) =>
                updateTopic(topic.id, {
                  studentNotes: event.target.value || null,
                })
              }
              placeholder="Kendi notun (isteğe bağlı)"
              rows={2}
              className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-[var(--astra-text)]"
            />
          </article>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => save(false)}
          className="rounded-full bg-[var(--astra-primary)] px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => save(true)}
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-[var(--astra-text)] disabled:opacity-50"
        >
          Gözden geçirdim
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={rebuild}
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-[var(--astra-text)] disabled:opacity-50"
        >
          Haritayı yeniden oluştur
        </button>
      </div>
    </div>
  );
}
