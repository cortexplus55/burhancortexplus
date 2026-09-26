// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  OralAnswerReview,
  OralEndDialog,
  OralPreflightDialog,
  OralResults,
  OralReviewTimeDialog,
  OralTeacherCustomize,
  OralTopicPick,
} from "@/components/parity/oral-exam-flow";
import {
  EMPTY_ORAL_ANSWER_NOTE,
  formatTopicPct,
  letterGrade,
  ORAL_PREFLIGHT,
  ORAL_VOICE_TOPIC_MAX,
  oralHeadline,
  oralVoiceTopicLabel,
  oralLiveStatus,
  oralTeacherStyleLine,
  oralVoicePercent,
  oralWrittenPercent,
  reviewItemsFromQuestions,
  reviewItemsFromTranscript,
  topicStatusPct,
} from "@/lib/learning/oral-exam-chrome";

afterEach(cleanup);

const topics = [
  { id: "a", label: "Termodinamik Sistemler ve Temel Kavramlar", pct: 0 },
  { id: "b", label: "Basınç ve Sıcaklık İlkeleri", pct: 0 },
];

describe("oral exam chrome helpers", () => {
  it("keeps the voice topic label inside the 120 character cap", () => {
    const long = "Termodinamik Sistemler ve Temel Kavramlar ile Enerji Analizi";
    const labels = [long, "Basınç ve Sıcaklık İlkeleri", "Saf Maddelerin Faz Değişimleri"];
    const joined = labels.join(", ");
    expect(joined.length).toBeGreaterThan(ORAL_VOICE_TOPIC_MAX);

    const voice = oralVoiceTopicLabel(labels);
    expect(voice.length).toBeLessThanOrEqual(ORAL_VOICE_TOPIC_MAX);
    expect(voice.length).toBeGreaterThan(0);
    expect(voice.startsWith("Termodinamik")).toBe(true);
    expect(voice.endsWith("+2 konu")).toBe(true);

    const one = oralVoiceTopicLabel([long]);
    expect(one).toBe(long);
    expect(oralVoiceTopicLabel([`${long} ${long} ${long}`]).length).toBeLessThanOrEqual(
      ORAL_VOICE_TOPIC_MAX,
    );
  });

  it("feeds the clamped label to the live voice tutor", () => {
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    const start = session.indexOf("<ExamVoiceTutor");
    const end = session.indexOf("/>", start);
    const tutor = session.slice(start, end);
    expect(tutor).toContain("topicLabel={oralVoiceLabel}");
    expect(tutor).not.toContain("oralTopicLabel");
  });

  it("prints topic progress as %0", () => {
    expect(topicStatusPct("ready")).toBe(0);
    expect(topicStatusPct("done")).toBe(100);
    expect(formatTopicPct(0)).toBe("%0");
  });

  it("grades voice from gradedRatios; without them stays 0 (not completion %)", () => {
    expect(oralVoicePercent([])).toBe(0);
    expect(oralHeadline(0)).toBe("Daha fazla pratik yapmalısın");
    const full = reviewItemsFromTranscript([
      { role: "assistant", content: "Soru bir" },
      { role: "user", content: "Cevap bir" },
      { role: "assistant", content: "Soru iki" },
      { role: "user", content: "Cevap iki" },
      { role: "assistant", content: "Soru üç" },
      { role: "user", content: "Cevap üç" },
    ]);
    expect(full).toHaveLength(3);
    // Grade yoksa dolu cevap oranı değil 0.
    expect(
      oralVoicePercent([
        { role: "assistant", content: "Soru bir" },
        { role: "user", content: "Cevap bir" },
        { role: "assistant", content: "Soru iki" },
        { role: "user", content: "Cevap iki" },
        { role: "assistant", content: "Soru üç" },
        { role: "user", content: "Cevap üç" },
      ]),
    ).toBe(0);
    expect(oralVoicePercent([], 3, [1, 1, 1])).toBe(100);
    expect(oralVoicePercent([], 3, [1, 0, 0])).toBe(33);
    // Deprecated helper still maps bands; UI no longer shows letters.
    expect(letterGrade(0)).toBe("F");
    expect(letterGrade(100)).toBe("A");
    expect(oralWrittenPercent(1, 2)).toBe(50);
  });

  it("uses the live orb captions from the oral exam", () => {
    expect(oralLiveStatus("speaking")).toBe("Öğretmen konuşuyor…");
    expect(oralLiveStatus("listening")).toBe("Öğretmen dinliyor");
    expect(oralLiveStatus("thinking")).toBe("Öğretmen düşünüyor…");
  });

  it("keeps the harsh teacher firm without insults", () => {
    expect(oralTeacherStyleLine("harsh")).toMatch(/hakaret etme/);
    expect(oralTeacherStyleLine("helpful")).toMatch(/ipucu/);
    expect(oralTeacherStyleLine("strict")).toMatch(/ipucu verme/);
  });

  it("explains a missing written answer in the review", () => {
    const [item] = reviewItemsFromQuestions(
      [{ prompt: "Hal fonksiyonu nedir?", expectedPoints: ["Yola bağlı değildir."] }],
      { "0": "   " },
    );
    expect(item.answer).toBe("");
    expect(item.solution).toContain(EMPTY_ORAL_ANSWER_NOTE);
  });
});

