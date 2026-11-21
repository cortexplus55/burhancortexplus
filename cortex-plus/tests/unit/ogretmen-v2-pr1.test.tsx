// @vitest-environment jsdom
/**
 * Faz 13 PR-1 (PROMPT-V2 §7, §10; PROMPT.md §4 B, C, D): ses kılavuzu doğrulayıcı, tur kuralları, süreklilik, Rehberli
 * varsayılan, ipucu merdiveni; G-1 ham işaret taraması. Hepsi teacher.v2 arkasında; bayrak kapalıyken bugünkü yol.
 * Örnekler farklı derslerden (fizik, tarih, biyoloji, matematik): kurallar ders bağımsız.
 */
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONCEPT_STEP_LINE,
  FIRST_TURN_LINE,
  GUIDED_STYLE,
  REVEAL_LINE,
  answerTurnPlan,
  isAnswerTo,
  readTutorSession,
  repeatsAskedQuestion,
  resolveTeachStyle,
  teacherV2SessionLines,
  tutorQuestions,
  v2AnswerFirstLine,
  v2StyleLine,
} from "@/lib/ai/teacher-v2-session";
import { settleVoice } from "@/lib/ai/teacher-voice";
import { splitFinalQuestion } from "@/lib/learning/question-bubble";
import { planTurn } from "@/lib/learning/tutor-turn";
import { STUCK_POINT_RULE } from "@/lib/learning/tutor-answer";
import { LADDER_CHIPS, TEACH_STYLE_OPTIONS } from "@/lib/learning/tutor-style";
import { TeachStyleMenu } from "@/components/chat/teach-style-menu";
import { TutorReplyView } from "@/components/chat/tutor-reply-view";

const read = (path: string) => readFileSync(path, "utf8");
const user = (content: string) => ({ role: "user", content });
const tutor = (content: string) => ({ role: "assistant", content });

describe("stil: Rehberli yalnız bayrak açıkken", () => {
  it("bayrak açıkken guided → Rehberli (Sokratik makinesiyle); kapalıyken profilin stili", () => {
    expect(resolveTeachStyle({ requested: "guided", profile: "direct_solve", teacherV2: true })).toEqual({ style: GUIDED_STYLE, base: "hints_first" });
    expect(resolveTeachStyle({ requested: "guided", profile: "direct_solve", teacherV2: false })).toEqual({ style: "direct_solve", base: "direct_solve" });
    expect(resolveTeachStyle({ requested: "step_by_step", profile: "direct_solve", teacherV2: true })).toEqual({ style: "step_by_step", base: "step_by_step" });
    expect(resolveTeachStyle({ requested: undefined, profile: "hints_first", teacherV2: true })).toEqual({ style: "hints_first", base: "hints_first" });
  });

  it("Rehberli ve Sokratik v2 satırı kavram sorusunda da cevabı ilk mesajda vermez; öbür stiller eski satırda", () => {
    expect(v2StyleLine(GUIDED_STYLE)).toContain("REHBERLİ MOD");
    expect(v2StyleLine("hints_first")).toContain("kavram sorusunda da");
    expect(v2StyleLine("hints_first")).not.toContain("tanımı ilk cümlede ver");
    expect(v2StyleLine("step_by_step")).toBeNull();
    expect(v2StyleLine("direct_solve")).toBeNull();
  });

  it("menü dört seçenek, ilki Rehberli; çipler ipucu ve cevabı göster", () => {
    expect(TEACH_STYLE_OPTIONS.map((option) => option.label)).toEqual(["Rehberli", "Sokratik (Önce İpucu)", "Adım Adım", "Doğrudan Çöz"]);
    expect(LADDER_CHIPS.map((chip) => chip.label)).toEqual(["💡 İpucu ver", "⚡ Cevabı göster"]);
  });
});

