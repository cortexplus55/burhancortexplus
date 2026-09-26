import { describe, expect, it } from "vitest";
import {
  gradeAgainstExpected,
  parseCheckExpected,
  stripCheckMarker,
  validateCheckQuestion,
} from "@/lib/learning/check-question";

describe("validateCheckQuestion", () => {
  it("tam denk sınırlayıcı sorusunu reddeder veya sayıları değiştirir (A)", () => {
    const q =
      "8 mol A ve 4 mol B ile 2A + B → C tepkimesinde sınırlayıcı bileşen hangisidir?";
    const result = validateCheckQuestion(q);
    if (result.ok) {
      expect(result.expected?.answer).not.toBe("hiçbiri sınırlayıcı değil");
      expect(result.question).not.toBe(q);
    } else {
      expect(result.reason.toLocaleLowerCase("tr")).toMatch(/denk|eşit|sınırlayıcı/);
    }
  });

  it("eşit kesir karşılaştırmasını reddeder (matematik)", () => {
    const result = validateCheckQuestion("3/6 ile 4/8, hangisi büyük?");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.toLocaleLowerCase("tr")).toMatch(/eşit/);
  });

  it("mol kütlesi olmayan gram sorusunu reddeder (B)", () => {
    const result = validateCheckQuestion(
      "10 gram C ve 5 gram D ile 4C + 3D → 2E tepkimesinde sınırlayıcı hangisidir?",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.toLocaleLowerCase("tr")).toMatch(/mol kütle|çözülemez/);
  });

  it("faiz oranı verilmeyen ekonomi sorusunu reddeder", () => {
    const result = validateCheckQuestion(
      "1000 lira anapara ile 2 yıl sonraki tutarı faizle hesapla.",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.toLocaleLowerCase("tr")).toMatch(/faiz/);
  });

  it("çözülebilir sınırlayıcı sorusunu beklenen cevapla geçirir", () => {
    const result = validateCheckQuestion(
      "2 mol A ve 1 mol B ile 2A + B → C tepkimesinde sınırlayıcı bileşen hangisidir?",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expected?.kind).toBe("limiting");
    expect(result.expected?.answer.toLocaleLowerCase("tr")).toMatch(/a|hiçbiri/);
  });

  it("tarih nitel sorusunu açık uçlu geçirir", () => {
    const result = validateCheckQuestion(
      "Kurtuluş Savaşı'nda Doğu Cephesi neden erken kapandı?",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expected?.kind).toBe("open");
  });
});

describe("check expected marker", () => {
  it("saklanan beklenen cevabı okur ve öğrenci cevabını hükümler", () => {
    const content =
      'Soru burada.\n\n[[cek:{"kind":"limiting","answer":"A"}]]\n\n[[chip:x|y]]';
    const expected = parseCheckExpected(content);
    expect(expected?.answer).toBe("A");
    expect(gradeAgainstExpected("Sınırlayıcı A'dır.", expected!)).toBe("dogru");
    expect(gradeAgainstExpected("B sınırlayıcı.", expected!)).toBe("yanlis");
    expect(stripCheckMarker(content)).not.toContain("[[cek:");
  });
});