describe("oral exam chrome screens", () => {
  it("keeps Devam et disabled until a topic is checked", () => {
    const selected: string[] = [];
    const { rerender } = render(
      <OralTopicPick
        topics={topics}
        selected={selected}
        onToggle={() => undefined}
        onContinue={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "Konuları seç" })).toBeTruthy();
    const continueButton = screen.getByRole("button", { name: "Devam et" }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    expect(screen.getAllByText("%0")).toHaveLength(2);

    rerender(
      <OralTopicPick
        topics={topics}
        selected={["a"]}
        onToggle={() => undefined}
        onContinue={() => undefined}
        onClose={() => undefined}
      />,
    );
    const enabled = screen.getByRole("button", { name: "Devam et" }) as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
    expect(screen.getByRole("button", { name: /Termodinamik/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("shows one voice and the three teacher moods", () => {
    render(
      <OralTeacherCustomize
        moodId="helpful"
        onMood={() => undefined}
        onBack={() => undefined}
        onClose={() => undefined}
        onStart={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "Öğretmenini özelleştir" })).toBeTruthy();
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("Sıkı sınav görevlisi")).toBeTruthy();
    expect(screen.getByText("Yardımcı öğretmen")).toBeTruthy();
    expect(screen.getByText("Zorlayıcı öğretmen")).toBeTruthy();
    const start = screen.getByRole("button", { name: "Sözlü Deneme Sınavını Başlat" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    expect(
      screen.getByRole("option", { name: /Yardımcı öğretmen/ }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("lists the preflight checks and Hazırım", () => {
    const seen: string[] = [];
    render(<OralPreflightDialog onConfirm={() => seen.push("go")} />);
    expect(screen.getByRole("dialog", { name: ORAL_PREFLIGHT.title })).toBeTruthy();
    for (const item of ORAL_PREFLIGHT.items) {
      expect(screen.getByText(item)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Hazırım" }));
    expect(seen).toEqual(["go"]);
  });

  it("confirms ending and opening results", () => {
    const actions: string[] = [];
    const { rerender } = render(
      <OralEndDialog onStay={() => actions.push("stay")} onConfirm={() => actions.push("yes")} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sınava dön" }));
    fireEvent.click(screen.getByRole("button", { name: "Evet, gönder" }));
    rerender(<OralReviewTimeDialog onSeeResults={() => actions.push("results")} />);
    fireEvent.click(screen.getByRole("button", { name: "Sonuçlarımı gör" }));
    expect(actions).toEqual(["stay", "yes", "results"]);
  });

  it("shows a percent and headline without a letter grade, then the empty-answer review", () => {
    const actions: string[] = [];
    const { rerender } = render(
      <OralResults
        topicLabel="Termodinamik Sistemler ve Temel Kavramlar"
        pct={0}
        onReview={() => actions.push("review")}
        onRepeat={() => undefined}
        nextHref="/deneme-sinavlari/prep"
      />,
    );
    expect(screen.getByText("Daha fazla pratik yapmalısın")).toBeTruthy();
    expect(screen.queryByText("F")).toBeNull();
    expect(screen.getByText("%0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cevaplarımı gözden geçir" }));

    rerender(
      <OralAnswerReview
        items={[
          {
            question: "Hal fonksiyonu nedir?",
            answer: "",
            solution: `Sesli yanıt kaydedilmedi. ${EMPTY_ORAL_ANSWER_NOTE}`,
          },
        ]}
        index={0}
        tab="ai"
        onTab={() => actions.push("tab")}
        onIndex={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText("Soru 1")).toBeTruthy();
    expect(screen.getByText("%0 puan")).toBeTruthy();
    expect(screen.getAllByText(/Eksik kalan|Sesli yanıt kaydedilmedi/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Senin cevabın" }));
    expect(actions).toContain("review");
    expect(actions).toContain("tab");
  });
});
