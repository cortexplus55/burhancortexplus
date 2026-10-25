import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { examPrepNodeResultHref } from "@/lib/learning/exam-prep-hrefs";
import { nodeResultView, spentMinutes, unscoredResult } from "@/lib/learning/node-result";

/*
  17 Ekim 2026, Astra ile yan yana: bitmiş testte "Sonuçları gör" Astra'da önceki sonucu
  açıyor (3/7, doğruluk %50, harcanan zaman 3 dk, "Dersi tekrarla"). Bizde aynı düğme
  etkinliği baştan kuruyordu ("Bu konuya ne kadar aşinasın?") — devam edilse yeni deneme.
*/
const read = (path: string) => readFileSync(path, "utf8");

describe("bitmiş etkinliğin sonucu", () => {
  it("puan, doğruluk, süre ve cümle kayıttan", () => {
    const view = nodeResultView({
      score: 3,
      total: 7,
      startedAt: "2026-10-17T10:00:00Z",
      createdAt: "2026-10-17T09:59:00Z",
      updatedAt: "2026-10-17T10:03:10Z",
    });
    expect(view).toMatchObject({ scored: true, score: 3, total: 7, pct: 43, minutes: 3, headline: "Bir tekrar iyi gelir." });
    expect(nodeResultView({ score: 6, total: 7, startedAt: null, createdAt: "2026-10-17T10:00:00Z", updatedAt: null })).toMatchObject({
      pct: 86,
      minutes: null,
      headline: "Harika iş çıkardın!",
    });
    expect(nodeResultView({ score: 4, total: 7, startedAt: null, createdAt: "2026-10-17T10:00:00Z", updatedAt: null }).headline).toBe(
      "İyi gidiyorsun!",
    );
    // Puansız etkinlik (ders, podcast): sayı yok, yalnız "Tamamladın!".
    expect(nodeResultView({ score: null, total: null, startedAt: null, createdAt: "2026-10-17T10:00:00Z", updatedAt: null })).toMatchObject({
      scored: false,
      pct: null,
      headline: "Tamamladın!",
    });
    // Podcast bitince kayıt 1/1 yazar; ekranda "Doğru cevaplar 1/1 · %100" çıkmaz (19 Ekim 2026).
    expect(nodeResultView({ score: 1, total: 1, kind: "podcast", startedAt: null, createdAt: "2026-10-17T10:00:00Z", updatedAt: null })).toMatchObject({
      scored: false,
      pct: null,
      headline: "Tamamladın!",
    });
    expect(nodeResultView({ score: 1, total: 1, kind: "quiz", startedAt: null, createdAt: "2026-10-17T10:00:00Z", updatedAt: null }).scored).toBe(true);
    // Dinleme kontrolü cevaplanan podcast (20 Ekim 2026): "2/3 · %67"; atlanan yine 1/1, puansız.
    expect(nodeResultView({ score: 2, total: 3, kind: "podcast", startedAt: null, createdAt: "2026-10-17T10:00:00Z", updatedAt: null })).toMatchObject({
      scored: true,
      pct: 67,
    });
    expect(unscoredResult("podcast", 1)).toBe(true);
    expect(unscoredResult("podcast", 3)).toBe(false);
    expect(unscoredResult("quiz", 1)).toBe(false);
  });

  it("süre ölçülemiyorsa yok; en az 1 dk, 10 saati aşan kayıt yok sayılır", () => {
    expect(spentMinutes({ startedAt: null, createdAt: "2026-10-17T10:00:00Z", updatedAt: "2026-10-17T10:00:20Z" })).toBe(1);
    expect(spentMinutes({ startedAt: null, createdAt: "2026-10-17T10:00:00Z", updatedAt: "2026-10-17T09:00:00Z" })).toBeNull();
    expect(spentMinutes({ startedAt: null, createdAt: "2026-10-17T10:00:00Z", updatedAt: "2026-10-18T10:00:00Z" })).toBeNull();
  });

  it("Sonuçları gör ve yoldaki bitmiş düğüm sonuç sayfasını açar; sayfa yalnız sahibin kaydını okur", () => {
    expect(examPrepNodeResultHref("p1", "n1")).toBe("/deneme-sinavlari/p1/dugum/n1/sonuc");
    const home = read("src/components/parity/exam-prep-home.tsx");
    expect(home).toContain('<Link href={examPrepNodeResultHref(prepId, lastNode.id)} className="cp-prep-last-go">');
    expect(home).toContain("📖 Dersi / İçeriği Tekrar İncele (Kredisiz)");
    expect(home).toContain("⏭️ Sıradaki Etkinliğe Git");
    expect(home).toContain("examPrepSavedReviewHref(prepId, node.id)");
    expect(home).not.toContain('node.status === "done" ? examPrepNodeResultHref(prepId, node.id)');
    const page = read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/sonuc/page.tsx");
    expect(page).toContain('.eq("user_id", user.id)');
    expect(page).toContain('.eq("status", "completed")');
    expect(page).toContain("Dersi tekrarla");
  });
});

// 19 Ekim 2026, canlı: podcast oturumunun kendi sonuç ekranı da "Doğru cevaplar 1/1 · Doğruluk %100"
// diyordu. Oturum ekranı aynı kuralı (`UNSCORED_NODE_KINDS`) kullanır; skor, doğruluk ve eğitmen
// geri bildirimi gösterilmez, tekrar düğmesi "Yeniden dinle" der.
describe("podcast oturumunun sonuç ekranı puan göstermez", () => {
  it("oturum ekranı puansız türde skor satırlarını gizler", async () => {
    const { readFileSync } = await import("node:fs");
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    // 20 Ekim 2026: dinleme kontrolü cevaplanınca podcast de puanlı (2/3); atlanınca yine puansız.
    expect(session).toContain("const unscored = unscoredResult(kind, score.total);");
    expect(session).toContain('{kind === "podcast" ? "Yeniden dinle" : "Dersi tekrarla"}');
    expect(session).toMatch(/\{unscored \? null : \(\s*<div>\s*<dt>Doğruluk<\/dt>/);
  });
});
