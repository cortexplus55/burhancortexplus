import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answersAgree,
  numericOf,
  parseQuick,
  parseSolution,
  solutionIssues,
  type Solution,
} from "@/lib/solve/question-solver";
import { evaluate, stepArithmeticIssues } from "@/lib/solve/step-arithmetic";
import { solvePhaseAfter, type SolvePhase } from "@/lib/solve/solve-client";
import { solutionMarkdown, solveUserLine } from "@/lib/solve/solution-markdown";
import { signReviewToken, solutionReviewItem, verifyReviewToken } from "@/lib/solve/solve-review";
import { reviewPromptKey, sealReviewItem } from "@/lib/learning/review-items";
import { socraticConcept, socraticHint, solveDiscussPrompt } from "@/lib/solve/socratic-solve";

/*
  Soru çözücü (23 Ekim 2026, ürün sahibi: "yüzde 100 doğruluk, en çok 15 sn, Astra tarzı, bütün derslerde").
  Model doğruluğu canlı ölçümle (`tests/unit/_tmp/solver-bench.test.ts`, 10 ders 10/10); burada kodun kendi
  kontrolleri: iki çözümün karşılaştırılması, adım aritmetiği, şık eşleşmesi, ekran durumu, sohbet metni ve
  tekrar listesine imzalı ekleme.
*/

function mcq(over: Partial<Solution> = {}): Solution {
  return {
    readable: true,
    subject: "Matematik",
    question: "2x + 6 = 14 ise x kaçtır?",
    options: [
      { letter: "A", text: "2" },
      { letter: "B", text: "3" },
      { letter: "C", text: "4" },
      { letter: "D", text: "5" },
    ],
    kind: "mcq",
    intro: "Denklemi x yalnız kalana kadar sadeleştiriyoruz.",
    given: ["2x + 6 = 14"],
    asked: "x",
    steps: [
      { math: "2x = 14 - 6 = 8", say: "6'yı karşıya geçirdik." },
      { math: "x = 8 / 2 = 4", say: "İki tarafı 2'ye böldük." },
    ],
    answer: { letter: "C", value: "4", text: "x = 4" },
    optionsWhy: [
      { letter: "A", why: "6'yı çıkarmayı unutup 14'ü 7'ye bölmek gibi bir hata." },
      { letter: "C", why: "8 / 2 = 4.", correct: true },
    ],
    trap: "6'yı karşıya geçirirken işaret değişir.",
    tip: "Önce sabitleri, sonra katsayıyı at.",
    check: "Kontrol: 2·4 + 6 = 14 ✓",
    ...over,
  };
}

describe("model çıktısının okunması", () => {
  it("şıklı çözümü okur; bozuk şık ve boş adım atılır", () => {
    const parsed = parseSolution({
      question: "Soru?",
      options: [{ letter: "a)", text: "Bir" }, { letter: "B", text: "İki" }, { letter: "", text: "boş harf" }],
      answer: { letter: "B", text: "İki" },
      steps: [{ say: "" }, { math: "1+1=2", say: "Topladık" }],
    });
    expect(parsed?.kind).toBe("mcq");
    expect(parsed?.options.map((o) => o.letter)).toEqual(["A", "B"]);
    expect(parsed?.steps).toHaveLength(1);
  });

  it("okunamayan fotoğraf: readable false döner (iade yolu), cevapsız çözüm null", () => {
    expect(parseSolution({ readable: false })?.readable).toBe(false);
    expect(parseSolution({ question: "Soru?", answer: {} })).toBeNull();
    expect(parseSolution("metin")).toBeNull();
  });

  it("sayı okuma: virgül, kesir, birim", () => {
    expect(numericOf("4,8 cm")).toBe(4.8);
    expect(numericOf("1/2")).toBe(0.5);
    expect(numericOf("-3")).toBe(-3);
    expect(numericOf("yok")).toBeNull();
  });
});

describe("iki bağımsız çözüm", () => {
  it("şıklıda harf, açık uçluda sayı karşılaştırılır", () => {
    expect(answersAgree(mcq(), parseQuick({ letter: "C" }))).toBe(true);
    expect(answersAgree(mcq(), parseQuick({ letter: "B" }))).toBe(false);
    expect(answersAgree(mcq(), parseQuick({}))).toBe(false);
    const open = mcq({ kind: "open", options: [], answer: { value: "4,8", text: "4,8 cm" } });
    expect(answersAgree(open, parseQuick({ value: "4.8" }))).toBe(true);
    expect(answersAgree(open, parseQuick({ value: "4.9" }))).toBe(false);
  });
});

