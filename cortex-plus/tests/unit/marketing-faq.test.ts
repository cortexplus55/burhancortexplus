import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MARKETING_FAQ } from "@/lib/parity/marketing-faq";
import { MARKETING_SUBJECTS } from "@/lib/parity/marketing-subjects";

/*
  SSS itirazların öldüğü yer: buraya kadar gelmiş öğrenci ilgileniyor ama bir
  şeye takılmış. Bu yüzden buradaki her söz, kodda karşılığı OLDUĞU İÇİN
  verilebilir.

  Eski hâlinde üç soru vardı ve ikisi yanlış şeyi cevaplıyordu — "ücretsiz
  deneyebilir miyim?" sorusuna "marketing sayfalarını gezebilirsin" deniyordu.
  Bu testler listenin hem yeterli hem DOĞRU kalmasını tutuyor: bir vaat
  koddaki karşılığından koparsa, ilk kullanan öğrenci farkı görür ve o noktadan
  sonra söylediğimiz hiçbir şeye güvenmez.
*/

describe("SSS listesi", () => {
  it("itirazları karşılayacak kadar uzun", () => {
    expect(MARKETING_FAQ.length).toBeGreaterThanOrEqual(10);
  });

  it("her sorunun gerçek bir cevabı var", () => {
    for (const item of MARKETING_FAQ) {
      expect(item.q.trim().endsWith("?")).toBe(true);
      expect(item.a.trim().length).toBeGreaterThan(80);
    }
  });

  it("aynı soru iki kez sorulmuyor", () => {
    const keys = MARKETING_FAQ.map((i) => i.q.toLocaleLowerCase("tr"));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("vaatlerin kodda karşılığı var", () => {
  const answers = MARKETING_FAQ.map((i) => i.a).join("\n");

  /* Ücretsiz günlük hak gerçekten 6 mı? */
  it("6 kredi iddiası göç dosyasıyla uyuşuyor", () => {
    expect(answers).toContain("6 kredi");
    const sql = readFileSync(
      "supabase/migrations/20260903150000_daily_budget_calendar_app_metrics.sql",
      "utf8",
    );
    expect(sql).toContain("v_allowance := 6");
  });

  /* "Cevaplayamadığında kredin düşmüyor" — sohbet rotasında iade var mı? */
  it("kredi iadesi sözünün rotada karşılığı var", () => {
    expect(answers).toContain("kredin düşmüyor");
    const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
    expect(route).toContain("saidNoSource");
    expect(route).toContain("if (noSource) {");
  });

  /* "Belgen yoksa konudan çalışıyorsun" — gerçekten kurulu mu? */
  it("belgesiz çalışma sözünün karşılığı var", () => {
    expect(answers).toContain("konudan çalış");
    const prep = readFileSync("src/lib/learning/prep-source.ts", "utf8");
    expect(prep).toContain("topic_only");
    const wizard = readFileSync(
      "src/components/parity/exam-create-wizard.tsx",
      "utf8",
    );
    expect(wizard).toContain("Belgem yok, konudan çalışayım");
  });

  /* "Yalnızca belgem / belge + genel bilgi" seçeneği var mı? */
  it("kaynak sınırı seçeneğinin karşılığı var", () => {
    const prep = readFileSync("src/lib/learning/prep-source.ts", "utf8");
    expect(prep).toContain("documents_only");
    expect(prep).toContain("allow_supporting");
  });

  /* "Veline ödeme isteği gönderebiliyorsun" */
  it("veliden ödeme isteme sözünün karşılığı var", () => {
    expect(answers).toContain("veline ödeme isteği");
    const sql = readFileSync(
      "supabase/migrations/20250826120000_schools_streaks_payment_requests.sql",
      "utf8",
    );
    expect(sql).toContain("parent_payment_requests");
  });

  it("ders sayısı iddiası listeyle uyuşuyor", () => {
    expect(answers).toContain("on beş ders");
    expect(MARKETING_SUBJECTS).toHaveLength(15);
  });
});

/*
  Ölçemediğimiz şeyi vaat etmiyoruz. Not garantisi ("şu kadar not yükselt ya
  da para iadesi") kanıtlanamaz: öğrencinin okul notunu görmüyoruz. Mobil
  uygulama da mağazada olup olmadığını doğrulayamadığımız bir iddia.
*/
describe("vaat edilmeyenler", () => {
  const all = MARKETING_FAQ.map((i) => `${i.q} ${i.a}`).join("\n").toLocaleLowerCase("tr");

  it("not garantisi verilmiyor", () => {
    expect(all).not.toContain("not garantisi");
    expect(all).not.toMatch(/not.{0,20}para iadesi/);
  });

  it("uygulama indirme vaadi yok", () => {
    expect(all).not.toContain("app store");
    expect(all).not.toContain("google play");
  });
});
