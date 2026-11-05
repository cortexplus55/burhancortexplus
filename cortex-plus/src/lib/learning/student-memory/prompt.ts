/**
 * Öğretmene giden hafıza satırları (5 Kasım 2026).
 *
 * En çok üç kısa satır, başında tek bir başlık. Satırlar yalnız kayıtlı sayılardan kurulur; model "geçen gün"
 * gibi anı uyduramasın diye başlık bunu açıkça söyler ve satırlarda o sözcükler hiç geçmez
 * (`student-output-firewall` → `FABRICATED_MEMORY` deseniyle çakışmaz; bekçi test kanıtlar).
 * Konu etiketi hafızadaki konuyla eşleşiyorsa o satır öne alınır.
 */
import { topicLabelsMatch } from "@/lib/learning/topic-identity";
import { errorKindCoachLine, errorKindLabel, type ErrorKind } from "./error-kinds";
import { isEmptyMemory, type StudentMemory } from "./summary";

export const MEMORY_HEADER =
  "KİŞİSEL ÖĞRENME GEÇMİŞİ (yalnız bu satırlar gerçek; başka anı uydurma, 'geçen gün' deme):";

export const MEMORY_LINE_MAX = 3;

/** Acele payı bu eşiğin üstündeyse tempo satırı yazılır. */
const HURRIED_SHARE_LINE = 0.3;

const DAY_MONTH = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DAY_MONTH.format(date);
}

function topErrorKind(memory: StudentMemory): StudentMemory["errorKinds"][number] | null {
  return memory.errorKinds.find((row) => row.kind !== "other" && row.count > 0) ?? null;
}

function errorKindLine(row: { kind: ErrorKind; count: number; lastAt: string | null }): string {
  const when = shortDate(row.lastAt);
  const tally = `${row.count} kez${when ? `, son ${when}` : ""}`;
  return `Daha önceki pratiklerde en sık yaptığı hata: ${errorKindLabel(row.kind)} (${tally}). Bu adımda ${errorKindCoachLine(row.kind)}.`;
}

function topicLines(memory: StudentMemory, topicLabel: string | null | undefined): string[] {
  if (!topicLabel) return [];
  const out: string[] = [];
  const mistakes = memory.repeatedMistakeTopics.find((row) => topicLabelsMatch(row.topicLabel, topicLabel));
  if (mistakes) {
    out.push(
      `Bu konuda daha önce ${mistakes.wrongCount} soruyu yanlış cevapladı ve tekrar defterinde bekliyor; önce o noktaları yokla.`,
    );
  }
  const misconception = memory.openMisconceptions.find((row) => topicLabelsMatch(row.topicLabel, topicLabel));
  if (misconception) {
    out.push(`Bu konuda kayıtlı açık yanılgı: «${misconception.claim}». Doğrusunu açıkça kur, sonra kısa bir soruyla yokla.`);
  }
  return out;
}

function generalLines(memory: StudentMemory): string[] {
  const out: string[] = [];
  const top = topErrorKind(memory);
  if (top) out.push(errorKindLine(top));
  if (memory.weakOutcomes.length) {
    const lowest = Math.round(memory.weakOutcomes[0]!.mastery * 100);
    out.push(
      `${memory.weakOutcomes.length} kazanımda hâkimiyeti düşük ölçüldü (en düşüğü %${lowest}); açıklamayı temelden kur, bildiğini varsayma.`,
    );
  }
  if (memory.pace.hurriedShare != null && memory.pace.hurriedShare >= HURRIED_SHARE_LINE && memory.pace.avgTimeMs != null) {
    const seconds = Math.max(1, Math.round(memory.pace.avgTimeMs / 1000));
    out.push(
      `Cevapları ortalama ${seconds} saniyede veriyor ve acele payı yüksek; cevaptan önce soruyu yeniden okutup kontrol ettir.`,
    );
  }
  return out;
}

/**
 * Başlık + en çok `max` içerik satırı. Boş hafızada boş dizi (başlık da yok).
 * Konuya bağlı satırlar önce gelir; sonra en sık hata, zayıf kazanım sayısı, tempo.
 */
export function studentMemoryLines(
  memory: StudentMemory | null | undefined,
  opts: { topicLabel?: string | null; max?: number } = {},
): string[] {
  if (!memory || isEmptyMemory(memory)) return [];
  const max = Math.max(1, Math.min(MEMORY_LINE_MAX, opts.max ?? MEMORY_LINE_MAX));
  const lines = [...topicLines(memory, opts.topicLabel), ...generalLines(memory)].slice(0, max);
  return lines.length ? [MEMORY_HEADER, ...lines] : [];
}

/** Aynı satırlar tek metin olarak (ders yazarının tek satırlık `ÖĞRENCİ:` alanı için). Boşsa boş dizgi. */
export function studentMemoryBlock(
  memory: StudentMemory | null | undefined,
  opts: { topicLabel?: string | null; max?: number } = {},
): string {
  return studentMemoryLines(memory, opts).join("\n");
}