describe("seans durumu (B): süreklilik", () => {
  const history = [
    user("Sürtünmeli yüzeyde mekanik enerji neden azalır?"),
    tutor("Sürtünme bir iş yapar. **Bu iş hangi enerjiye dönüşür?**"),
    user("ısıya"),
    tutor("Doğru, ısıya dönüşür. Peki 10 J'lik kayıpta mekanik enerji ne kadar azalır?"),
  ];

  it("öğretmenin soruları kutular ve formül dışından okunur", () => {
    expect(tutorQuestions("Bir ipucu.\n\n> 💡 Benzetme: neden böyle?\n\n$$x=?$$\n\nSence sonuç nedir?")).toEqual(["Sence sonuç nedir?"]);
  });

  it("sorulan sorular listelenir; cevap denemesi ve deneme sırası okunur; onay zinciri bitirir", () => {
    const session = readTutorSession(history, "10 J azalır");
    expect(session.asked).toEqual(["Bu iş hangi enerjiye dönüşür?", "Peki 10 J'lik kayıpta mekanik enerji ne kadar azalır?"]);
    expect(session.answering).toBe(true);
    // Önceki öğretmen mesajı "Doğru" diye açıldı: yeni soru zinciri, 1. deneme.
    expect(session.attempt).toBe(1);
  });

  it("onaysız art arda yanlışta deneme sırası artar (1/6 → nasıl buldun? → 1/9)", () => {
    const chain = [
      user("2 üzeri -3 neden 1/8?"),
      tutor("2'nin kuvvetlerine bak: 2², 2¹, 2⁰. Bir sonraki adım ne olur?"),
      user("1/6 sanırım"),
      tutor("1/6'yı 1÷(2×3) diye mi buldun?"),
    ];
    const session = readTutorSession(chain, "evet öyle yaptım, 1/9 mu?");
    expect(session.answering).toBe(true);
    expect(session.attempt).toBe(2);
  });

  it("takip, yeni alıştırma isteği, açık cevap isteği ve şıklı yeni soru cevap denemesi değildir", () => {
    const ask = "Sence hangi sınıfa girer?";
    expect(isAnswerTo("devam et", ask)).toBe(false);
    expect(isAnswerTo("bana yeni bir soru sor", ask)).toBe(false);
    expect(isAnswerTo("cevabı söyle", ask)).toBe(false);
    expect(isAnswerTo("Hangisi doğrudur? A) Kral B) Meclis C) Vezir", ask)).toBe(false);
    expect(isAnswerTo("bence Kanun-i Esasi", ask)).toBe(true);
    expect(isAnswerTo("bence Kanun-i Esasi", "Kanun-i Esasi 1876'da ilan edildi.")).toBe(false);
  });

  it("aynı soru tekrarı ölçülür (yazım farkı sayılmaz)", () => {
    expect(repeatsAskedQuestion("Peki, 2⁻² kaçtır?", ["Peki 2⁻² kaçtır?"])).toBe(true);
    expect(repeatsAskedQuestion("Şimdi 3⁻² kaçtır?", ["Peki 2⁻² kaçtır?"])).toBe(false);
  });

  it("cevap denemesi yeni problem sayılmaz (kesirli cevap işlem gibi görünür; adım satırı açılmaz)", () => {
    const plan = planTurn({ message: "1/6 sanırım", style: "step_by_step", history: [] });
    expect(plan.problem).toBe(true);
    expect(answerTurnPlan(plan)).toMatchObject({ problem: false, pacedStep: null });
  });

  it("süreklilik satırı sorulanları sayar ve öncekine bağlanmayı söyler", () => {
    const session = readTutorSession(history, "10 J");
    const lines = teacherV2SessionLines({ session, style: GUIDED_STYLE, plan: planTurn({ message: "10 J", style: "hints_first", history }), message: "10 J" });
    expect(lines[0]).toContain("TEKRAR SORMA");
    expect(lines[0]).toContain("«Bu iş hangi enerjiye dönüşür?»");
    expect(lines[0]).toContain("öncekine bağla");
  });
});