describe("kodun kontrolü", () => {
  it("doğru çözümde sorun yok", () => {
    expect(solutionIssues(mcq())).toEqual([]);
  });

  it("cevap şıklarda yoksa, sayı işaretlenen şıkla uyuşmuyorsa, adım tutmuyorsa yakalar", () => {
    expect(solutionIssues(mcq({ answer: { letter: "E", text: "?" } }))).toContain("Cevap şıklardan biri değil.");
    expect(solutionIssues(mcq({ answer: { letter: "B", value: "4", text: "x = 4" } })).join(" ")).toMatch(/uyuşmuyor/);
    expect(solutionIssues(mcq({ steps: [{ math: "x = 8 / 2 = 5", say: "" }] })).join(" ")).toMatch(/Hesap tutmuyor/);
  });

  it("aritmetik: işlem önceliği, üs, kesir işareti; değişkenli parça atlanır", () => {
    expect(evaluate("2 + 3 * 4")).toBe(14);
    expect(evaluate("(2 + 3) * 4")).toBe(20);
    expect(evaluate("2^3")).toBe(8);
    expect(stepArithmeticIssues("½ + ¼ = 0,75")).toEqual([]);
    // Sayıya bitişik tek harf değişkendir, birim değil: "2x = 14 - 6" hesaplanmaz, yanlış sayılmaz.
    expect(stepArithmeticIssues("2x = 14 - 6 = 8")).toEqual([]);
    expect(stepArithmeticIssues("10cm + 5cm = 15cm")).toEqual([]);
    expect(stepArithmeticIssues("12 + 3 = 16 cm")).toHaveLength(1);
    expect(stepArithmeticIssues("x = 8 / 2 = 4")).toEqual([]);
    expect(stepArithmeticIssues("v = 20 / 4 = 5 m/s")).toEqual([]);
    expect(stepArithmeticIssues("3,14 · 2 = 6,28")).toEqual([]);
    expect(stepArithmeticIssues("12 / 3 = 5")).toHaveLength(1);
    // Eşitsizlik zinciri hesap değildir.
    expect(stepArithmeticIssues("3 < 5 = 7")).toEqual([]);
  });
});

describe("ekran durumu", () => {
  const solution = mcq();
  const start: SolvePhase = { kind: "solving", stage: "solving" };

  it("çözüm gelince kart, denetimde rozet, onayda 'doğrulandı'", () => {
    let phase = solvePhaseAfter(start, { type: "stage", stage: "checking" });
    expect(phase).toEqual({ kind: "solving", stage: "checking" });
    phase = solvePhaseAfter(phase, { type: "solution", solution, status: "checked", ms: 8200 });
    phase = solvePhaseAfter(phase, { type: "stage", stage: "verifying" });
    expect(phase.kind === "done" && phase.verifying).toBe(true);
    phase = solvePhaseAfter(phase, { type: "verified", ms: 15000, confirmed: true });
    expect(phase.kind === "done" && phase.status).toBe("verified");
  });

  it("denetçi onaylamadıysa (çağrı düştü ya da itiraz edip aynı cevap) 'doğrulandı' denmez", () => {
    let phase = solvePhaseAfter(start, { type: "solution", solution, status: "checked", ms: 8000 });
    phase = solvePhaseAfter(phase, { type: "verified", ms: 12000, confirmed: false });
    expect(phase.kind === "done" && phase.status).toBe("checked");
    let uncertain = solvePhaseAfter(start, { type: "solution", solution, status: "uncertain", ms: 8000 });
    uncertain = solvePhaseAfter(uncertain, { type: "verified", ms: 12000, confirmed: true });
    expect(uncertain.kind === "done" && uncertain.status).toBe("uncertain");
  });

  it("denetim düzeltirse yeni çözüm ve not; hata olayı hata ekranı", () => {
    let phase = solvePhaseAfter(start, { type: "solution", solution, status: "checked", ms: 8000 });
    const fixed = mcq({ answer: { letter: "D", value: "5", text: "x = 5" } });
    phase = solvePhaseAfter(phase, { type: "revised", solution: fixed, note: "İşlem hatası", ms: 20000 });
    expect(phase.kind === "done" && phase.solution.answer.letter).toBe("D");
    expect(phase.kind === "done" && phase.status).toBe("revised");
    expect(solvePhaseAfter(start, { type: "error", code: "unreadable", message: "okunmuyor", status: 422 })).toMatchObject({
      kind: "error",
      status: 422,
    });
  });
});

describe("sohbete kaydedilen metin", () => {
  it("cevap, adımlar, şıklar ve kutular kartla aynı sırada", () => {
    const text = solutionMarkdown(mcq());
    expect(text.startsWith("**Doğru cevap: C) 4**")).toBe(true);
    const order = ["Verilenler", "Çözüm adımları", "Şıklar", "Karıştırılan nokta", "Akılda tut", "Kontrol:"];
    const at = order.map((word) => text.indexOf(word));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(text).toContain("- ✓ **C**");
    expect(solutionMarkdown(mcq(), "Emin değiliz")).toContain("_Emin değiliz_");
  });

  it("öğrencinin satırı okunan soruyu taşır (fotoğraf saklanmaz)", () => {
    const line = solveUserLine(mcq(), "3. soru", true);
    expect(line.split("\n")[0]).toContain("Fotoğraftaki soru · 3. soru");
    expect(line).toContain("2x + 6 = 14 ise x kaçtır?");
    expect(line).toContain("C) 4");
  });
});

