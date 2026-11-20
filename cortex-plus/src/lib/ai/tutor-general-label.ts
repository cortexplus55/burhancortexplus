/*
  Hazırlık sohbeti · "Genel bilgiden:" etiketi (15 Kasım 2026, Burhan kararı 3, EK-1 Bulgu 1).

  Canlı: "Belgem + genel bilgi" modunda doğru bir ders kitabı açıklaması ("sürtünme mekanik enerjiyi ısıya dönüştürür")
  "Genel bilgiden:" etiketi taşımadığı için denetçi tarafından iki kez reddedildi; öğrenci 28 sn sonra "emin olamadım"
  gördü. Bilgi yanlış değildi, yalnız etiket eksikti.

  Kural (dar): YALNIZ "mixed" modda ve denetçinin BÜTÜN itirazları "A: pasajda dayanağı yok ama ders kitabına göre doğru,
  sayı/tarih/eşik içermiyor" ise ve itiraz edilen her cümle cevapta bulunabiliyorsa, kod o paragrafların başına
  "Genel bilgiden:" ekler ve cevabı geçirir. Başka her durumda (çelişki, yanlış bilgi, sayı, bulunamayan alıntı, öbür
  kurallar) eski sıkı davranış aynen. "Yalnızca belgem" modunda bu yol hiç yok. Kod cümle yazmaz; yalnız etiket ekler.
*/

export const GENERAL_LABEL = "Genel bilgiden:";

export type TutorIssueRow = {
  rule: string | null;
  quote: string | null;
  generalCorrect: boolean | null;
  hasNumber: boolean | null;
  severity: string | null;
};

/** Denetçinin yapılandırılmış itiraz satırları (yalnız yüksek önem; düşükler sayılmaz, `parseTutorIssues` ile aynı). */
export function parseTutorIssueRows(raw: unknown): TutorIssueRow[] {
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const problem = typeof row.problem === "string" ? row.problem.trim() : "";
    if (!problem || row.severity === "low") return [];
    return [
      {
        rule: typeof row.rule === "string" ? row.rule.trim().toUpperCase().slice(0, 1) : null,
        quote: typeof row.quote === "string" && row.quote.trim() ? row.quote.trim() : null,
        generalCorrect: typeof row.generalCorrect === "boolean" ? row.generalCorrect : null,
        hasNumber: typeof row.hasNumber === "boolean" ? row.hasNumber : null,
        severity: typeof row.severity === "string" ? row.severity : null,
      },
    ];
  });
}

/** İtiraz yalnız "etiket eksik" mi: A kuralı, ders kitabına göre doğru, sayısız, alıntılı. Alan eksikse hayır (sıkı). */
export function isLabelOnlyIssue(row: TutorIssueRow): boolean {
  return (
    row.rule === "A" &&
    row.generalCorrect === true &&
    row.hasNumber === false &&
    Boolean(row.quote) &&
    !/\d/.test(row.quote ?? "")
  );
}

const fold = (text: string) =>
  text
    .normalize("NFKC")
    .toLocaleLowerCase("tr")
    .replace(/[*_=`>"'“”‘’«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Alıntının bulunduğu paragraf: birebir (biçim işaretleri ve boşluk yok sayılarak) ya da alıntının ilk 40 harfi. */
function paragraphOf(paragraphs: string[], quote: string): number {
  const needle = fold(quote);
  if (needle.length < 12) return -1;
  const head = needle.slice(0, 40);
  return paragraphs.findIndex((paragraph) => {
    const hay = fold(paragraph);
    return hay.includes(needle) || hay.includes(head);
  });
}

export type LabelFix = { content: string; labeled: number };

/**
 * İtiraz edilen cümlelerin paragraflarının başına "Genel bilgiden:" ekler. Bir alıntı bulunamazsa null (çağıran eski
 * sıkı yola döner). Zaten etiketli paragrafa ikinci kez eklenmez; kutu (">") ve formül paragrafına dokunulmaz.
 */
export function labelGeneralParagraphs(answer: string, quotes: string[]): LabelFix | null {
  const paragraphs = answer.split(/\n{2,}/);
  const targets = new Set<number>();
  for (const quote of quotes) {
    const index = paragraphOf(paragraphs, quote);
    if (index < 0) return null;
    const paragraph = paragraphs[index]!.trimStart();
    if (paragraph.startsWith(">") || paragraph.startsWith("$$")) return null;
    targets.add(index);
  }
  let labeled = 0;
  const next = paragraphs.map((paragraph, index) => {
    if (!targets.has(index)) return paragraph;
    if (fold(paragraph).startsWith(fold(GENERAL_LABEL))) return paragraph;
    labeled += 1;
    return `${GENERAL_LABEL} ${paragraph.trimStart()}`;
  });
  return { content: next.join("\n\n"), labeled };
}

/**
 * Karar: "mixed" modda bütün itirazlar etiket eksikliğiyse etiketlenmiş cevap; değilse null (eski davranış).
 */
export function settleLabelOnlyIssues(mode: string | undefined, answer: string, rows: TutorIssueRow[]): LabelFix | null {
  if (mode !== "mixed" || !rows.length) return null;
  if (!rows.every(isLabelOnlyIssue)) return null;
  return labelGeneralParagraphs(answer, rows.map((row) => row.quote!));
}
