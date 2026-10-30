"use client";

import { useState } from "react";

/**
 * Belge kümesi notu (Paket I, 30 Ekim 2026): aynı belgenin iki sürümü ve ilgisiz görünen belge.
 * Kurulumda bir kez, materyal adımından çıkarken gösterilir. Sürümde öğrenci hangisini kullanacağını
 * seçer ("İkisini de kullan" dahil); ilgisiz belge varsayılan olarak haritaya girmez, "Yine de dahil et"
 * ile girer. Karar yalnız bu kurulumun belge listesini değiştirir; dosya Belgelerim'de kalır.
 */
export type MaterialVersionNote = { currentId: string; olderId: string; identical: boolean; message: string };
export type MaterialUnrelatedNote = { documentId: string; message: string };
export type MaterialNotes = { versions: MaterialVersionNote[]; unrelated: MaterialUnrelatedNote[] };

type VersionChoice = "current" | "older" | "both";

/** Notun anahtarı: aynı not aynı kurulumda ikinci kez sorulmaz. */
export function materialNoteKeys(notes: MaterialNotes): string[] {
  return [
    ...notes.versions.map((note) => `v:${[note.currentId, note.olderId].sort().join("|")}`),
    ...notes.unrelated.map((note) => `u:${note.documentId}`),
  ];
}

/** Sunucunun cevabından, listede hâlâ duran ve daha önce sorulmamış notlar. */
export function freshMaterialNotes(raw: unknown, ids: readonly string[], seen: readonly string[]): MaterialNotes {
  const row = raw && typeof raw === "object" ? (raw as { versions?: unknown; unrelated?: unknown }) : {};
  const has = new Set(ids);
  const versions = (Array.isArray(row.versions) ? row.versions : []).flatMap((item: unknown) => {
    const note = item as Partial<MaterialVersionNote> | null;
    if (!note || typeof note.currentId !== "string" || typeof note.olderId !== "string" || typeof note.message !== "string") return [];
    if (!has.has(note.currentId) || !has.has(note.olderId)) return [];
    return [{ currentId: note.currentId, olderId: note.olderId, identical: note.identical === true, message: note.message }];
  });
  const unrelated = (Array.isArray(row.unrelated) ? row.unrelated : []).flatMap((item: unknown) => {
    const note = item as Partial<MaterialUnrelatedNote> | null;
    if (!note || typeof note.documentId !== "string" || typeof note.message !== "string") return [];
    if (!has.has(note.documentId)) return [];
    return [{ documentId: note.documentId, message: note.message }];
  });
  const fresh: MaterialNotes = { versions, unrelated };
  const keys = new Set(seen);
  return {
    versions: fresh.versions.filter((note) => !keys.has(materialNoteKeys({ versions: [note], unrelated: [] })[0]!)),
    unrelated: fresh.unrelated.filter((note) => !keys.has(`u:${note.documentId}`)),
  };
}

/** Seçimlerden kurulumdan çıkacak belgeler. */
export function droppedByChoices(
  notes: MaterialNotes,
  choices: readonly VersionChoice[],
  include: readonly string[],
): string[] {
  const drop = new Set<string>();
  notes.versions.forEach((note, index) => {
    const choice = choices[index] ?? "current";
    if (choice === "current") drop.add(note.olderId);
    if (choice === "older") drop.add(note.currentId);
  });
  for (const note of notes.unrelated) if (!include.includes(note.documentId)) drop.add(note.documentId);
  return [...drop];
}

export function MaterialNotesCard({
  notes,
  nameOf,
  onApply,
}: {
  notes: MaterialNotes;
  nameOf: (documentId: string) => string;
  onApply: (dropIds: string[]) => void;
}) {
  const [choices, setChoices] = useState<VersionChoice[]>(() => notes.versions.map(() => "current"));
  const [include, setInclude] = useState<string[]>([]);
  const choose = (index: number, choice: VersionChoice) =>
    setChoices((current) => current.map((item, i) => (i === index ? choice : item)));

  return (
    <div
      className="apw-material-notes mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm"
      role="group"
      aria-label="Belgelerin denetimi"
    >
      {notes.versions.map((note, index) => (
        <div key={`${note.currentId}-${note.olderId}`} className="mb-3">
          <p>{note.message}</p>
          <div className="apw-import-row mt-2 flex flex-wrap gap-2">
            {(
              [
                ["current", `Yalnız ${nameOf(note.currentId)}`],
                ["older", `Yalnız ${nameOf(note.olderId)}`],
                ["both", "İkisini de kullan"],
              ] as const
            ).map(([choice, label]) => (
              <button
                key={choice}
                type="button"
                className="apw-drop-pick"
                aria-pressed={choices[index] === choice}
                onClick={() => choose(index, choice)}
              >
                {choices[index] === choice ? "✓ " : ""}
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {notes.unrelated.map((note) => {
        const included = include.includes(note.documentId);
        return (
          <div key={note.documentId} className="mb-3">
            <p>{note.message}</p>
            <button
              type="button"
              className="apw-drop-pick mt-2"
              aria-pressed={included}
              onClick={() =>
                setInclude((current) =>
                  included ? current.filter((id) => id !== note.documentId) : [...current, note.documentId],
                )
              }
            >
              {included ? "✓ Dahil edilecek" : "Yine de dahil et"}
            </button>
          </div>
        );
      })}
      <button type="button" className="apw-cta" onClick={() => onApply(droppedByChoices(notes, choices, include))}>
        Bu seçimle devam et
      </button>
    </div>
  );
}
