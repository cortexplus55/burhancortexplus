import { isJunkTopicTitle, normalizeTopicTitle, topicTitleIssues } from "@/lib/documents/topic-title";

/**
 * Uzun belgede alt başlıkları 10–15 ana konuda toplamak.
 *
 * 28 Eylül 2026'da 211 sayfalık KPSS Vatandaşlık belgesinden 111 konu çıktı;
 * Astra aynı belgeden 12 ana konu çıkarıyor ("Yasama Organı: TBMM'nin Yapısı,
 * Görevleri ve Seçimler" gibi). Ürün sahibi Astra gibi olmasını seçti
 * (30 Eylül 2026). Hiçbir alt başlık atılmaz: her biri bir ana konuya girer,
 * sayfaları o konuya bağlanır. Ders, konuyu sayfa sayfa bölümlere ayırır
 * (bkz. `lessonPageChunks`).
 *
 * Bu dosya saf: istem ve doğrulama. Model çağrısı `topic-main-groups-llm.ts`.
 */

export const MAIN_TOPIC_MIN = 10;
export const MAIN_TOPIC_MAX = 15;

export type SubTopic = { title: string; pageNumbers: number[] };

export type MainTopic = {
  title: string;
  learningObjective: string | null;
  pageNumbers: number[];
  /** Ana konuya katılan alt başlıklar; kapsama raporuna yazılır. */
  members: string[];
};

function pageSpan(pages: number[]): string {
  if (!pages.length) return "";
  const sorted = [...pages].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? ` (s.${first})` : ` (s.${first}–${last})`;
}

export function mainTopicRange(count: number): { min: number; max: number } {
  return { min: Math.min(MAIN_TOPIC_MIN, count), max: MAIN_TOPIC_MAX };
}

export function mainGroupingPrompt(fileName: string, subs: SubTopic[]): string {
  const { min, max } = mainTopicRange(subs.length);
  const list = subs.map((sub, index) => `${index}. ${sub.title}${pageSpan(sub.pageNumbers)}`).join("\n");
  return `"${fileName}" belgesinin alt başlıkları belgedeki sırayla aşağıda. Bunları ${min}–${max} ana konuda topla.

Kurallar:
- Her alt başlık tam olarak bir ana konuya girer; hiçbirini atma.
- Ana konu, belgedeki ardışık alt başlıklardan oluşur; sırayı bozma.
- Ana konu başlığı belgenin dilinde, 3–9 kelime, ünitenin adı olsun ("Yasama Organı: TBMM'nin Yapısı, Görevleri ve Seçimler" gibi). Sınav adı (KPSS, YKS), "Test" ya da soru cümlesi yazma; sonuna nokta koyma.
- Alt başlıklar arasında soru kökü ya da yarım satır varsa onu en yakın ana konuya kat.
- learningObjective: o ana konuda öğrencinin kazanacağı beceri, tek cümle.

JSON: {"groups":[{"title":string,"learningObjective":string,"members":number[]}]}

Alt başlıklar:
${list}`;
}

type RawGroup = { title?: unknown; learningObjective?: unknown; members?: unknown };

function usableTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = normalizeTopicTitle(raw).replace(/[.!?…:;]+$/u, "").trim();
  if (!title || isJunkTopicTitle(title) || topicTitleIssues(title).length) return null;
  return title;
}

/**
 * Modelin gruplamasını doğrular. Her alt başlık bir kez kullanılır; eksik
 * kalan, kendinden önceki alt başlığın grubuna katılır. Grup sayısı aralık
 * dışındaysa ya da bir grubun adı kullanılamıyorsa null: çağıran taraf
 * gruplanmamış haritayla devam eder.
 */
export function applyMainGroups(subs: SubTopic[], raw: unknown): MainTopic[] | null {
  const groups = (raw as { groups?: unknown } | null)?.groups;
  if (!Array.isArray(groups) || !subs.length) return null;
  const { max } = mainTopicRange(subs.length);
  const min = Math.min(8, subs.length);
  const owner = new Array<number>(subs.length).fill(-1);
  const drafts: { title: string; learningObjective: string | null }[] = [];
  for (const item of groups as RawGroup[]) {
    const title = usableTitle(item?.title);
    if (!title) return null;
    const members = Array.isArray(item.members)
      ? item.members.filter((m): m is number => Number.isInteger(m) && m >= 0 && m < subs.length)
      : [];
    const index = drafts.length;
    let claimed = 0;
    for (const member of members) {
      if (owner[member] !== -1) continue;
      owner[member] = index;
      claimed += 1;
    }
    if (!claimed) continue;
    const objective = typeof item.learningObjective === "string" ? item.learningObjective.trim() : "";
    drafts.push({ title, learningObjective: objective.length >= 4 ? objective.slice(0, 240) : null });
  }
  if (drafts.length < min || drafts.length > max) return null;
  // Model bir alt başlığı unuttuysa belgedeki komşusunun grubuna gider.
  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i] !== -1) continue;
    const before = owner.slice(0, i).reverse().find((o) => o !== -1);
    const after = owner.slice(i + 1).find((o) => o !== -1);
    owner[i] = before ?? after ?? 0;
  }
  const out = drafts.map((draft, index) => {
    const members = subs.filter((_, i) => owner[i] === index);
    const firstIndex = owner.indexOf(index);
    return {
      firstIndex,
      topic: {
        title: draft.title,
        learningObjective: draft.learningObjective,
        pageNumbers: [...new Set(members.flatMap((m) => m.pageNumbers))].sort((a, b) => a - b),
        members: members.map((m) => m.title),
      },
    };
  });
  return out
    .filter((row) => row.firstIndex !== -1 && row.topic.pageNumbers.length)
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((row) => row.topic);
}
