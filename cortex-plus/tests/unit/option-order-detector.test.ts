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

  it("şıkkı içeriğiyle anan açıklamaya dokunmaz", () => {
    for (const text of [
      "Konfederasyon uluslararası sözleşmeyle kurulur; federasyon ise anayasaya dayanır.",
      "İlk iki yılda baş çevresi beyin büyümesini yansıtır.",
      "Bu ifade yanlıştır; doğrusu, egemenliğin topluma ait olmasıdır.",
      "Sırasıyla ülke, insan topluluğu ve egemenlik aranır.",
    ]) expect(refersToOptionOrder(text), text).toBe(false);
  });

  it("yazar ve denetçinin okuduğu kural yeni örneği de söyler", () => {
    expect(OPTION_ORDER_RULE).toContain("'ilk iki ifade'");
    expect(OPTION_ORDER_RULE).toContain("diğer seçenekler(deki …) sırasıyla");
  });
});
