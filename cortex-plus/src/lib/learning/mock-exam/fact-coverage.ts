import { lessonBackbone } from "@/lib/learning/lesson-backbone";
import { lessonKeyFacts } from "@/lib/learning/lesson-key-facts";

/**
 * Yazılı denemenin konu içi kapsamı (bütün ders türleri).
 *
 * Kota konuya aittir ve değişmez. Konunun içindeki sorular, önce kilit bilgilerden,
 * yetmezse sayfadaki alt başlıklardan, her imza en çok bir kez seçilir. Kod konu adı
 * ya da örnek uydurmaz; metin kaynağın kendisidir.
 */

export type CoveragePoint = { label: string; signature: string };

export type CoverageSlot = {
  topicLabel: string;
  point: string | null;
  signature: string;
};

function signatureOf(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
}

function represented(seen: ReadonlySet<string>, signature: string): boolean {
  if (!signature || seen.has(signature)) return true;
  for (const existing of seen) {
    if (existing.length >= 8 && signature.length >= 8 && (existing.includes(signature) || signature.includes(existing))) {
      return true;
    }
  }
  return false;
}

/** Konunun kilit bilgileri, sonra henüz temsil edilmeyen alt başlıklar. */
export function topicCoveragePoints(
  pages: readonly { text?: string; label?: string }[],
  topicLabel?: string,
): CoveragePoint[] {
  const usable = pages.map((page) => ({ text: page.text ?? "", ...(page.label ? { label: page.label } : {}) }));
  const facts = lessonKeyFacts(usable);
  const headings = lessonBackbone(usable, { topicLabel });
  const out: CoveragePoint[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const text = label.replace(/\s+/g, " ").trim();
    const signature = signatureOf(text);
    if (!text || represented(seen, signature)) return;
    seen.add(signature);
    out.push({ label: text, signature });
  };
  for (const fact of facts) push(fact.text);
  for (const heading of headings) push(heading);
  return out;
}

/**
 * Her slota ayrı bir kaynak noktası. Nokta bitince kalan slotlar boş imzayla durur;
 * kota değişmez, aynı imza ikinci kez yazılmaz.
 */
export function assignExamCoverage(
  allocation: readonly { topicLabel: string; count: number }[],
  pointsByTopic: ReadonlyMap<string, readonly CoveragePoint[]>,
): CoverageSlot[] {
  const used = new Set<string>();
  const slots: CoverageSlot[] = [];
  for (const row of allocation) {
    const points = pointsByTopic.get(row.topicLabel) ?? [];
    let cursor = 0;
    for (let index = 0; index < row.count; index += 1) {
      let picked: CoveragePoint | null = null;
      while (cursor < points.length) {
        const candidate = points[cursor]!;
        cursor += 1;
        if (!candidate.signature || used.has(candidate.signature)) continue;
        picked = candidate;
        used.add(candidate.signature);
        break;
      }
      slots.push(
        picked
          ? { topicLabel: row.topicLabel, point: picked.label, signature: picked.signature }
          : { topicLabel: row.topicLabel, point: null, signature: "" },
      );
    }
  }
  return slots;
}

/** Yazara giden kapsam listesi. Boşsa eklenmez. Örnek ya da ders adı yok. */
export function coverageAsk(points: readonly (string | null | undefined)[]): string {
  const lines = points.map((point) => (point ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!lines.length) return "";
  return [
    "KAPSAM: her soru listedeki ayrı bir noktayı yoklasın. Cümleyi aynen kopyalama; aynı noktayı başka bağlamda, başka sayıyla ya da başka açıdan sorabilirsin. Soru doğru kalsın ve konunun dışına çıkmasın.",
    ...lines.map((line, index) => `${index + 1}) ${line}`),
  ].join("\n");
}
