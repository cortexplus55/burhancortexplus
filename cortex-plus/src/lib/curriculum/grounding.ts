/**
 * Resmî kazanım dayanağı (1 Kasım 2026): ders ve test istemine konunun bütün kazanımları — resmî metin,
 * kod ve programın "sınırlamalar / açıklamalar" maddeleri — aynen girer. Ders adına göre dal yoktur.
 */
export type OfficialOutcomeItem = { code: string; text: string; limitations: string[] };

export type OfficialOutcomeGrounding = {
  /** Konunun kazanımları (konu = ünite / alt başlık; bir ya da çok kazanım). */
  outcomes: OfficialOutcomeItem[];
  programLabel: string;
  programVersion: string;
  unitTitle: string | null;
  topicLabel?: string | null;
};

const LINE_MAX = 400;

export function officialOutcomeBlock(
  grounding: OfficialOutcomeGrounding | null | undefined,
  use: "lesson" | "quiz",
): string {
  if (!grounding || !grounding.outcomes.length) return "";
  const many = grounding.outcomes.length > 1;
  const body = grounding.outcomes.map((o) => {
    const limits = o.limitations
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((line) => `  - ${line.slice(0, LINE_MAX)}`);
    return [`${o.code} ${o.text}`, limits.length ? `  Sınırlamalar / açıklamalar (aynen):\n${limits.join("\n")}` : ""]
      .filter(Boolean)
      .join("\n");
  });
  const head = `${grounding.programLabel} · ${grounding.programVersion}${grounding.unitTitle ? ` · ${grounding.unitTitle}` : ""}`;
  return [
    many
      ? `RESMÎ KAZANIMLAR (${head}${grounding.topicLabel ? ` · konu: ${grounding.topicLabel}` : ""}; ${grounding.outcomes.length} kazanım):`
      : `RESMÎ KAZANIM (${head}):`,
    body.join("\n"),
    use === "lesson"
      ? `Ders ${many ? "bu kazanımların hepsini" : "bu kazanımı"} karşılasın; sınırlamaların dışına çıkma (programın kapsamadığı ayrıntıyı öğretme).`
      : `Sorular ${many ? "bu kazanımları (dengeli dağıtarak)" : "bu kazanımı"} ölçsün; sınırlamaların dışında kalan bilgiyi sorma.`,
  ].join("\n");
}
