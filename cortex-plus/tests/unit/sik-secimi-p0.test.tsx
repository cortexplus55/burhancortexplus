// @vitest-environment jsdom
/**
 * P0 (28 Kasım 2026): "B'yi işaretledim; A kırmızı, B yeşil, açıklama 'Yanlış'".
 *
 * Eski kodda üç yol öğrencinin dokunduğu şıktan başka bir şıkkı seçili gösterebiliyordu:
 * 1. Kayıtta "çok cevaplı" işaretli ama tek anahtarlı soru ekranda onay kutusu gibi davranıyordu: A'ya dokunup fikrini
 *    değiştiren öğrencinin seçimi A+B oluyor, sonuç tam olarak "A kırmızı, B yeşil, Yanlış" çıkıyordu.
 * 2. "Kontrol et" cevabı sorunun kökünü, şıklarını ve SIRASINI ekrandakinin üstüne yazıyor, sunucunun kilitli cevabını
 *    seçimin yerine koyuyordu; sunucu ise hangi sorunun notlandığını ve cevabın o sorunun şıkkı olup olmadığını hiç
 *    denetlemiyordu.
 * 3. Ekran seçimi ve doğru şıkkı birebir metinle (`includes`) karşılaştırıyordu; süzülmüş ve ham metin ayrışınca renk
 *    kayıyordu. Harfle yazılmış eski anahtarlarda "Eş", "Aşı" gibi cevaplar E / A şıkkına bağlanıyordu.
 *
 * Bu dosya gerçek bileşenler ve gerçek sunucu işlevleriyle her yolu sınar: doğru şık A, B, C, D, E'deyken (düz ve
 * karışık sıra) dokunulan doğru şık yalnız o yeşil ve "Doğru"; dokunulan yanlış şık yalnız o kırmızı.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { ExamNodeSession } from "@/components/parity/exam-node-session";
import { publicNodePayload } from "@/lib/learning/node/payload";
import { stripAnswerKeyForActiveExam } from "@/lib/learning/active-exam-seal";
import { studentSafePayload } from "@/lib/learning/student-safe-text";
import { answerCheckAction, answerFeedback } from "@/lib/learning/node/actions/answer-check";
import { canonicalQuizAnswer, resolveQuizIndex, storedQuizQuestion } from "@/lib/learning/answer-check-core";
import { mapToOptions, matchOption, optionMatchKey, placeKeyOnShown, sameChoice } from "@/lib/learning/option-match";
import { normalizeGeneratedQuizQuestion, normalizeQuizQuestion, type PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import { applyOrder, poolChoiceOrders } from "@/lib/learning/option-balance";
import { coachReaction, COACH_WRONG_MAX } from "@/lib/learning/coach-reactions";
import { wrongAnswerLine } from "@/lib/companion/voice";
import type { NodeContext } from "@/lib/learning/node/context";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: nav.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("@/lib/student/student-shell-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/student/student-shell-context")>()),
  useIsFounder: () => false,
}));

const BASE = ["Göçebe hayvancılığın artmasıyla", "Avcılığın yasaklanmasıyla", "Ticaret yollarının kapanmasıyla", "Yazının unutulmasıyla"];
const RIGHT = "Yerleşik yaşamın yaygınlaşmasıyla";
const LETTERS = ["A", "B", "C", "D", "E"] as const;

/** Doğrusu `at` harfinde olan 5 şıklı soru (düz sıra). */
function plainAt(at: number): string[] {
  return [...BASE.slice(0, at), RIGHT, ...BASE.slice(at)];
}

/** Havuzun dengeleyicisiyle karışık sıra (gerçek işlev). */
function shuffledFrom(options: string[], salt: string): string[] {
  const order = poolChoiceOrders([{ id: salt, choices: options, answer: options.indexOf(RIGHT) }] as never, salt)[0]!;
  return applyOrder(options, order);
}

function question(options: string[]): PublicQuizQuestion {
  return { text: "Tarım topluluklarında mülkiyet anlayışı hangi gelişmeyle güçlenmiştir?", options, multi: false, correct: [RIGHT], explanation: "Toprağa bağlı yaşam mülkiyeti güçlendirdi." };
}

