import { describe, expect, it } from "vitest";
import { matchUnit } from "@/lib/content-pool/attach-match";

const units = [
  { topicId: "t1", unitTitle: "Hikâye", outcomeTexts: ["Hikâyede olay örgüsünü belirler.", "Anlatıcı ve bakış açısını belirler."] },
  { topicId: "t2", unitTitle: "Şiir", outcomeTexts: ["Şiirde ahenk unsurlarını belirler."] },
];

describe("belge konusu → hazır ünite", () => {
  it("ünite adıyla eşleşir", () => expect(matchUnit("Hikâye Türleri", units)?.topicId).toBe("t1"));
  it("kazanımla eşleşir", () => expect(matchUnit("Anlatıcı ve Bakış Açısı", units)?.topicId).toBe("t1"));
  it("ilgisiz konu eşleşmez", () => expect(matchUnit("Türev ve İntegral", units)).toBeNull());
});
