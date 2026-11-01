/**
 * Resmî kazanım dayanağı (1 Kasım 2026): ders ve test istemine kazanımın resmî metni ve programın
 * "sınırlamalar / açıklamalar" maddeleri aynen girer. Ders adına göre dal yoktur.
 */
export type OfficialOutcomeGrounding = {
  code: string;
  text: string;
  limitations: string[];
  programLabel: string;
  programVersion: string;
  unitTitle: string | null;
};

const LIMIT_MAX = 6;
const LINE_MAX = 400;

export function officialOutcomeBlock(
  grounding: OfficialOutcomeGrounding | null | undefined,
  use: "lesson" | "quiz",
): string {
  if (!grounding) return "";
  const limits = grounding.limitations
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, LIMIT_MAX)
    .map((line) => `- ${line.slice(0, LINE_MAX)}`);
  return [
    `RESMÎ KAZANIM (${grounding.programLabel} · ${grounding.programVersion}${grounding.unitTitle ? ` · ${grounding.unitTitle}` : ""}):`,
    `${grounding.code} ${grounding.text}`,
    limits.length ? `PROGRAMIN SINIRLAMALARI / AÇIKLAMALARI (aynen):\n${limits.join("\n")}` : "",
    use === "lesson"
      ? "Ders bu kazanımı karşılasın; sınırlamaların dışına çıkma (programın kapsamadığı ayrıntıyı öğretme)."
      : "Sorular bu kazanımı ölçsün; sınırlamaların dışında kalan bilgiyi sorma.",
  ]
    .filter(Boolean)
    .join("\n");
}