/** Kontrollü ExamQuizPlay: seçim ebeveynde (oturum ekranındaki gibi). */
function Harness({ q }: { q: PublicQuizQuestion }) {
  const [value, setValue] = useState<unknown>(undefined);
  return (
    <ExamQuizPlay questions={[q]} index={0} value={value} onChange={setValue} onContinue={() => undefined} continueLabel="Sonraki soru" />
  );
}

function optionButtons() {
  return [...document.querySelectorAll<HTMLButtonElement>("[data-cx-option]")];
}
function statesOf() {
  return optionButtons().map((button) => button.getAttribute("data-cx-option"));
}

beforeEach(() => {
  try {
    window.sessionStorage.clear();
    window.localStorage.clear();
  } catch {
    // jsdom
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ekran: doğru şık A–E'deyken yalnız dokunulan şık renk alır", () => {
  for (const sira of ["düz", "karışık"] as const) {
    for (let at = 0; at < 5; at += 1) {
      const options = sira === "düz" ? plainAt(at) : shuffledFrom(plainAt(at), `s${at}`);
      const right = options.indexOf(RIGHT);

      it(`${sira} sıra, doğru ${LETTERS[right]}: doğruya dokununca yalnız o yeşil ve "Doğru"`, () => {
        render(<Harness q={question(options)} />);
        fireEvent.click(optionButtons()[right]!);
        fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
        const states = statesOf();
        expect(states[right]).toBe("right");
        expect(states.filter((state) => state === "right")).toHaveLength(1);
        expect(states.filter((state) => state === "wrong")).toHaveLength(0);
        expect(screen.getByText("Doğru")).toBeTruthy();
        expect(screen.queryByText("Yanlış")).toBeNull();
      });

      it(`${sira} sıra, doğru ${LETTERS[right]}: yanlışa dokununca yalnız o kırmızı`, () => {
        const wrong = (right + 2) % 5;
        render(<Harness q={question(options)} />);
        fireEvent.click(optionButtons()[wrong]!);
        fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
        const states = statesOf();
        expect(states[wrong]).toBe("wrong");
        expect(states.filter((state) => state === "wrong")).toHaveLength(1);
        // Doğru şık yeşil gösterilir (19 Ekim 2026 kararı); başka renk yok.
        expect(states[right]).toBe("right");
        expect(states.filter((state) => state === "right")).toHaveLength(1);
        expect(screen.getByText("Yanlış")).toBeTruthy();
      });
    }
  }

  it("fikir değiştiren öğrenci: A'ya sonra B'ye dokununca yalnız B seçili", () => {
    const options = plainAt(1);
    render(<Harness q={question(options)} />);
    fireEvent.click(optionButtons()[0]!);
    fireEvent.click(optionButtons()[1]!);
    expect(statesOf().filter((state) => state === "selected")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    expect(statesOf()).toEqual(["idle", "right", "idle", "idle", "idle"]);
    expect(screen.getByText("Doğru")).toBeTruthy();
  });

  it("anahtar ham metinle gelse de (boşluk, Unicode biçimi) doğru şık yeşil", () => {
    const options = plainAt(1);
    const raw = { ...question(options), correct: [`  ${RIGHT.normalize("NFD")} `] };
    render(<Harness q={raw} />);
    fireEvent.click(optionButtons()[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    expect(statesOf()[1]).toBe("right");
    expect(screen.getByText("Doğru")).toBeTruthy();
  });

  it("anahtarı sunucuda tutulan testte de düğme 'Kontrol et' der", () => {
    const sealed = { ...question(plainAt(0)), correct: undefined };
    render(
      <ExamQuizPlay questions={[sealed, sealed]} index={0} value={RIGHT} onChange={() => undefined} onContinue={() => undefined} continueLabel="Sonraki soru" serverCheck />,
    );
    expect(screen.getByRole("button", { name: "Kontrol et" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sonraki soru" })).toBeNull();
  });
});

describe("kayıt okuma: tek anahtarlı soru çok cevaplı sayılmaz; harf anahtarı kaymaz", () => {
  it("kayıtta multi:true ama tek doğru → tek seçimli; iki doğru → çok cevaplı", () => {
    expect(normalizeQuizQuestion({ text: "Soru?", options: ["A1", "B1", "C1"], correct: ["B1"], multi: true })!.multi).toBe(false);
    expect(normalizeQuizQuestion({ text: "Soru?", options: ["A1", "B1", "C1"], correct: ["A1", "B1"], multi: true })!.multi).toBe(true);
    // Yeni üretimde modelin beyanı korunur (yapı denetimi tek doğrulu çok cevaplıyı yakalar).
    expect(normalizeGeneratedQuizQuestion({ text: "Soru?", options: ["A1", "B1", "C1"], correct: ["B1"] }, true)!.multi).toBe(true);
  });

  it("öğrenci paketi tek anahtarlı soruyu tek seçimli gönderir", () => {
    const stored = { type: "quiz", questions: [{ text: "Soru?", options: ["Bir", "İki", "Üç"], correct: ["İki"], multi: true }] };
    const sealed = stripAnswerKeyForActiveExam(publicNodePayload(stored, [], "quiz")) as { questions: { multi: boolean; correct?: unknown }[] };
    expect(sealed.questions[0]!.multi).toBe(false);
    expect(sealed.questions[0]!.correct).toBeUndefined();
  });

  it("harfle yazılmış anahtar yalnız gerçekten harfse şıkka bağlanır", () => {
    const options = ["Eşit", "Bir", "Üç", "Dört", "Beş"];
    // "Eş" şıklarda birebir yok: eskiden ASCII harfi "E" kalıyor, E şıkkına ("Beş") bağlanıyordu.
    expect(normalizeQuizQuestion({ text: "Soru?", options, correct: "Eş" })).toBeNull();
    expect(normalizeQuizQuestion({ text: "Soru?", options, correct: "Aşı" })).toBeNull();
    expect(normalizeQuizQuestion({ text: "Soru?", options, correct: "B" })!.correct).toEqual(["Bir"]);
    expect(normalizeQuizQuestion({ text: "Soru?", options, correct: "c)" })!.correct).toEqual(["Üç"]);
    expect(normalizeQuizQuestion({ text: "Soru?", options, correct: "(D)" })!.correct).toEqual(["Dört"]);
    expect(normalizeQuizQuestion({ text: "Soru?", options, correct: "Cevap: E" })!.correct).toEqual(["Beş"]);
    expect(normalizeQuizQuestion({ text: "Soru?", options, correct: "A şıkkı" })!.correct).toEqual(["Eşit"]);
  });
});

describe("şık kimliği", () => {
  it("ham ve süzülmüş metin aynı şık; seçim ekrandaki metne çevrilir", () => {
    const options = plainAt(2);
    expect(optionMatchKey(` ${RIGHT}  `)).toBe(optionMatchKey(RIGHT));
    expect(optionMatchKey(RIGHT.normalize("NFD"))).toBe(optionMatchKey(RIGHT));
    expect(matchOption(options, `${RIGHT} `)).toBe(RIGHT);
    expect(matchOption(options, "Olmayan şık")).toBeNull();
    expect(mapToOptions(options, [RIGHT, "Olmayan"])).toEqual([RIGHT]);
    expect(sameChoice(RIGHT, [` ${RIGHT}`])).toBe(true);
    expect(sameChoice(RIGHT, BASE[0])).toBe(false);
  });

  it("sunucu anahtarı ekrandaki soruya yerleşir: sıra, kök ve metin değişmez; gerekçeler ekran sırasına dizilir", () => {
    const shown = { text: "Soru kökü?", options: ["Bir", "İki", "Üç"], multi: false };
    const server = { text: "Soru kökü?", options: ["Üç", "İki", "Bir"], correct: ["İki "], optionWhy: ["üç neden", "iki neden", "bir neden"], explanation: "Açıklama." };
    const placed = placeKeyOnShown(shown, server)!;
    expect(placed.options).toEqual(["Bir", "İki", "Üç"]);
    expect(placed.correct).toEqual(["İki"]);
    expect(placed.optionWhy).toEqual(["bir neden", "iki neden", "üç neden"]);
    expect(placed.explanation).toBe("Açıklama.");
    // Kök tutmuyorsa (sunucu başka soruyu notladıysa) birleştirilmez.
    expect(placeKeyOnShown(shown, { ...server, text: "Başka soru?" })).toBeNull();
  });
});

describe("sunucu: answer-check hangi soruyu ve hangi şıkkı kilitler", () => {
  const stored = {
    type: "quiz",
    questions: [
      { text: "Birinci soru?", options: plainAt(1), correct: [RIGHT], multi: false },
      { text: "İkinci soru?", options: ["Bir", "İki", "Üç", "Dört", "Beş"], correct: ["Üç"], multi: false },
    ],
  };

  it("kök o sıradaki soruysa o; değilse kayıtta aranır; yoksa reddedilir", () => {
    expect(resolveQuizIndex(stored, 0, "Birinci soru?")).toBe(0);
    expect(resolveQuizIndex(stored, 0, "İkinci soru?")).toBe(1);
    expect(resolveQuizIndex(stored, 0, "Hiç olmayan soru?")).toBeNull();
    expect(resolveQuizIndex(stored, 1)).toBe(1);
  });

  it("cevap şıkkın kendi metnine çevrilir; şıklarda olmayan ya da tek doğruluya çoklu cevap reddedilir", () => {
    const q = storedQuizQuestion(stored, 0)!;
    expect(canonicalQuizAnswer(q, ` ${RIGHT} `)).toBe(RIGHT);
    expect(canonicalQuizAnswer(q, "Başka bir şey")).toBeNull();
    expect(canonicalQuizAnswer(q, [RIGHT, BASE[0]!])).toBeNull();
    expect(canonicalQuizAnswer(q, "")).toBeNull();
  });

  it("geri bildirim oturum paketiyle aynı süzgeçten geçer", () => {
    const feedback = answerFeedback(stored, 0);
    expect(feedback?.kind).toBe("quiz");
    const sealed = studentSafePayload(stripAnswerKeyForActiveExam(publicNodePayload(stored, [], "quiz"))) as { questions: { options: string[] }[] };
    expect(feedback?.kind === "quiz" ? feedback.question.options : null).toEqual(sealed.questions[0]!.options);
  });

  function fakeContext(answers: Record<string, unknown>, data: Record<string, unknown>) {
    const writes: Record<string, unknown>[] = [];
    const chain = (result: unknown) => {
      const node: Record<string, unknown> = {};
      for (const key of ["select", "eq", "in"]) node[key] = () => node;
      node.maybeSingle = async () => result;
      return node;
    };
    const service = {
      from: () => ({
        select: () => chain({ data: { id: "att", status: "active", payload: stored, answers }, error: null }),
        update: (patch: Record<string, unknown>) => {
          writes.push(patch);
          const node: Record<string, unknown> = {};
          node.eq = () => node;
          (node as { then: unknown }).then = (resolve: (value: unknown) => void) => resolve({ error: null });
          return node;
        },
      }),
    };
    const context = {
      userId: "u",
      service,
      prepId: "p",
      nodeId: "n",
      kind: "quiz",
      parsed: { data: { attemptId: "att", action: "answer-check", ...data } },
    } as unknown as NodeContext;
    return { context, writes };
  }

  it("uç: dokunulan şık kilitlenir (şıkkın kendi metniyle), ekranın gördüğü kökle", async () => {
    const { context, writes } = fakeContext({}, { questionIndex: 1, questionText: "Birinci soru?", answer: ` ${RIGHT}` });
    const res = await answerCheckAction(context);
    const body = (await res.json()) as { ok: boolean; index: number; answer: unknown };
    expect(res.status).toBe(200);
    expect(body.index).toBe(0);
    expect(body.answer).toBe(RIGHT);
    expect((writes[0]!.answers as Record<string, unknown>)["0"]).toBe(RIGHT);
  });

  it("uç: şıklarda olmayan cevap ve bilinmeyen kök reddedilir, hiçbir şey yazılmaz", async () => {
    const bad = fakeContext({}, { questionIndex: 0, questionText: "Birinci soru?", answer: "Uydurma şık" });
    expect((await answerCheckAction(bad.context)).status).toBe(400);
    expect(bad.writes).toHaveLength(0);
    const lost = fakeContext({}, { questionIndex: 0, questionText: "Başka soru?", answer: RIGHT });
    expect((await answerCheckAction(lost.context)).status).toBe(409);
    expect(lost.writes).toHaveLength(0);
  });
});

describe("oturum ekranı: 'Kontrol et' cevabı ekrandaki soruyu ve seçimi değiştirmez", () => {
  function stub(stored: Record<string, unknown>, transform: (feedback: Record<string, unknown>) => Record<string, unknown> = (f) => f) {
    const sent: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        sent.push(body);
        if (body.action === "answer-check") {
          const index = Number(body.questionIndex);
          const q = storedQuizQuestion(stored, index)!;
          const feedback = answerFeedback(stored, index);
          return new Response(
            JSON.stringify({ ok: true, index, answer: canonicalQuizAnswer(q, body.answer), question: transform(feedback?.kind === "quiz" ? (feedback.question as Record<string, unknown>) : {}) }),
          );
        }
        return new Response(JSON.stringify({ ok: true, contentVersion: 2, generationId: "g1" }));
      }),
    );
    return sent;
  }

  function session(stored: Record<string, unknown>) {
    const sealed = studentSafePayload(stripAnswerKeyForActiveExam(publicNodePayload(stored, [], "quiz")));
    return render(
      <ExamNodeSession
        prepId="p"
        nodeId="n"
        kind="quiz"
        prepTitle="Tarih"
        topicLabel="Tarım"
        todayMood={null}
        initialFamiliarity="basics"
        resumeEnabled
        initialResume={{ ok: true, resumed: true, attemptId: "a1", generationId: "g1", contentVersion: 1, payload: sealed }}
      />,
    );
  }

  const stored = { type: "quiz", questions: [{ text: "Tarım topluluklarında mülkiyet anlayışı hangi gelişmeyle güçlenmiştir?", options: plainAt(1), correct: [RIGHT], multi: false, explanation: "Açıklama." }] };

  async function tapAndCheck(at: number) {
    await screen.findByText(/mülkiyet anlayışı/);
    fireEvent.click(optionButtons()[at]!);
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  }

  it("sunucu şıkları başka sırayla ve kökle gönderse de B'ye dokunan öğrenci B'yi yeşil görür", async () => {
    const sent = stub(stored, (feedback) => ({ ...feedback, options: [...(feedback.options as string[])].reverse() }));
    session(stored);
    await screen.findByText(/mülkiyet anlayışı/);
    const before = optionButtons().map((button) => button.textContent);
    await tapAndCheck(1);
    const check = sent.find((body) => body.action === "answer-check")!;
    expect(check.answer).toBe(RIGHT);
    expect(check.questionText).toMatch(/mülkiyet anlayışı/);
    expect(statesOf()).toEqual(["idle", "right", "idle", "idle", "idle"]);
    expect(screen.getByText("Doğru")).toBeTruthy();
    // Sıra değişmedi (harf rozeti ✓ ile yer değiştirdiği için yalnız şık metni karşılaştırılır).
    const texts = optionButtons().map((button) => button.textContent?.replace(/^[A-E]/, ""));
    expect(texts).toEqual(before.map((text) => text?.replace(/^[A-E]/, "")));
  });

  it("kayıtta çok cevaplı işaretli tek anahtarlı soru: A'dan B'ye geçen öğrenci 'Doğru' alır", async () => {
    const multiFlag = { ...stored, questions: [{ ...stored.questions[0]!, multi: true }] };
    stub(multiFlag);
    session(multiFlag);
    await screen.findByText(/mülkiyet anlayışı/);
    expect(screen.queryByText("Birden fazla yanıt seçebilirsin")).toBeNull();
    fireEvent.click(optionButtons()[0]!);
    await tapAndCheck(1);
    expect(statesOf()).toEqual(["idle", "right", "idle", "idle", "idle"]);
    expect(screen.getByText("Doğru")).toBeTruthy();
  });
});

describe("yanlış cevaptaki koç cümlesi tek kısa satır", () => {
  it("her ruh halinde en çok COACH_WRONG_MAX karakter", () => {
    const lines = [
      coachReaction({ correct: false, streak: 0 }).text,
      coachReaction({ correct: false, streak: 0, partial: 50 }).text,
      ...(["stressed", "low_energy", "ready"] as const).map((mood) => wrongAnswerLine(mood)!),
    ];
    for (const line of lines) expect([...line].length, line).toBeLessThanOrEqual(COACH_WRONG_MAX);
  });
});

describe("canlı kayıt (28 Kasım 2026): önceki çalışmada kilitlenmiş soru kaldığı yerden açılınca", () => {
  /*
    Canlıdaki deneme 16 Kasım'da açılmış, 1. soru A ile kilitlenmiş ve "Devam et"e basılmadan çıkılmış; 27 Kasım'da
    test kaldığı yerden (1. sorudan) açıldı. Soru eski sonucuyla (A kırmızı, B yeşil, "Yanlış") kilitli geldi, ekran
    bunun önceki bir cevap olduğunu söylemedi; B'ye dokunmak bir şey yapmadı.
  */
  const A = "Kut anlayışının ortadan kalkmasıyla";
  const stored = {
    type: "quiz",
    questions: [
      { text: "Bir Türk topluluğunun tarıma geçmesi hangisiyle ilişkilidir?", options: [A, RIGHT, "C şıkkı metni", "D şıkkı metni", "E şıkkı metni"], correct: [RIGHT], multi: false },
      { text: "İkinci soru?", options: ["x1", "x2", "x3", "x4", "x5"], correct: ["x1"], multi: false },
    ],
  };

  function open(answers: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        if (body.action === "answer-check" && Array.isArray(body.revealIndexes)) {
          const revealed = Object.fromEntries(
            (body.revealIndexes as number[]).map((at) => {
              const feedback = answerFeedback(stored, at);
              return [String(at), feedback?.kind === "quiz" ? feedback.question : {}];
            }),
          );
          return new Response(JSON.stringify({ ok: true, revealed }));
        }
        return new Response(JSON.stringify({ ok: true, contentVersion: 2, generationId: "g1" }));
      }),
    );
    const sealed = studentSafePayload(stripAnswerKeyForActiveExam(publicNodePayload(stored, [], "quiz")));
    render(
      <ExamNodeSession
        prepId="p"
        nodeId="n"
        kind="quiz"
        prepTitle="KPSS Tarih"
        topicLabel="Türk tarihi"
        todayMood={null}
        initialFamiliarity="basics"
        resumeEnabled
        initialResume={{ ok: true, resumed: true, attemptId: "a1", generationId: "g1", contentVersion: 1, payload: sealed, answers, cursorIndex: 0 }}
      />,
    );
  }

  it("soru kilitli ve eski sonucuyla gelir; ekran bunun önceki bir cevap olduğunu ve hangi şıkkın kilitli olduğunu söyler", async () => {
    open({ "0": A, __locked: ["0"] });
    await screen.findByText(/tarıma geçmesi/);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const note = screen.getByTestId("answered-before");
    expect(note.textContent).toContain("daha önceki bir çalışmanda cevapladın");
    expect(note.textContent).toContain("A şıkkı");
    expect(statesOf()).toEqual(["wrong", "right", "idle", "idle", "idle"]);
    expect(optionButtons().every((button) => button.disabled)).toBe(true);
    // B'ye dokunmak kilitli cevabı değiştirmez.
    fireEvent.click(optionButtons()[1]!);
    expect(statesOf()).toEqual(["wrong", "right", "idle", "idle", "idle"]);
  });

  it("bu oturumda kilitlenen soruda not yok", async () => {
    open({});
    await screen.findByText(/tarıma geçmesi/);
    fireEvent.click(optionButtons()[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    expect(screen.queryByTestId("answered-before")).toBeNull();
  });
});
