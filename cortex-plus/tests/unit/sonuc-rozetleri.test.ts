import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resultStages } from "@/lib/learning/result-stages";

/*
  20 Kasım 2026: sonuç kartı konuları İlerleme ve yolla aynı dört rozetle sayar (Öğrendin / Gelişiyor / Zayıf /
  Ölçülmedi). Eski "çalışılacak / sağlam" ikilisi gelişen konuyu zayıfla aynı kefeye koyuyordu.
*/

const base = { kind: "quiz", score: 4, total: 5, streak: 1, topicGain: null } as const;

describe("sonuç kartının rozetleri", () => {
  it("sıfır olan rozet yazılmaz; açık eksik yoksa pekiştirme notu", () => {
    const [, , gaps] = resultStages({ ...base, openMisconceptions: 0, masteryBadges: ["learned", "learned", "unmeasured"] });
    expect(gaps!.value).toBe("0 açık yanılgı · Öğrendin: 2 konu · Ölçülmedi: 1 konu");
    expect(gaps!.note).toBe("Açık eksik yok; sıradaki adım pekiştirme.");
  });

  it("gelişen konu eksik sayılır; eski etiketler kullanılmaz", () => {
    const [, , gaps] = resultStages({ ...base, openMisconceptions: 0, masteryBadges: ["developing"] });
    expect(gaps!.value).toBe("0 açık yanılgı · Gelişiyor: 1 konu");
    expect(gaps!.note).toBeUndefined();
    expect(gaps!.value).not.toMatch(/çalışılacak|sağlam/);
  });

  it("sonuç sayfası planlı konularda birleştirir ve rozeti tek kaynaktan okur", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/sonuc/page.tsx", "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(page).toContain("masteryByPlannedTopic(plannedLabels, snapshots)");
    expect(page).toContain("topicMasteryView(snapshot, target).badge");
    expect(page).not.toContain(".state)");
  });
});
