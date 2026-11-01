import type { LevelApi, LevelItem } from "@/lib/level-check/types";

/** e2e sahte havuzu: yalnız test fikstürü (E2E_FIXTURE=1). Doğru cevap her zaman ilk şıktır. */
function fakeItem(unitId: string, i: number, outcome: number): LevelItem {
  return {
    id: `e2e-${unitId}-${i}`,
    unitId,
    unitTitle: `Fikstür ünitesi ${unitId.split("#")[1]}`,
    outcomeId: `${unitId.split("#")[0]}#${outcome}`,
    outcomeCode: `E2E.${outcome}`,
    outcomeText: "Fikstür kazanımı: uzun bir metin ile dar ekranda taşma olmadığını sınamak için yazılmış açıklama cümlesi.",
    difficulty: (["medium", "easy", "hard"] as const)[i % 3]!,
    stem: `Fikstür sorusu ${i + 1}: Osmanlı Devleti'nin kuruluş döneminde uygulanan iskân politikasının amaçlarından hangisi uzunçokuzunbirkelimeyleTaşmaSınaması?`,
    choices: ["Doğru şık", "Yanlış şık B", "Yanlış şık C", "Yanlış şık D", "Yanlış şık E"],
  };
}

export function fakeLevelApi(opts: { guest: boolean; empty?: boolean }): LevelApi {
  return {
    async start(req) {
      if (opts.empty) return { status: "empty" };
      let items: LevelItem[];
      if (req.mode === "quick_scan") {
        const pool = req.units.slice(0, 6).map((id) => id.replace(/#(\d+)$/, (_, n) => `#${Number(n) + 1}`));
        items = Array.from({ length: 12 }, (_, i) => fakeItem(pool[i % pool.length]!, i, i));
        if (opts.guest) items = items.slice(0, 3);
      } else {
        items = Array.from({ length: 4 }, (_, i) => fakeItem(req.unit, i, i % 3));
      }
      return { status: "ok", token: "e2e", source: req.mode, guest: opts.guest, items, persisted: true };
    },
    async answer({ choice }) {
      return { correct: choice === 0, answer: 0, explanation: "Fikstür açıklaması.", persisted: true };
    },
  };
}
