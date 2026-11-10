// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TutorModeSwitcher } from "@/components/chat/tutor-mode-switcher";
import { TutorReplyView } from "@/components/chat/tutor-reply-view";
import {
  activeQuestionLine,
  chatTurnBlock,
  chatTurnLines,
  readChatTurn,
  stepTurnLine,
  STEP_FULL_SOLUTION_LINE,
} from "@/lib/ai/chat-turn-lines";
import { chatSolveNeedsGuard } from "@/lib/ai/chat-solve-check";
import { teacherStyleLine } from "@/lib/ai/teacher-tutor";
import { runTeacherTutor } from "@/lib/ai/teacher-tutor-run";
import { answerFirstLine, hasOwnSolution, wantsDirectAnswer } from "@/lib/learning/tutor-answer";
import {
  LIVE_TUTOR_STYLE_OPTIONS,
  isPacedStepReply,
  pacedStepNumber,
  SOCRATIC_QUICK_CHIPS,
  STEP_FULL_SOLUTION_PROMPT,
  stepQuickChips,
  tutorStyleDescription,
} from "@/lib/learning/tutor-style";
import {
  activeQuestion,
  asksFullSolution,
  asksNewExercise,
  followUpKind,
  looksLikeProblem,
  planTurn,
} from "@/lib/learning/tutor-turn";