describe("ipucu merdiveni (C) ve ilk tur", () => {
  const empty = { asked: [], lastQuestion: null, answering: false, attempt: 0 };
  const plan = (message: string, style: "hints_first" | "step_by_step" | "direct_solve" = "hints_first") =>
    planTurn({ message, style, history: [] });

  it("Rehberli ve Sokratik yeni soruda cevabı vermez; 'ilk cümle tam cevap' demez (S3a)", () => {
    const message = "Hücre zarı neden seçici geçirgendir?";
    for (const style of [GUIDED_STYLE, "hints_first"] as const) {
      const lines = teacherV2SessionLines({ session: empty, style, plan: plan(message), message });
      expect(lines).toContain(FIRST_TURN_LINE);
      expect(v2AnswerFirstLine({ message, style, base: "hints_first", session: empty, plan: plan(message) })).toBe(STUCK_POINT_RULE);
    }
    expect(FIRST_TURN_LINE).toContain("45-60 kelime");
  });

  it("ilk yanlışta teşhis sorusu, cevap söylenmez; ikinci denemede doğru yol (S3b)", () => {
    const first = teacherV2SessionLines({
      session: { asked: ["Bir sonraki adım ne olur?"], lastQuestion: "Bir sonraki adım ne olur?", answering: true, attempt: 1 },
      style: GUIDED_STYLE,
      plan: answerTurnPlan(plan("1/6 sanırım")),
      message: "1/6 sanırım",
    }).join("\n");
    expect(first).toContain("1. deneme");
    expect(first).toContain("SÖYLEME");
    expect(first).toContain("nasıl ulaştığını tek bir SORUYLA sor");
    const second = teacherV2SessionLines({
      session: { asked: [], lastQuestion: "Nasıl buldun?", answering: true, attempt: 2 },
      style: "hints_first",
      plan: answerTurnPlan(plan("1/9")),
      message: "1/9",
    }).join("\n");
    expect(second).toContain("2. deneme");
    expect(second).toContain("doğru cevabı söyle");
  });

  it("'cevabı göster' / 'çöz' merdiveni atlar (öğrenci tutsak edilmez)", () => {
    for (const message of ["Cevabı göster.", "cevabı söyle", "direkt çöz"]) {
      const lines = teacherV2SessionLines({ session: empty, style: GUIDED_STYLE, plan: planTurn({ message, style: "hints_first", history: [user("x?"), tutor("Sence?")] }), message });
      expect(lines).toContain(REVEAL_LINE);
      expect(lines).not.toContain(FIRST_TURN_LINE);
    }
  });

  it("Adım Adım: kavram sorusunda gerçek adım modu; problemde bugünkü adım satırı (S4)", () => {
    const concept = "Fotosentez neden ışığa ihtiyaç duyar?";
    expect(teacherV2SessionLines({ session: empty, style: "step_by_step", plan: plan(concept, "step_by_step"), message: concept })).toContain(CONCEPT_STEP_LINE);
    expect(v2AnswerFirstLine({ message: concept, style: "step_by_step", base: "step_by_step", session: empty, plan: plan(concept, "step_by_step") })).toBe(STUCK_POINT_RULE);
    const problem = "3x + 5 = 20 ise x kaçtır?";
    expect(teacherV2SessionLines({ session: empty, style: "step_by_step", plan: plan(problem, "step_by_step"), message: problem })).not.toContain(CONCEPT_STEP_LINE);
  });

  it("Doğrudan Çöz merdiven kurmaz, yalnız süreklilik satırı alır", () => {
    const message = "Osmanlı'da ilk anayasa ne zaman ilan edildi?";
    expect(teacherV2SessionLines({ session: empty, style: "direct_solve", plan: plan(message, "direct_solve"), message })).toEqual([]);
    expect(v2AnswerFirstLine({ message, style: "direct_solve", base: "direct_solve", session: empty, plan: plan(message, "direct_solve") })).toContain("İLK CÜMLE TAM CEVAP");
  });
});

