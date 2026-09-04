import { describe, expect, it } from "vitest";
import { mergeTranscript } from "@/lib/learning/voice-recorder";

describe("mergeTranscript", () => {
  it("boş alana söyleneni yazar", () => {
    expect(mergeTranscript("", "türev nedir")).toBe("türev nedir");
  });

  it("yazılmış metni silmez, sonuna ekler", () => {
    expect(mergeTranscript("Soru: ", "limit nasıl alınır")).toBe(
      "Soru: limit nasıl alınır",
    );
  });

  it("art arda iki konuşmayı birleştirir", () => {
    const first = mergeTranscript("", "birinci cümle");
    expect(mergeTranscript(first, "ikinci cümle")).toBe(
      "birinci cümle ikinci cümle",
    );
  });

  it("boş çözümleme yazılana dokunmaz", () => {
    expect(mergeTranscript("yarım kalan cümle", "   ")).toBe(
      "yarım kalan cümle",
    );
  });

  it("çözümlemenin baş ve sonundaki boşluğu kırpar", () => {
    expect(mergeTranscript("a", "  b  ")).toBe("a b");
  });
});