/*
  Güven paketi (10 Kasım 2026), Görev 5: üç anlatım stili.
  a) Seçili stilin altında tek satır açıklama; b) Adım Adım gerçekten adımlar; c) takip mesajı aktif soruya kilitlenir.
  Örnek sorular nötr sayılarla ve farklı derslerden; üretim kodu ve istemler örnek taşımaz.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => cleanup());

const MATH_PROBLEM = "Bir kırtasiyede 6 defter 84 lira ise 9 defter kaç lira eder?";
const CHOICE_PROBLEM = "Paragrafın ana düşüncesi hangisidir?\nA) Okumak\nB) Yazmak\nC) Dinlemek\nD) Konuşmak";
const STEP_ONE_REPLY =
  "**1. adım:** Verilenleri yazalım ve birim fiyat için oranı kuralım.\n\n1. adım netleştiyse 'Devam et' yaz, 2. adıma geçelim.";
const STEP_TWO_REPLY =
  "**2. adım:** Birim fiyatı bulmak için bölme işlemini kuruyoruz.\n\nBu adım netleştiyse **Devam et** yaz, 3. adıma geçelim.";

describe("5a: stil açıklamaları tek kaynakta", () => {
  it("üç metin birebir", () => {
    expect(tutorStyleDescription("hints_first")).toBe(
      "Cevabı hemen vermez; ipucu ve yönlendirici sorularla çözümü senin bulmanı sağlar.",
    );
    expect(tutorStyleDescription("step_by_step")).toBe(
      "Çözümü tek seferde dökmez; 1. adımdan başlar ve sen 'Devam et' dedikçe sıradaki adıma geçer.",
    );
    expect(tutorStyleDescription("direct_solve")).toBe(
      "Tüm işlem adımlarını ve nihai sonucu tek mesajda eksiksiz gösterir.",
    );
    expect(LIVE_TUTOR_STYLE_OPTIONS.map((option) => option.id)).toEqual(["hints_first", "step_by_step", "direct_solve"]);
  });

  it("bileşen metni kendi yazmaz; açıklama stil dosyasından gelir", () => {
    const source = read("src/components/chat/tutor-mode-switcher.tsx");
    expect(source).toContain("LIVE_TUTOR_STYLE_OPTIONS");
    expect(source).not.toMatch(/Cevabı hemen vermez|tek seferde dökmez|tek mesajda eksiksiz/);
  });

  it("moda dokununca açıklama açılır, seçili moda yeniden dokununca kapanır", () => {
    const onChange = vi.fn();
    const { rerender } = render(<TutorModeSwitcher value="hints_first" onChange={onChange} />);
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Adım Adım" }));
    expect(onChange).toHaveBeenCalledWith("step_by_step");
    rerender(<TutorModeSwitcher value="step_by_step" onChange={onChange} />);
    expect(screen.getByRole("status").textContent).toContain(tutorStyleDescription("step_by_step"));

    // Seçili moda dokunmak modu değiştirmez; açıklamayı kapatıp açar.
    fireEvent.click(screen.getByRole("radio", { name: "Adım Adım" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Adım Adım" }));
    expect(screen.getByRole("status").textContent).toContain("1. adımdan başlar");
  });

  it("mesaj gönderilince açıklama kapanır ve kendiliğinden geri gelmez", () => {
    const { rerender } = render(<TutorModeSwitcher value="direct_solve" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("radio", { name: "Doğrudan Çöz" }));
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<TutorModeSwitcher value="direct_solve" onChange={() => undefined} disabled />);
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<TutorModeSwitcher value="direct_solve" onChange={() => undefined} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("her düğmenin ipucu açıklamayı taşır; seçili düğme açıklamaya bağlanır", () => {
    render(<TutorModeSwitcher value="hints_first" onChange={() => undefined} />);
    for (const option of LIVE_TUTOR_STYLE_OPTIONS) {
      expect(screen.getByRole("radio", { name: option.label }).getAttribute("title")).toContain(option.description);
    }
    const selected = screen.getByRole("radio", { name: "Sokratik (Önce İpucu)" });
    fireEvent.click(selected);
    expect(selected.getAttribute("aria-describedby")).toBe(screen.getByRole("status").id);
  });

  it("stil: renkler değişkenden, uzun cümle sarar, dokunma alanı 44 px", () => {
    const css = read("src/styles/chat-teaching.css");
    const block = css.slice(css.indexOf(".cp-tutor-mode-desc {"), css.indexOf(".cp-tutor-chip.cp-tutor-chip--step:disabled"));
    expect(block).toMatch(/\.cp-tutor-mode-desc \{[^}]*color: var\(--c-text\)/);
    expect(block).toMatch(/\.cp-tutor-mode-desc \{[^}]*overflow-wrap: anywhere/);
    expect(block).toMatch(/\.cp-tutor-mode-desc \{[^}]*max-width: 100%/);
    expect(block).toMatch(/\.cp-sor-controls \.cp-tutor-mode-desc \{[^}]*flex: 1 0 100%/);
    // 36 px görünen hap (34 px iç kutu) + üstten ve alttan 5 px görünmez alan = 44 px.
    expect(block).toMatch(/\.cp-tutor-mode-pill::after \{[^}]*inset: -5px 0/);
    expect(block).toMatch(/\.cp-tutor-chip\.cp-tutor-chip--step \{[^}]*min-height: 36px/);
    expect(block).toMatch(/\.cp-tutor-chip\.cp-tutor-chip--step::after \{[^}]*inset: -5px 0/);
    // Telefonda çip satırı yana kayar ve taşan alanı kırpar: kutunun kendisi 44 px.
    expect(css).toMatch(/@media \(max-width: 640px\) \{\s*\.cp-tutor-chip\.cp-tutor-chip--step \{\s*min-height: 44px;/);
    // Sabit renk yok: yalnız tasarım değişkenleri.
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});

describe("5b: Adım Adım ilk turda nihai cevabı yazdırmaz", () => {
  it("kök neden kapandı: bu modda 'ilk cümle tam cevap' satırı problemde yazılmaz", () => {
    expect(wantsDirectAnswer(MATH_PROBLEM, "step_by_step")).toBe(false);
    expect(answerFirstLine(MATH_PROBLEM, "step_by_step")).not.toMatch(/İLK CÜMLE TAM CEVAP/);
    expect(answerFirstLine(CHOICE_PROBLEM, "step_by_step")).not.toMatch(/İLK CÜMLE TAM CEVAP/);
    // Sokratik modda da "kaç" ile biten problem cevabı ilk cümleye çekmez.
    expect(answerFirstLine(MATH_PROBLEM, "hints_first")).not.toMatch(/İLK CÜMLE TAM CEVAP/);
    // Doğrudan Çöz ve açık istek değişmedi.
    expect(answerFirstLine(MATH_PROBLEM, "direct_solve")).toMatch(/İLK CÜMLE TAM CEVAP/);
    expect(answerFirstLine(`${MATH_PROBLEM} Direkt çöz.`, "step_by_step")).toMatch(/İLK CÜMLE TAM CEVAP/);
    // Kavram sorusu üç modda da ilk cümlede cevaplanır.
    for (const style of ["step_by_step", "hints_first", "direct_solve"] as const) {
      expect(answerFirstLine("Yoğunluk nedir?", style)).toMatch(/İLK CÜMLE TAM CEVAP/);
    }
  });

  it("verileni eşitlik olan soru öğrencinin çözümü sayılmaz", () => {
    expect(hasOwnSolution("3x + 5 = 26 ise x kaçtır?")).toBe(false);
    expect(answerFirstLine("3x + 5 = 26 ise x kaçtır?", "step_by_step")).not.toMatch(/kendi çözümünü yazdı/);
    // Öğrencinin gerçek denemesi hâlâ deneme.
    expect(hasOwnSolution("3x + 5 = 26, x = 7 buldum")).toBe(true);
    expect(hasOwnSolution("x = 7")).toBe(true);
  });

  it("mod satırı sözleşmeyi söyler: tek adım, davet, nihai cevap son adımda", () => {
    const line = teacherStyleLine("step_by_step");
    expect(line).toMatch(/ADIM ADIM MOD \(kesin\)/);
    expect(line).toMatch(/YALNIZ sıradaki tek adımı yaz/);
    expect(line).toMatch(/'Devam et' davetiyle bitir/);
    expect(line).toMatch(/nihai cevap, doğru şık ya da sayısal sonuç YAZILMAZ/);
    expect(line).toMatch(/'cevabı ve tüm adımları göster'/);
    // Selamlaşma ve kavram sorusunda zorlama yok.
    expect(line).toMatch(/Selamlaşmada, kavram sorusunda .* bu kural geçmez/);
  });

  it("ilk tur satırı: yalnız 1. adım, cevap yok, 'Devam et' kapanışı", () => {
    const turn = readChatTurn({ message: MATH_PROBLEM, style: "step_by_step", history: [], baseMood: "neutral" });
    expect(turn.plan).toMatchObject({ problem: true, pacedStep: 1, followUp: null, fullSolution: false });
    const lines = chatTurnLines(turn, "step_by_step");
    expect(lines).toEqual([stepTurnLine(1)]);
    expect(lines[0]).toMatch(/YALNIZ 1\. adımı yaz: verilenler, kurulacak bağıntı ve ilk işlemin kurgusu/);
    expect(lines[0]).toMatch(/Nihai cevabı, doğru şıkkı, sayısal sonucu ve sonraki adımları YAZMA/);
    expect(lines[0]).toMatch(/1\. adım netleştiyse 'Devam et' yaz, 2\. adıma geçelim/);
    // Doğruluk korunur: çözüm içeride tamamlanır.
    expect(lines[0]).toMatch(/Çözümü içinden sonuna kadar yap ve sağla/);
    // Şıklı sözel soru da adımlanır.
    expect(planTurn({ message: CHOICE_PROBLEM, style: "step_by_step", history: [] }).pacedStep).toBe(1);
  });

  it("selamlaşma ve kavram sorusunda adım satırı yok; öbür modlarda hiç yok", () => {
    for (const message of ["Merhaba, nasılsın?", "Yoğunluk nedir?", "Bu konuyu biraz anlatır mısın?"]) {
      const turn = readChatTurn({ message, style: "step_by_step", history: [], baseMood: "neutral" });
      expect(chatTurnLines(turn, "step_by_step"), message).toEqual([]);
    }
    for (const style of ["hints_first", "direct_solve"] as const) {
      const turn = readChatTurn({ message: MATH_PROBLEM, style, history: [], baseMood: "neutral" });
      expect(chatTurnLines(turn, style)).toEqual([]);
    }
  });

  it("öğrenci tam çözümü açıkça isterse adımlama yapılmaz", () => {
    const turn = readChatTurn({
      message: `Bu soruyu eksiksiz adım adım çöz: ${MATH_PROBLEM}`,
      style: "step_by_step",
      history: [],
      baseMood: "neutral",
    });
    expect(turn.plan).toMatchObject({ problem: true, fullSolution: true, pacedStep: null });
    expect(chatTurnLines(turn, "step_by_step")).toEqual([STEP_FULL_SOLUTION_LINE]);
    // Soru getiren mesajdaki yalın "çöz" tam çözüm isteği değildir.
    expect(asksFullSolution(`Şu soruyu çöz: ${MATH_PROBLEM}`)).toBe(false);
    expect(asksFullSolution("Tam çözümü göster.")).toBe(true);
    expect(asksFullSolution(STEP_FULL_SOLUTION_PROMPT)).toBe(true);
  });

  it("'Devam et' sıradaki adımı ister; son adımda cevap ve sağlama", () => {
    const history = [
      { role: "user", content: MATH_PROBLEM },
      { role: "assistant", content: STEP_ONE_REPLY },
    ];
    const turn = readChatTurn({ message: "Devam et", style: "step_by_step", history, baseMood: "neutral" });
    expect(turn.plan).toMatchObject({ followUp: "continue", pacedStep: 2 });
    const lines = chatTurnLines(turn, "step_by_step");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/AKTİF SORU KİLİDİ/);
    expect(lines[1]).toMatch(/YALNIZ 2\. adımı yaz \("\*\*2\. adım:\*\*" başlığıyla\)/);
    expect(lines[1]).toMatch(/son adımıysa nihai cevabı söyle, sağlamasını yap/);
    expect(lines[1]).toMatch(/'Devam et' yaz, 3\. adıma geçelim/);
  });

  it("çipler: adımlı yanıtın altında sıradaki adım ve tam çözüm", () => {
    expect(pacedStepNumber(STEP_ONE_REPLY)).toBe(1);
    expect(pacedStepNumber(STEP_TWO_REPLY)).toBe(2);
    expect(stepQuickChips(STEP_ONE_REPLY).map((chip) => chip.label)).toEqual([
      "🪜 2. adıma geç",
      "⚡ Cevabı ve tüm adımları göster",
    ]);
    expect(stepQuickChips(STEP_TWO_REPLY)[0]?.label).toBe("🪜 3. adıma geç");
    // Davet yoksa (tam çözüm, kavram cevabı) çip yok; düz "devam etmek istersen" davet değildir.
    expect(isPacedStepReply("1. adım: … 2. adım: … Sonuç budur. Başka bir soruyla devam etmek istersen yaz.")).toBe(false);
    expect(stepQuickChips("Yoğunluk, birim hacimdeki kütledir.")).toEqual([]);
    // Başlık yoksa davetin andığı adımdan okunur; o da yoksa genel etiket.
    expect(pacedStepNumber("Verilenleri yazdık. Hazırsan 'Devam et' yaz, 2. adıma geçelim.")).toBe(1);
    expect(stepQuickChips("Verilenleri yazdık. Hazırsan 'Devam et' yaz.")[0]?.label).toBe("🪜 Sonraki adıma geç");
  });

  it("çiplerin gönderdiği mesajlar sunucuda takip olarak tanınır", () => {
    const [forward, full] = stepQuickChips(STEP_ONE_REPLY);
    expect(followUpKind(forward!.prompt)).toBe("continue");
    expect(followUpKind(full!.prompt)).toBe("full_solution");
    // Sokratik çipler de aynı soruya bağlanır.
    expect(SOCRATIC_QUICK_CHIPS.map((chip) => followUpKind(chip.prompt))).toEqual(["continue", "continue", "full_solution"]);
  });

  it("ekran: Adım Adım modunda çipler yalnız adımlı ve son yanıtta çıkar", () => {
    const onPrompt = vi.fn();
    const { rerender } = render(<TutorReplyView content={STEP_ONE_REPLY} tutorStyle="step_by_step" onPrompt={onPrompt} />);
    const next = screen.getByRole("button", { name: "🪜 2. adıma geç" });
    expect(next.className).toContain("cp-tutor-chip--step");
    fireEvent.click(next);
    expect(onPrompt).toHaveBeenCalledWith("Devam et: 2. adıma geç.");
    fireEvent.click(screen.getByRole("button", { name: "⚡ Cevabı ve tüm adımları göster" }));
    expect(onPrompt).toHaveBeenLastCalledWith(STEP_FULL_SOLUTION_PROMPT);

    // Eski adımın altında çip kalmaz.
    rerender(<TutorReplyView content={STEP_ONE_REPLY} tutorStyle="step_by_step" onPrompt={onPrompt} quickActions={false} />);
    expect(screen.queryByRole("button", { name: "🪜 2. adıma geç" })).toBeNull();
    // Adımlı olmayan yanıtta ve Doğrudan Çöz modunda çip yok.
    rerender(<TutorReplyView content="Yoğunluk, birim hacimdeki kütledir." tutorStyle="step_by_step" onPrompt={onPrompt} />);
    expect(screen.queryByRole("group", { name: "Devam önerileri" })).toBeNull();
    rerender(<TutorReplyView content={STEP_ONE_REPLY} tutorStyle="direct_solve" onPrompt={onPrompt} />);
    expect(screen.queryByRole("group", { name: "Devam önerileri" })).toBeNull();
    // Sokratik çipler değişmedi.
    rerender(<TutorReplyView content="Önce hangi bağıntıyı kurarsın?" tutorStyle="hints_first" onPrompt={onPrompt} />);
    expect(screen.getByRole("button", { name: "💡 Bir ipucu daha ver" }).className).toContain("cp-tutor-chip--socratic");
  });

  it("adımlı turda bağımsız çözüm karşılaştırması yapılmaz (adımın yerine tam çözüm yazılmasın)", () => {
    const route = read("src/app/api/ai/chat/route.ts");
    expect(route).toContain('const pacedTurn = tutorStyle === "step_by_step" && turn.plan.pacedStep != null;');
    expect(route).toContain("if (!pacedTurn) try {");
    expect(route).toContain('preferWhenUnclaimed: Boolean(imageUrl) && (tutorStyle !== "step_by_step" || turn.plan.fullSolution)');
    // Takipte tam çözüm istenirse sağlama konuşmadaki soruya göre yapılır.
    expect(route).toContain("independentSolvePrompt(solveMessage)");
    // Aritmetik kural (satır düşüren sağlama) adımlı turda da çalışır: kapı aynı.
    expect(chatSolveNeedsGuard({ tutorStyle: "step_by_step", hasImage: false, message: "3x + 5 = 26 ise x kaçtır?" })).toBe(true);
    expect(route).toMatch(/chatSolveNeedsGuard\(\{ tutorStyle, hasImage: Boolean\(imageUrl\), message: solveMessage \}\)\) \{\s+content = prepareChatSolution\(content\);/);
  });
});

describe("5c: aktif soru kilidi", () => {
  it("takip ifadeleri modelsiz tanınır (Türkçe büyük-küçük harf dahil)", () => {
    const expected: [string, ReturnType<typeof followUpKind>][] = [
      ["devam et", "continue"],
      ["Devam et.", "continue"],
      ["DEVAM ET", "continue"],
      ["Tamam, devam edelim", "continue"],
      ["sonraki adım", "continue"],
      ["Sıradaki adıma geç", "continue"],
      ["İKİNCİ ADIMA GEÇ", "continue"],
      ["3. adıma geç", "continue"],
      ["bir ipucu daha", "continue"],
      ["[Matematik] devam et", "continue"],
      ["peki sonuç?", "final_answer"],
      ["Sonuç ne?", "final_answer"],
      ["cevap kaç?", "final_answer"],
      ["Cevabı söyle", "final_answer"],
      ["kaç çıkıyor", "final_answer"],
      ["doğru şık hangisi", "final_answer"],
      ["tam çözümü göster", "full_solution"],
      ["Cevabı ve tüm adımları göster.", "full_solution"],
      ["hepsini göster", "full_solution"],
      ["çöz artık", "full_solution"],
    ];
    for (const [message, kind] of expected) expect(followUpKind(message), message).toBe(kind);
  });

  it("yeni soru, yeni veri ve sıradan mesaj takip değildir", () => {
    for (const message of [
      "yeni soru sor",
      "Benzer örnek ver",
      "Aynı mantıkta benzer bir örnek soru üret ve çöz.",
      "Bu konudan bana 3 soru sor ve yanıtlarımı bekle.",
      "peki 12 defter olsaydı cevap kaç?",
      MATH_PROBLEM,
      "Yoğunluk nedir?",
      "Merhaba",
      "Devamsızlık sınırı nedir?",
      "Bu deneyin sonucu neden böyle çıkıyor, biraz daha açıklar mısın lütfen bana tekrar?",
    ]) {
      expect(followUpKind(message), message).toBeNull();
    }
    expect(asksNewExercise("yeni soru sor")).toBe(true);
    expect(asksNewExercise("Buna benzer bir soru ver, cevabı bende kalsın.")).toBe(true);
    expect(asksNewExercise("beni test et")).toBe(true);
    expect(asksNewExercise("devam et")).toBe(false);
  });

  it("çözülecek soru ile kavram sorusu ayrılır", () => {
    expect(looksLikeProblem(MATH_PROBLEM)).toBe(true);
    expect(looksLikeProblem(CHOICE_PROBLEM)).toBe(true);
    expect(looksLikeProblem("3x + 5 = 26 ise x kaçtır?")).toBe(true);
    expect(looksLikeProblem("[Kimya] 2 mol gaz kaç litre hacim kaplar?")).toBe(true);
    expect(looksLikeProblem("Yoğunluk nedir?")).toBe(false);
    expect(looksLikeProblem("Tanzimat Fermanı 1839'da ilan edildi, önemi nedir?")).toBe(false);
    expect(looksLikeProblem("Merhaba")).toBe(false);
  });

  it("aktif soru = konuşmadaki en son çözülmekte olan soru", () => {
    const history = [
      { role: "user", content: "Yoğunluk nedir?" },
      { role: "assistant", content: "Yoğunluk, birim hacimdeki kütledir." },
      { role: "user", content: `[Matematik] ${MATH_PROBLEM}` },
      { role: "assistant", content: STEP_ONE_REPLY },
      { role: "user", content: "devam et" },
      { role: "assistant", content: STEP_TWO_REPLY },
    ];
    // Takip mesajları atlanır; ders etiketi alıntıya girmez.
    expect(activeQuestion(history)).toEqual({ source: "student", text: MATH_PROBLEM });
    // Öğrenci yeni alıştırma istediyse aktif soru öğretmenin sorduğudur: metin alıntılanmaz.
    expect(activeQuestion([...history, { role: "user", content: "benzer bir soru sor" }, { role: "assistant", content: "…" }])).toEqual({
      source: "conversation",
    });
    expect(activeQuestion([])).toBeNull();
  });

  it("kilit satırı üç modda da yazılır: yeni soru uydurma, sayılar aktif sorudan", () => {
    const history = [
      { role: "user", content: MATH_PROBLEM },
      { role: "assistant", content: "İlk olarak birim fiyatı düşünelim. Sence hangi işlemle bulunur?" },
    ];
    for (const style of ["hints_first", "step_by_step", "direct_solve"] as const) {
      for (const message of ["devam et", "sonraki adım", "peki sonuç?", "cevap kaç?"]) {
        const turn = readChatTurn({ message, style, history, baseMood: "neutral" });
        const lock = chatTurnLines(turn, style)[0] ?? "";
        expect(lock, `${style} · ${message}`).toMatch(/AKTİF SORU KİLİDİ \(kesin, bu tur\)/);
        expect(lock).toMatch(/Yeni sayılarla, yeni bir senaryoyla ya da benzer bir örnekle soru UYDURMA/);
        expect(lock).toMatch(/Sayıları ve verilenleri o sorudan birebir al/);
        expect(lock).toContain(`«${MATH_PROBLEM}»`);
      }
    }
  });

  it("isteğe göre: sıradaki adım, nihai cevap ya da tam çözüm", () => {
    const history = [
      { role: "user", content: MATH_PROBLEM },
      { role: "assistant", content: "İlk olarak birim fiyatı düşünelim." },
    ];
    const line = (message: string, style: "hints_first" | "step_by_step" | "direct_solve") =>
      activeQuestionLine(planTurn({ message, style, history }), style);
    expect(line("devam et", "hints_first")).toMatch(/sıradaki ipucunu ya da adımını ver; nihai cevabı öğrenci açıkça istemedikçe yazma/);
    expect(line("devam et", "step_by_step")).toMatch(/Bu sorunun sıradaki adımını ver/);
    expect(line("devam et", "direct_solve")).toMatch(/kaldığı yerden sürdür/);
    // "Cevap kaç?" açık bir cevap isteğidir: Sokratik modda da nihai cevap verilir.
    expect(line("cevap kaç?", "hints_first")).toMatch(/nihai cevabı ilk cümlede ver/);
    expect(line("tam çözümü göster", "step_by_step")).toMatch(/kalan bütün adımlarını ve nihai cevabını tek mesajda ver/);
  });

  it("yeni alıştırma açıkça istenince kilit yok; geçmiş boşken de yok", () => {
    const history = [
      { role: "user", content: MATH_PROBLEM },
      { role: "assistant", content: "…" },
    ];
    const asked = readChatTurn({ message: "yeni soru sor", style: "direct_solve", history, baseMood: "neutral" });
    expect(asked.plan).toMatchObject({ newExercise: true, followUp: null });
    expect(chatTurnLines(asked, "direct_solve")).toEqual([]);
    const cold = readChatTurn({ message: "devam et", style: "step_by_step", history: [], baseMood: "neutral" });
    expect(chatTurnLines(cold, "step_by_step")).toEqual([]);
  });

  it("öğretmenin sorduğu alıştırmada takip: alıntı yok, kural var", () => {
    const history = [
      { role: "user", content: "beni test et" },
      { role: "assistant", content: "Hazırsan başlayalım: …" },
    ];
    const turn = readChatTurn({ message: "cevap kaç?", style: "direct_solve", history, baseMood: "neutral" });
    const lock = chatTurnLines(turn, "direct_solve")[0] ?? "";
    expect(lock).toMatch(/senin sorduğun son alıştırma ya da kontrol sorusu dahil/);
    expect(lock).toMatch(/soru uydurma, hangisini sürdürmek istediğini tek cümleyle sor/);
    expect(lock).not.toContain("«");
  });

  it("satırlar konu örneği taşımaz", () => {
    const text = [stepTurnLine(1), stepTurnLine(3), stepTurnLine(0), STEP_FULL_SOLUTION_LINE, teacherStyleLine("step_by_step")].join("\n");
    // Adım numaraları dışında sayı, birim ya da ders terimi yok.
    expect(text.replace(/\d+\. adım\S*|\*\*\d+\. adım:\*\*/g, "")).not.toMatch(/\d/);
  });
});

