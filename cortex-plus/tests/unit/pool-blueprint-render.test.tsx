// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fireEvent, render, screen } from "@testing-library/react";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { sealStoredLesson } from "@/lib/learning/lesson-play-v3";
import { poolLessonV3 } from "@/lib/content-pool/serve";

Element.prototype.scrollIntoView = vi.fn();

const technique = "Boşluktan önceki ve sonraki sözcüklere bak; anlamca uymayan ve eşdizim kurmayan şıkları ele, kalan iki şıkta bağlamı karşılaştır.";
// Anlatım, teknik kutusuyla tek bir ortak ifade paylaşıyor (gerçek YDS dersindeki durum).
const explanation =
  "Bu ünitede akademik isim ve fiillerin anlamını bağlamdan çıkarmayı öğreniyoruz. Boşluktan önceki ve sonraki sözcüklere bak; anlamca uymayan seçenekler genellikle hemen elenir. " +
  "Örneğin 'conduct research' kalıbında fiil isimle eşdizim kurar ve bu bilgi çoğu soruda doğru seçeneği gösterir. ".repeat(3);

const blueprint = {
  diagram: { kind: "process_network", title: "Çözüm akışı kartı", items: ["Oku: cümleyi oku", "Ele: uymayanı ele"] },
  table: { caption: "Akademik eş anlamlılar tablosu", columns: ["Kelime", "Eş"], rows: [["obtain", "acquire"], ["reveal", "disclose"]] },
  spot: { title: "Sinyal kelimeler kutusu", points: ["however zıtlık bildirir", "thus sonuç bildirir"] },
  technique: { title: "Şık eleme tekniği", body: technique },
  contrast: { long: "Uzun yol: her şıkkı tek tek cümleye yerleştir.", fast: "Kısa yol: eşdizim kuramayan şıkları önce ele." },
  trap: { title: "Benzer yazım tuzağı", wrong: "affect ile effect aynı anlamdadır.", right: "affect fiil, effect çoğunlukla isimdir." },
  check: { stem: "The team will ---- research on climate.", options: ["conduct", "affect", "obtain", "reveal"], answer: 0, explanation: "conduct research doğru eşdizimdir." },
};

describe("havuz iskelet blokları ders ekranında kendi kartıyla görünür", () => {
  for (const program of ["kpss", "tus", "dus", "ales", "dgs", "yds"]) {
    it(program, () => {
      const lesson = poolLessonV3(
        { title: "Ünite", overview: "Genel bakış metni yeterince uzun olmalı ki ders kurulsun.", sections: [{ outcome_code: "K1", heading: "Akademik isimler", explanation, key_points: ["a", "b"], blueprint }], summary: "Bir. İki.", cards: [] } as never,
        "Ünite",
        program,
      );
      const { container } = render(<ExamLessonSteps lesson={sealStoredLesson(lesson, { format: 3 }) as never} closeHref="/x" />);
      fireEvent.click(screen.getAllByRole("button", { name: /Devam et|Başla/ })[0]!);
      const notes = [...container.querySelectorAll(".als-note")].map((n) => n.textContent ?? "");
      expect(notes.some((t) => t.includes("Şık eleme tekniği"))).toBe(true);
      expect(notes.some((t) => t.includes("Sinyal kelimeler kutusu"))).toBe(true);
      expect(container.querySelector(".als-reference-table")?.textContent).toContain("Akademik eş anlamlılar tablosu");
      const text = container.textContent ?? "";
      for (const s of ["Çözüm akışı kartı", "Benzer yazım tuzağı", "Uzun yol ↔", "HIZLI SINAV"]) expect(text).toContain(s);
    });
  }
});

describe("sabit üst çubuk içeriği örtmez", () => {
  it("adım değişince ders başı çubuğun altına kaydırılır ve çubuk yüksekliği yayınlanır", () => {
    const lesson = poolLessonV3(
      { title: "Ünite", overview: "Genel bakış metni yeterince uzun olmalı ki ders kurulsun.", sections: [{ outcome_code: "K1", heading: "Akademik isimler", explanation, key_points: ["a", "b"], blueprint }], summary: "Bir. İki.", cards: [] } as never,
      "Ünite",
      "yds",
    );
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: -400, height: 88, bottom: 0, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    const { container } = render(<ExamLessonSteps lesson={sealStoredLesson(lesson, { format: 3 }) as never} closeHref="/x" />);
    expect((container.querySelector(".als") as HTMLElement).style.getPropertyValue("--als-top-h")).toBe("88px");
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: /Devam et|Başla/ })[0]!);
    expect(spy).toHaveBeenCalledWith({ block: "start" });
    rect.mockRestore();
  });
});
