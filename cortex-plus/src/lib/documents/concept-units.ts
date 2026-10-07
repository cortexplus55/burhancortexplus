import { isRunningHeader } from "@/lib/documents/clean-text";
import { isJunkTopicTitle } from "@/lib/documents/topic-title";
import { calmHeading } from "@/lib/learning/teacher-lesson";

/**
 * Kavram birimleri (2 Ekim 2026, ürün sahibinin kararı: "ana konu + içinde
 * dersler"). Ana konu 10–15'e toplandığından beri büyük konu ardışık derslere
 * bölünüyordu ama mekanik olarak: her ders 3 sayfa, kavramın ortasından
 * kesebiliyor, dersin adı yalnız "(2/5)". Burada luna her büyük konuyu
 * 2–6 sayfalık, kendi adı olan kavram birimlerine böler; çalışma planı her
 * birimi ayrı ders yapar. Model bölmesi geçersizse birim yazılmaz, plan
 * eski mekanik bölmeye döner.
 */

export type ConceptUnit = { title: string; pages: number[] };

/** Bu sayfa sayısına kadar konu tek derstir (planın mekanik eşiğiyle aynı). */
export const SINGLE_LESSON_MAX_PAGES = 4;
export const UNIT_MAX_PAGES = 6;

export function needsUnits(pages: number[]): boolean {
  return new Set(pages).size > SINGLE_LESSON_MAX_PAGES;
}

export const UNIT_SYSTEM =
  "Sen Cortex Plus'ın usta öğretmenisin. Bir ders belgesinin ana konularını, her biri tek derste öğretilecek KAVRAM " +
  "BİRİMLERİNE bölüyorsun.\n\n" +
  "KURALLAR:\n" +
  "- Her birim konunun ARDIŞIK 2-6 sayfasıdır ve tek bir kavram ailesini anlatır (ör. 'Yaptırım türleri', " +
  "'Hükümsüzlüğün dereceleri'). Bir kavramın ortasından kesme; yeni kavram başlayan sayfada yeni birim aç.\n" +
  "- Konunun bütün sayfaları sırayla birimlere dağılır; sayfa atlanmaz, iki birimde birden yer almaz. Tek sayfalık " +
  "birim yalnız konu başka türlü bölünemiyorsa.\n" +
  "- Birim adı içerikten, normal yazımla (BÜYÜK HARF değil), en fazla 7 kelime; sayfa kenarındaki kitap başlığı, test " +
  "sorusu kökü, 'Giriş', 'Özet', 'Test 1' birim adı değildir. Bir konudaki birimlerin adları birbirinden farklıdır ve " +
  "her biri o birimde anlatılan kavramı söyler; sayfalar ayırt edilebilir farklı kavramlar taşımıyorsa konuyu bölme " +
  "(units boş dizi).\n" +
  "- Test / soru sayfaları kendi başına birim olmaz; anlattıkları kavramın birimine katılır.\n\n" +
  'Yalnızca bu şemada JSON döndür: {"topics":[{"index":0,"units":[{"title":"…","pages":[5,6,7]}]}]}';

export type UnitTopicInput = {
  index: number;
  title: string;
  pages: { page: number; headings: string[]; lead: string }[];
};

export function unitUserPrompt(topics: UnitTopicInput[]): string {
  return topics
    .map((topic) =>
      [
        `KONU ${topic.index}: ${topic.title} (sayfalar: ${topic.pages.map((page) => page.page).join(", ")})`,
        ...topic.pages.map(
          (page) =>
            `  s.${page.page}${page.headings.length ? ` [başlıklar: ${page.headings.slice(0, 4).join(" | ")}]` : ""}: ${page.lead}`,
        ),
      ].join("\n"),
    )
    .join("\n\n");
}

/**
 * Bir konunun birimlerini doğrular. Birimler konunun sayfalarını eksiksiz,
 * sırayla ve konunun sayfa sırasında ardışık kapsamalı; her biri 1-6 sayfa.
 * Başlık yalnız biçimce düzelir (BÜYÜK HARF → normal). Geçersizse null.
 */
export function validateUnits(topicPages: number[], raw: unknown): ConceptUnit[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const order = [...new Set(topicPages)].sort((a, b) => a - b);
  const position = new Map(order.map((page, index) => [page, index]));
  const units: ConceptUnit[] = [];
  let cursor = 0;
  for (const entry of raw) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const title = typeof row.title === "string" ? calmHeading(row.title.replace(/\s+/g, " ").trim()) : "";
    const pages = Array.isArray(row.pages)
      ? [...new Set(row.pages.filter((page): page is number => Number.isInteger(page)))].sort((a, b) => a - b)
      : [];
    if (!title || title.split(/\s+/).length > 9 || isJunkTopicTitle(title)) return null;
    if (!pages.length || pages.length > UNIT_MAX_PAGES) return null;
    for (const page of pages) {
      // Konunun sayfa sırasında sıradaki sayfa olmalı: atlama, tekrar ya da yabancı sayfa yok.
      if (position.get(page) !== cursor) return null;
      cursor += 1;
    }
    units.push({ title: title.slice(0, 80), pages });
  }
  if (cursor !== order.length) return null;
  // Aynı adlı iki birim ("Açı ölçüsü ve radyan" ×2) "(1/2)"den iyi değil.
  const names = new Set(units.map((unit) => unit.title.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim()));
  return names.size === units.length ? units : null;
}

/** Model cevabından konu sırasına göre birimler; geçersiz konular boş kalır. */
export function unitsFromModel(raw: unknown, topics: { index: number; pages: number[] }[]): Map<number, ConceptUnit[]> {
  const out = new Map<number, ConceptUnit[]>();
  const list = (raw as { topics?: unknown } | null)?.topics;
  if (!Array.isArray(list)) return out;
  for (const entry of list) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const index = typeof row.index === "number" ? row.index : Number(row.index);
    const topic = topics.find((item) => item.index === index);
    if (!topic) continue;
    const units = validateUnits(topic.pages, row.units);
    if (units && units.length > 1) out.set(index, units);
  }
  return out;
}

/** Sayfanın ilk anlamlı satırları: sayfa kenarı başlıkları atılır. */
export function pageLead(text: string, edges: string[], max = 220): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isRunningHeader(line, edges) && !/^\d{1,4}$/.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, max);
}