describe("istem sözleşmesi: tur satırları sistem isteminin sonunda (sahte modelle)", () => {
  function client(answers: string[]) {
    const create = vi.fn<(request: unknown) => Promise<unknown>>(async () => ({
      choices: [{ message: { content: answers.shift() ?? "" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }));
    return { create, client: { chat: { completions: { create } } } as never };
  }

  it("Adım Adım ilk tur: modele giden sistem istemi adım satırıyla biter, 'ilk cümle tam cevap' içermez", async () => {
    const { create, client: fake } = client([STEP_ONE_REPLY]);
    const turn = readChatTurn({ message: MATH_PROBLEM, style: "step_by_step", history: [], baseMood: "neutral" });
    const turnLines = chatTurnLines(turn, "step_by_step");
    const out = await runTeacherTutor({
      client: fake,
      model: "gpt-6-luna",
      context: { passages: [], learnerLines: [teacherStyleLine("step_by_step")], mode: "general" },
      history: [],
      message: MATH_PROBLEM,
      style: "step_by_step",
      turnLines,
      verify: false,
      onUsage: async () => undefined,
    });
    expect(out).toMatchObject({ ok: true, content: STEP_ONE_REPLY });
    const sent = create.mock.calls[0]![0] as { messages: { role: string; content: string }[] };
    const system = sent.messages[0]!.content;
    expect(system.endsWith(stepTurnLine(1))).toBe(true);
    expect(system).toContain("ADIM ADIM MOD (kesin)");
    expect(system).not.toContain("İLK CÜMLE TAM CEVAP");
  });

  it("takip turu: kilit ve adım satırı birlikte, en sonda", async () => {
    const history = [
      { role: "user" as const, content: MATH_PROBLEM },
      { role: "assistant" as const, content: STEP_ONE_REPLY },
    ];
    const { create, client: fake } = client([STEP_TWO_REPLY]);
    const turn = readChatTurn({ message: "Devam et: 2. adıma geç.", style: "step_by_step", history, baseMood: "neutral" });
    const turnLines = chatTurnLines(turn, "step_by_step");
    await runTeacherTutor({
      client: fake,
      model: "gpt-6-luna",
      context: { passages: [], learnerLines: [teacherStyleLine("step_by_step")], mode: "general" },
      history,
      message: "Devam et: 2. adıma geç.",
      style: "step_by_step",
      turnLines,
      verify: false,
      onUsage: async () => undefined,
    });
    const system = (create.mock.calls[0]![0] as { messages: { content: string }[] }).messages[0]!.content;
    expect(system.endsWith(`${turnLines[0]}\n\n${turnLines[1]}`)).toBe(true);
    expect(system).toContain(`«${MATH_PROBLEM}»`);
  });

  it("sohbet ucu iki yolda da tur satırlarını kullanır", () => {
    const route = read("src/app/api/ai/chat/route.ts");
    expect(route).toContain("const turn = readChatTurn({ message, style: tutorStyle, history, baseMood: chatMood });");
    expect(route).toContain("const turnLines = chatTurnLines(turn, tutorStyle, { priorSupport });");
    // Genel sohbet: sistem isteminin en sonunda.
    expect(route).toContain("${chatTurnBlock(turnLines)}` },");
    // Hazırlık sohbeti: öğretmen motoruna.
    const teacherBlock = route.slice(route.indexOf("if (teacherTutor && prepGrounding)"), route.indexOf("const attemptLimit"));
    expect(teacherBlock).toMatch(/style: tutorStyle,\s+turnLines,/);
    expect(chatTurnBlock([])).toBe("");
    expect(chatTurnBlock(["a", "b"])).toBe("\n\na\n\nb");
  });
});
