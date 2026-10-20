import { describe, expect, it } from "vitest";
import { OPTION_ORDER_RULE, refersToOptionOrder } from "@/lib/learning/option-reference";

/*
  Şıklar öğrenciye karışık sırayla gösterilir. 20 Ekim 2026 kör kıyasında iki açıklama yakalanmadan geçti:
  trigonometride "ilk iki ifade aynı son kola sahip" ve Pediatri'de "Diğer seçeneklerdeki bulgular sırasıyla 6, 12
  ve 18 ay" — karışık şıklarda ikisi de yanlış şıkları gösteriyordu.
*/
describe("şıklara sırayla gönderme", () => {
  it("20 Ekim'de kaçan iki cümleyi yakalar", () => {
    expect(
      refersToOptionOrder("Derecede tam tur 360°, radyanda tam tur 2π olduğundan ilk iki ifade aynı son kola sahip açıların genel biçimleridir."),
    ).toBe(true);
    expect(refersToOptionOrder("Diğer seçeneklerdeki bulgular sırasıyla 6, 12 ve 18 ay basamaklarına karşılık gelir.")).toBe(true);
  });

  it("eski kalıpları yakalamaya devam eder", () => {
    for (const text of [
      "İlk seçenek sabit basınçta, ikinci seçenek sabit hacimdedir.",
      "Diğer seçenekler sırasıyla bronşiolit, astım ve pnömonidir.",
      "A şıkkı yanlıştır.",
      "2. seçenek eksik kalır.",
      "Son şık kaynakta geçmez.",
    ]) expect(refersToOptionOrder(text), text).toBe(true);
  });

  // JS'in `i` bayrağı "İ"yi "i" saymıyor: cümle başındaki büyük İ kaçıyordu.
  it("cümle başındaki büyük İ ve 'sırayla' da yakalanır", () => {
    for (const text of [
      "İlk iki ifade aynı son kola sahiptir.",
      "İlk seçenek sabit basınçtadır.",
      "İkinci şık ters işaretlidir.",
      "Diğer şıklar sırayla 6, 12 ve 18 aydır.",
      "İLK SEÇENEK yanlıştır.",
    ]) expect(refersToOptionOrder(text), text).toBe(true);
  });

  it("şıkkı içeriğiyle anan açıklamaya dokunmaz", () => {
    for (const text of [
      "Konfederasyon uluslararası sözleşmeyle kurulur; federasyon ise anayasaya dayanır.",
      "İlk iki yılda baş çevresi beyin büyümesini yansıtır.",
      "Bu ifade yanlıştır; doğrusu, egemenliğin topluma ait olmasıdır.",
      "Sırasıyla ülke, insan topluluğu ve egemenlik aranır.",
      // KPSS çekirdek bilgisi: "madde" şık değildir (itiraz edilemeyen yapı kuralı bu cümleyi yasaklıyordu).
      "Anayasanın ilk üç maddesi değiştirilemez.",
      "Anayasanın ikinci maddesi Cumhuriyetin niteliklerini sayar.",
      "Diğer iki şık yanlış.",
      // "ışık" şık değildir.
      "Kırmızı ve mavi ışıklar sırasıyla farklı açılarla kırılır.",
    ]) expect(refersToOptionOrder(text), text).toBe(false);
  });

  it("yazar ve denetçinin okuduğu kural yeni örneği de söyler", () => {
    expect(OPTION_ORDER_RULE).toContain("'ilk iki ifade'");
    expect(OPTION_ORDER_RULE).toContain("diğer seçenekler(deki …) sırasıyla");
  });
});

describe("test denetçisi şık sırası kuralını yazarla aynı metinden okur", () => {
  it("belgeli ve belgesiz denetçi OPTION_ORDER_RULE'u aynen taşır", async () => {
    const { quizVerifySystem } = await import("@/lib/learning/teacher-quiz");
    expect(quizVerifySystem("document")).toContain(OPTION_ORDER_RULE);
    expect(quizVerifySystem("topic")).toContain(OPTION_ORDER_RULE);
  });
});
