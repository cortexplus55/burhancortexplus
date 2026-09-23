import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  NO_SOURCE_CREDIT_NOTE,
  NO_SOURCE_MARKER,
  saidNoSource,
  stripNoSourceMarker,
} from "@/lib/ai/grounding";

/*
  Man şet vaat: "Notunda olmayanı uydurmaz. Cevaplayamadığı soruda kredin
  düşmez."

  Bu testler o cümlenin PAZARLAMA olarak kalmasını engelliyor. Vaadin kodda
  karşılığı yoksa ilk kullanan öğrenci farkı görür ve o noktadan sonra
  söylediğimiz hiçbir şeye güvenmez.

  Gerekçe ürünün kendi mantığında: katı çiti koyarken "belgede olmayan doğru
  bir bilgi bile öğrenci için yanlış yönlendirmedir" dedik. O kural gereği
  model bazen cevap vermeyi reddediyor. Reddettiği her soruda kredi almak,
  dürüst davranışı öğrenciye ceza olarak yaşatmak olur — ve krediyi yiyen
  reddi gören öğrenci reddetmeyen bir ürüne geçer. Yani çitin bedelini biz
  ödemezsek çit kendi kendini sabote eder.
*/

const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");

describe("kaynakta yok işareti", () => {
  it("işaretle başlayan cevabı tanıyor", () => {
    expect(saidNoSource(`${NO_SOURCE_MARKER} bu notunda geçmiyor`)).toBe(true);
  });

  it("başta boşluk olsa da tanıyor", () => {
    expect(saidNoSource(`\n  ${NO_SOURCE_MARKER} ...`)).toBe(true);
  });

  it("normal cevabı yanlışlıkla işaretli saymıyor", () => {
    expect(saidNoSource("Klorofil yeşili yansıtır.")).toBe(false);
  });

  it("işaret öğrenciye gösterilmiyor", () => {
    const cleaned = stripNoSourceMarker(`${NO_SOURCE_MARKER} Bu notunda yok.`);
    expect(cleaned).not.toContain(NO_SOURCE_MARKER);
    expect(cleaned).toBe("Bu notunda yok.");
  });
});

describe("kredi güvencesi rotada bağlı", () => {
  it("rota işarete bakıyor", () => {
    expect(route).toContain("saidNoSource");
    expect(route).toContain("const noSource =");
  });

  /* Asıl şart: işaret varsa tahsil değil iade — atomic RPC p_charge ile. */
  it("işaret varsa kredi iade ediliyor, yoksa tahsil", () => {
    const block = route.slice(route.indexOf("if (noSource) {"));
    expect(block).toContain("charge = false");
    expect(route).toContain("complete_chat_operation");
    expect(route).toContain("p_charge: charge");
    // noSource dalı charge=false set eder; RPC charge=false → credit_refund.
    const noSourceIdx = block.indexOf("charge = false");
    expect(noSourceIdx).toBeGreaterThanOrEqual(0);
  });

  /*
    Jeton kaydı DURMALI: sağlayıcıya gerçekten ödedik. İade edilen şey
    öğrencinin kredisi, bizim maliyetimiz değil — maliyeti kayıttan düşürmek
    kendi muhasebemizi kör eder.
  */
  it("iade edilse de kullanım kaydı yazılıyor", () => {
    // recordUsage, noSource kararından ÖNCE (generation + verify) çalışır.
    const beforeDecision = route.slice(
      0,
      route.indexOf("const noSource ="),
    );
    expect(beforeDecision).toContain("recordUsage");
  });
});

describe("güvence öğrenciye görünüyor", () => {
  /*
    `X-Credits-Used` başlığı akış başlamadan yazılıyor, yani iadeyi bilemez ve
    "1 kredi" der. Güvence bu yüzden yanıtın kendi gövdesinde.
  */
  it("not kredinin düşmediğini söylüyor", () => {
    expect(NO_SOURCE_CREDIT_NOTE).toContain("kredin düşmedi");
  });

  it("rota notu cevaba ekliyor", () => {
    expect(route).toContain("NO_SOURCE_CREDIT_NOTE");
  });
});

describe("satış sayfası ile kod aynı şeyi söylüyor", () => {
  const cards = readFileSync(
    "src/components/parity/subscription-cards.tsx",
    "utf8",
  );

  it("fiyat kartı ürün sözü veriyor", () => {
    expect(cards).toContain("uydurmaz");
    expect(cards).toContain("kredin düşmez");
  });

  /*
    14 günlük koşulsuz iade geri alındı: kredisini yakıp iade isteyen
    kullanıcıya açıktı ve nakitle güven satın almaya çalışıyordu.
  */
  it("koşulsuz para iadesi sözü geri gelmemiş", () => {
    // Yorumlar ayıklanıyor: gerekçeyi anlatan açıklama metni ekranda görünen
    // vaat değil, ve onu silmek gerekçeyi de silerdi.
    const visible = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    expect(visible(cards)).not.toContain("14 gün");
    const terms = readFileSync("src/app/kullanim-kosullari/page.tsx", "utf8");
    expect(visible(terms)).not.toContain("gerekçe göstermeden");
    expect(visible(terms)).not.toContain("14 gün");
  });
});

describe("örnek akış iddiayı kanıtlıyor", () => {
  const demo = readFileSync(
    "src/components/demo/demo-walkthrough.tsx",
    "utf8",
  );

  /*
    İlk beş adım "içerik senin notundan üretilir" diyordu — rakip de bunu
    yapıyor, yani fark değil. Fark, notta olmayan sorulduğunda ortaya çıkıyor.
  */
  it("sınır adımı var ve en sonda", () => {
    expect(demo).toContain('id: "sinir"');
    const steps = demo.slice(demo.indexOf("const STEPS"), demo.indexOf("];"));
    expect(steps.lastIndexOf('id: "sinir"')).toBeGreaterThan(
      steps.lastIndexOf('id: "sozlu"'),
    );
  });

  it("üç davranışın üçü de gösteriliyor", () => {
    for (const kind of ["var", "yok", "duzeltme"]) {
      expect(demo).toContain(`kind: "${kind}"`);
    }
  });

  /* En güçlü an: ürünün öğrenciye KATILMADIĞI yer. */
  it("yanlış varsayım onaylanmıyor", () => {
    const cases = demo.slice(demo.indexOf("BOUNDARY_CASES"));
    expect(cases).toContain("değil mi?");
    expect(cases).toContain("Hayır");
  });

  it("reddedilen soruda kredinin düşmediği yazıyor", () => {
    expect(demo).toContain("kredin düşmedi");
  });
});