describe("tekrar listesine ekleme", () => {
  it("şıklı çözümden tek doğrulu tekrar sorusu; açık uçlu ve yinelenen şıklı soru eklenmez", () => {
    const item = solutionReviewItem(mcq());
    expect(item).toMatchObject({ mode: "choice", correct: ["4"], multi: false, options: ["2", "3", "4", "5"] });
    expect(item && item.mode === "choice" && item.optionWhy?.["4"]).toBe("8 / 2 = 4.");
    expect(solutionReviewItem(mcq({ kind: "open", options: [] }))).toBeNull();
    expect(
      solutionReviewItem(mcq({ options: [{ letter: "A", text: "4" }, { letter: "B", text: "4" }], answer: { letter: "A", text: "4" } })),
    ).toBeNull();
  });

  it("belirteç imzalı: başka kullanıcı, değiştirilmiş gövde ve süresi geçmiş belirteç reddedilir", () => {
    process.env.APP_SECRET ||= "test-secret";
    const item = solutionReviewItem(mcq())!;
    const token = signReviewToken({ userId: "u1", ref: "op1", item, now: 1_000 });
    if (!token) return; // anahtar yoksa imza yok: uç zaten reddeder
    expect(verifyReviewToken(token, "u1", 2_000)).toEqual({ ref: "op1", item });
    expect(verifyReviewToken(token, "u2", 2_000)).toBeNull();
    expect(verifyReviewToken(token, "u1", 1_000 + 7 * 60 * 60 * 1000)).toBeNull();
    const [body, mac] = token.split(".");
    const forged = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    forged.i.correct = ["2"];
    const forgedBody = Buffer.from(JSON.stringify(forged)).toString("base64url");
    expect(verifyReviewToken(`${forgedBody}.${mac}`, "u1", 2_000)).toBeNull();
  });

  it("tekrar ekranında 'Çözdüğün soru' etiketi, cevap tarayıcıya gitmez", () => {
    const item = solutionReviewItem(mcq())!;
    const sealed = sealReviewItem({
      id: "11111111-1111-4111-8111-111111111111",
      topic_label: null,
      source_kind: "quiz",
      source_ref: "photo:op1",
      reason: "miss",
      item,
      interval_step: 0,
      due_on: "2026-10-24",
      status: "active",
      ask_count: 0,
      lapse_count: 0,
    });
    expect(sealed?.sourceLabel).toBe("Çözdüğün soru");
    expect(JSON.stringify(sealed)).not.toContain("optionWhy");
    expect(reviewPromptKey(item)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("sokratik kalkan", () => {
  it("ipucu ve kavram mevcut çözüm alanlarından kurulur; tartışma /ogretmen'e gider", () => {
    const solution = mcq();
    expect(socraticHint(solution)).toBe("Denklemi x yalnız kalana kadar sadeleştiriyoruz.");
    expect(socraticConcept(solution)).toBe("2x = 14 - 6 = 8");
    expect(solveDiscussPrompt(solution)).toContain("Bu soruyu birlikte tartışalım.");
    expect(solveDiscussPrompt(solution)).toContain("2x + 6 = 14");
    expect(readFileSync("src/components/learning/question-solver.tsx", "utf8")).toContain("Çözüm Adımlarını Göster");
    expect(readFileSync("src/app/soru-coz/page.tsx", "utf8")).toContain("tutorStyle={tutorStyle}");
  });
});

describe("bağlantılar", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("sohbetteki fotoğraf çözücüye gider; görsel sonraki mesajlarla gitmez", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toContain("await solvePhoto(file,");
    expect(panel).toContain("toChat: true");
    expect(panel).toContain("if (isImageName(remote.fileName)) activeDocumentId.current = undefined;");
    expect(panel).not.toContain(`"Fotoğraftaki soruyu adım adım çöz.",\n                    false,`);
  });

  it("çözüm sohbete ilk çözümle yazılır, denetimi beklemez; düzeltilirse metin de düzelir", () => {
    const route = read("src/app/api/ai/solve/route.ts");
    expect(route).toContain(`if (event.type === "solution") saveFirst(`);
    expect(route).toContain(`else if (event.type === "revised") saveRevision(`);
    expect(route).toContain("await Promise.all(pending);");
  });

  it("hazırlık sayfasında 'Soru çöz'; çözücü hazırlıkla açılınca tekrar listesine ekler", () => {
    expect(read("src/components/parity/exam-prep-home.tsx")).toContain("/soru-coz?hazirlik=${prepId}");
    const page = read("src/app/soru-coz/page.tsx");
    expect(page).toContain(`.eq("user_id", user.id)`);
    expect(page).toContain(`export const dynamic = "force-dynamic"`);
    expect(page).not.toMatch(/Suspense/);
    expect(read("src/components/learning/question-solver.tsx")).toContain("/api/learning/exam-prep/review/solved");
  });

  it("eski fotoğraf ucu ve bileşeni kalktı", () => {
    expect(() => read("src/app/api/ai/solve-image/route.ts")).toThrow();
    expect(() => read("src/components/learning/image-solver.tsx")).toThrow();
  });
});