describe("ses kılavuzu (§7) ve G-1: kod yalnız siler ya da simgeye çevirir", () => {
  it("yasak kalıp ve açılışlar kalkar, cümlenin geri kalanı ve büyük harf korunur", () => {
    const out = settleVoice("Harika soru! Elbette, sürtünme ısı üretir. Sana şunu söyleyebilirim ki enerji korunur. Umarım yardımcı olmuştur.");
    expect(out.text).toBe("Sürtünme ısı üretir. Enerji korunur.");
    expect(out.banned).toBe(4);
    expect(settleVoice("Özetle, dörtlü kural geçerli.").text).toBe("Dörtlü kural geçerli.");
    expect(settleVoice("Moral bozmak yok! Tekrar bakalım.").text).toBe("Tekrar bakalım.");
  });

  it("doğrulanamayan istatistik cümlesi silinir, kutu metnine dokunulmaz", () => {
    const out = settleVoice("Bu şık en çok düşülen tuzaktır. Doğrusu B.\n\n> ⚠️ Sık hata: işareti unutmak.");
    expect(out.text).toBe("Doğrusu B.\n\n> ⚠️ Sık hata: işareti unutmak.");
    expect(out.stats).toBe(1);
  });

  it("emoji: soru cümlesinde yok, mesajda en çok bir; kutu emojisi sayılmaz", () => {
    const out = settleVoice("Güzel 🎉 bir adım 🚀 attın.\n\n> 💡 Benzetme: bir kova.\n\nŞimdi sıradaki ne? 🤔");
    expect(out.text).toBe("Güzel 🎉 bir adım attın.\n\n> 💡 Benzetme: bir kova.\n\nŞimdi sıradaki ne?");
    expect(out.emoji).toBe(2);
  });

  it("başlık ve madde işareti kalkar, satırlar korunur", () => {
    const out = settleVoice("## Hücre zarı\n- seçici geçirgendir\n- fosfolipitten oluşur");
    expect(out.text).toBe("Hücre zarı\nseçici geçirgendir\nfosfolipitten oluşur");
    expect(out.structure).toBe(3);
  });

  it("formül dışındaki ham üs ve alt simge okunur simgeye döner; formül ve kod aynen", () => {
    const out = settleVoice("2^-3 = 1/8 ve v_0 hızı; $2^{-3}$ ile `a_1` aynen kalır. Tek **kalın kaldı.");
    expect(out.text).toBe("2⁻³ = 1/8 ve v₀ hızı; $2^{-3}$ ile `a_1` aynen kalır. Tek kalın kaldı.");
    expect(out.rawFixed).toBe(3);
    expect(settleVoice("snake_case ve max_2 dokunulmaz").text).toBe("snake_case ve max_2 dokunulmaz");
  });

  it("temiz metin aynen kalır", () => {
    const clean = "**1. adım:** Verilenleri yaz.\n\n1. adım netleştiyse 'Devam et' yaz, 2. adıma geçelim.";
    expect(settleVoice(clean).text).toBe(clean);
  });
});

describe("soru ayrı balon", () => {
  it("son soru cümlesi ayrılır; kutu ya da liste ile biten yanıtta ayırma yok", () => {
    expect(splitFinalQuestion("Sürtünme iş yapar. Bu iş hangi enerjiye dönüşür?")).toEqual({
      body: "Sürtünme iş yapar.",
      question: "Bu iş hangi enerjiye dönüşür?",
    });
    expect(splitFinalQuestion("Anlatım.\n\n> ✅ Akılda kalsın: kural?")).toBeNull();
    expect(splitFinalQuestion("Anlatım bitti.")).toBeNull();
  });
});

