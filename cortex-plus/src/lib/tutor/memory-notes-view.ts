/*
  "Öğretmenin seni nasıl tanıyor" (öğretmen v3, Ayarlar, 21 Kasım 2026, ürün sahibinin onayı): ekranın metinleri ve uç
  sözleşmesi tek yerde. Sunucuya bağlı değil (istemci de okur). Notları öğretmen yazar (`memory-notes.ts`); öğrenci
  burada görür, tek tek ya da hepsini siler.
*/

export const TUTOR_MEMORY_ENDPOINT = "/api/teacher/memory-notes";

export type TutorMemoryNoteKind = "stuck" | "preference" | "strength";

export type TutorMemoryNoteView = { id: string; note: string; kind: TutorMemoryNoteKind; createdAt: string | null };

export const TUTOR_NOTE_KIND_LABEL: Record<TutorMemoryNoteKind, string> = {
  stuck: "Takıldığın nokta",
  preference: "Sevdiğin anlatım",
  strength: "Güçlendiğin yer",
};

export const TUTOR_MEMORY_COPY = {
  title: "Öğretmenin seni nasıl tanıyor",
  description:
    "Öğretmenin, sohbetlerinden bir sonraki derse yarayacak kısa öğrenme notları alır: takıldığın kural, sevdiğin " +
    "anlatım, güçlendiğin yer. İstediğin notu silebilirsin.",
  emptyTitle: "Öğretmenin henüz bir not almadı",
  emptyText:
    "Sohbet ettikçe öğretmenin, takıldığın noktaları ve sevdiğin anlatımı kısa notlar olarak buraya yazar. Ad, aile, " +
    "sağlık ya da iletişim gibi kişisel bilgiler not edilmez.",
  loadError: "Notlar şu an yüklenemedi.",
  retry: "Tekrar dene",
  deleteOne: "Bu notu sil",
  deleteAll: "Hepsini sil",
  confirmTitle: "Bütün notlar silinsin mi?",
  confirmText:
    "Öğretmenin seninle ilgili aldığı bütün notlar silinir; bu geri alınamaz. Sohbetlerin ve çalışma kayıtların yerinde kalır.",
  confirmLabel: "Hepsini sil",
  pendingLabel: "Siliniyor…",
  deletedOne: "Not silindi.",
  deletedAll: "Bütün notlar silindi.",
  deleteFailed: "Silinemedi. Bir daha dene.",
} as const;

const KINDS = new Set<string>(["stuck", "preference", "strength"]);

/** Uç cevabındaki notları güvenle okur (biçimi tutmayan satır düşer). */
export function parseTutorMemoryNotes(raw: unknown): TutorMemoryNoteView[] {
  const list = Array.isArray((raw as { notes?: unknown } | null)?.notes) ? (raw as { notes: unknown[] }).notes : [];
  const out: TutorMemoryNoteView[] = [];
  for (const item of list) {
    const row = (item ?? {}) as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const note = typeof row.note === "string" ? row.note.trim() : "";
    if (!id || !note) continue;
    out.push({
      id,
      note,
      kind: KINDS.has(String(row.kind)) ? (row.kind as TutorMemoryNoteKind) : "stuck",
      createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
    });
  }
  return out;
}
