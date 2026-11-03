import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createLiveChannel, LIVE_HEADER, LIVE_TRAILER_MARK, splitLiveBody } from "@/lib/ai/chat-live";
import { shouldAutoOpenLesson } from "@/lib/learning/lesson-open";
import { pickPoolTopic } from "@/lib/learning/prep-chat-grounding";
import { oralHasAnswerText } from "@/lib/learning/node/oral";
import { prepScopedStates } from "@/lib/mastery-map/load";

const base = { kind: "lesson", reviewSaved: false, replay: false, rewrite: false, hasDocuments: false, poolReady: true };

describe("A/D: ders kurulum kartı atlanır", () => {
  it("belgesiz + havuz dersi hazır → doğrudan açılır", () => expect(shouldAutoOpenLesson(base)).toBe(true));
  it("belgeli hazırlık kurulum kartını görür", () => expect(shouldAutoOpenLesson({ ...base, hasDocuments: true })).toBe(false));
  it("havuz yoksa kurulum kartı", () => expect(shouldAutoOpenLesson({ ...base, poolReady: false })).toBe(false));
  it("Farklı anlat her zaman doğrudan", () => expect(shouldAutoOpenLesson({ ...base, hasDocuments: true, poolReady: false, rewrite: true })).toBe(true));
  it("kayıtlı ders / tekrar / ders dışı açılmaz", () => {
    expect(shouldAutoOpenLesson({ ...base, reviewSaved: true })).toBe(false);
    expect(shouldAutoOpenLesson({ ...base, replay: true })).toBe(false);
    expect(shouldAutoOpenLesson({ ...base, kind: "quiz" })).toBe(false);
  });
});

describe("B: canlı sohbet akışı", () => {
  it("ilk token'da yanıt açılır, kuyruk taslağı değiştirir", async () => {
    const live = createLiveChannel(Date.now());
    live.write("yok sayılır");
    expect(live.started).toBe(false);
    live.enable(false);
    live.write("Merhaba");
    live.write(` dünya${LIVE_TRAILER_MARK}`);
    expect(live.started).toBe(true);
    expect(live.firstTokenMs).not.toBeNull();
    live.finish({ content: "Merhaba dünya!", messageId: "m1", sources: 1 });
    const res = await live.response;
    expect(res.headers.get(LIVE_HEADER)).toBe("1");
    const { draft, trailer } = splitLiveBody(await res.text());
    expect(draft).toBe("Merhaba dünya");
    expect(trailer).toEqual({ content: "Merhaba dünya!", messageId: "m1", sources: 1 });
  });
  it("kuyruksuz gövde taslaktır", () => expect(splitLiveBody("abc")).toEqual({ draft: "abc", trailer: null }));
  it("havuz konusu soruya göre seçilir", () => {
    expect(pickPoolTopic(["Hücre bölünmesi", "Fotosentez ve solunum"], "fotosentez nasıl olur?")).toBe("Fotosentez ve solunum");
    expect(pickPoolTopic(["Hücre bölünmesi"], "merhaba")).toBe("Hücre bölünmesi");
    expect(pickPoolTopic([], "x")).toBeNull();
  });
});

describe("C: net yalnız bu hazırlığın verisinden", () => {
  it("yanıt ve deneme kanıtı Beta durumuna katlanır", () => {
    const s = prepScopedStates(
      [{ outcome_id: "o1", correct: true }, { outcome_id: "o1", correct: false }],
      [{ outcome_ids: ["o1", "o2"], weight: 0.5, correct: true }],
    );
    expect(s.get("o1")).toEqual({ alpha: 2.5, beta: 2, n: 3 });
    expect(s.get("o2")).toEqual({ alpha: 1.5, beta: 1, n: 1 });
  });
  it("kanıt yoksa boş", () => expect(prepScopedStates([], []).size).toBe(0));
});

describe("Sözlü: boş cevap hakeme gitmez", () => {
  it("boş cevap → false, dolu cevap → true", () => {
    expect(oralHasAnswerText([{}], { "0": "" })).toBe(false);
    expect(oralHasAnswerText([{}], { "0": "  " })).toBe(false);
    expect(oralHasAnswerText([{}, {}], { "1": "Fotosentez ışıkla olur" })).toBe(true);
  });
});