describe("ekran", () => {
  afterEach(() => cleanup());
  it("Nasıl anlatayım? menüsü dört seçenek gösterir, seçilen bildirilir, Esc kapatır", () => {
    const onChange = vi.fn();
    render(<TeachStyleMenu value="guided" onChange={onChange} />);
    const pill = screen.getByRole("button", { name: /Nasıl anlatayım\? Şu an: Rehberli/ });
    fireEvent.click(pill);
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(4);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Doğrudan Çöz/ }));
    expect(onChange).toHaveBeenCalledWith("direct_solve");
    fireEvent.click(pill);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("bayrak açıkken yanıtın sorusu 'Sıra sende' kartında, altında İpucu ver ve Cevabı göster", () => {
    const onPrompt = vi.fn();
    render(
      <TutorReplyView content="Sürtünme iş yapar. Bu iş hangi enerjiye dönüşür?" tutorStyle="hints_first" ladderChips onPrompt={onPrompt} maxChips={3} />,
    );
    expect(screen.getByText("Sıra sende")).toBeTruthy();
    expect(screen.getByText("Bu iş hangi enerjiye dönüşür?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "⚡ Cevabı göster" }));
    expect(onPrompt).toHaveBeenCalledWith("Cevabı göster.");
  });

  it("bayrak kapalıyken (ladderChips yok) bugünkü Sokratik çipleri ve tek parça metin", () => {
    render(<TutorReplyView content="Sürtünme iş yapar. Bu iş hangi enerjiye dönüşür?" tutorStyle="hints_first" onPrompt={() => undefined} />);
    expect(screen.queryByText("Sıra sende")).toBeNull();
    expect(screen.getByRole("button", { name: "💡 Bir ipucu daha ver" })).toBeTruthy();
  });
});

describe("sohbet ucu: bayrak arkasında, model çağrısı eklenmez", () => {
  const route = read("src/app/api/ai/chat/route.ts");
  const panel = read("src/components/chat/chat-panel.tsx");

  it("bayrak kapalıyken stil, stil satırı ve ilk cümle satırı bugünkü (S12)", () => {
    expect(route).toContain("const v2Chat = teacherV2 && !rest.prepId;");
    // Faz 11: bayrak kapalıyken Rehberli ve iki yeni mod (eski sekmeden gelse de) profilin stiline düşer.
    expect(route).toContain(
      "rest.tutorStyle === GUIDED_STYLE || isTeachModeV2(rest.tutorStyle) ? profile?.tutor_style : rest.tutorStyle ?? profile?.tutor_style",
    );
    expect(route).toContain("const v2Session: TutorSession | null = v2Chat ? readTutorSession(history, message) : null;");
    expect(route).toContain("${(v2Session && v2StyleLine(teachStyle)) || teacherStyleLine(tutorStyle)}");
    expect(route).toContain(": answerFirstLine(message, tutorStyle)}");
    expect(route).toContain("if (v2Session && !turn.crisis && !turn.feelingOnly) {");
  });

  it("ses kılavuzu tek hamle kodundan sonra, kayıttan önce; ölçü günlükte", () => {
    const at = route.indexOf("const voice = settleVoice(settled.text);");
    expect(at).toBeGreaterThan(route.indexOf("const settled = settleOneMove(content);"));
    expect(at).toBeLessThan(route.indexOf('service.rpc("complete_chat_operation"'));
    expect(route).toContain("repeated: repeatsAskedQuestion(content, v2Session.asked)");
  });

  it("yeni modüllerde model çağrısı ve veritabanı yok", () => {
    for (const path of ["src/lib/ai/teacher-v2-session.ts", "src/lib/ai/teacher-voice.ts", "src/lib/learning/question-bubble.ts"]) {
      const source = read(path);
      expect(source).not.toMatch(/openai|chat\.completions|\.from\(|\.rpc\(/);
    }
  });

  it("panel: menü ve Rehberli yalnız bayrak açıkken ve ana sohbette; kapalıyken üç düğmeli anahtar", () => {
    expect(panel).toContain("const v2Main = teacherV2 && !prepId;");
    expect(panel).toContain("const activeStyle: TeachStyle = v2Main ? teachStyle : tutorStyle;");
    expect(panel).toMatch(/\{v2Main \? \(\s*(?:<>\s*)?<TeachStyleMenu/);
    expect(panel).toContain("<TutorModeSwitcher value={tutorStyle} onChange={persistTutorStyle} disabled={loading} />");
    expect(panel).toContain("if (next !== GUIDED_TEACH_STYLE) persistTutorStyle(next);");
  });
});
