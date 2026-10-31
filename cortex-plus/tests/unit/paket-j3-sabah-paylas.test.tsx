// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const secret = vi.hoisted(() => ({ value: "test-secret-for-prep-invite" as string | undefined }));
vi.mock("@/lib/env", () => ({
  env: {
    get APP_SECRET() {
      return secret.value;
    },
    SUPABASE_SECRET_KEY: undefined,
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

import { readLessonV3, type LessonV3 } from "@/lib/learning/lesson-v3";
import {
  CRAM_EMPTY_TEXT,
  CRAM_LIMITS,
  CRAM_PRINT_LABEL,
  CRAM_SHEET_TITLE,
  buildCramSheet,
  clipCramText,
  collectLessonCram,
  examPrepCramSheetHref,
  mistakeCramText,
  reviewItemCramText,
} from "@/lib/learning/cram-sheet";
import {
  PREP_INVITE_TTL_MS,
  createPrepInviteToken,
  prepInvitePath,
  prepInviteSignupHref,
  prepInviteUrl,
  verifyPrepInviteToken,
} from "@/lib/learning/prep-invite";
import { PREP_SHARE_LABEL, isAbsoluteHttpUrl, prepInviteText, prepInviteWhatsappHref } from "@/lib/learning/prep-share";
import {
  EXAM_RESULT_ASK,
  EXAM_RESULT_LATER,
  chooseExamBaseline,
  examDatePassed,
  examResultCardText,
  examResultDue,
  examResultShareable,
  examResultTrend,
  examResultWhatsappHref,
  parseExamScore,
  parseStoredExamResult,
} from "@/lib/learning/exam-result";
import { parseLearningPreferences } from "@/lib/learning/exam-prep-ui-path";
import { ExamResultCard } from "@/components/parity/exam-result-card";
import { PrepShareTools } from "@/components/parity/prep-share-tools";

/*
  Paket J3 #14 (31 Ekim 2026): sınav sabahı kâğıdı (kayıtlı derslerden, model çağrısız, yazdırılır), sınıf grubuyla
  WhatsApp paylaşımı (imzalı davet, kendi kopyası) ve sınav sonrası başarı kartı (göçsüz learning_preferences).
  Örnekler farklı derslerden: fizik, tarih, biyoloji, muhasebe.
*/

const read = (path: string) => readFileSync(path, "utf8");
const PREP = "11111111-2222-4333-8444-555555555555";

function lesson(raw: unknown): LessonV3 {
  const parsed = readLessonV3(raw);
  if (!parsed) throw new Error("ders şemadan geçmedi");
  return parsed;
}

const physics = lesson({
  format: 3,
  title: "Hız ve ivme",
  screens: [
    {
      heading: "Ortalama hız",
      concept: "Ortalama hız",
      blocks: [
        { type: "text", text: "Ortalama hız, **yer değiştirmenin** geçen süreye oranıdır." },
        { type: "formula", formula: { title: "Ortalama hız", expression: "$v = \\frac{\\Delta x}{\\Delta t}$", symbols: [{ symbol: "v", meaning: "hız (m/s)" }] } },
        { type: "note", note: { title: "Sınav ipucu", body: "Yol değil yer değiştirme sorulur; işarete dikkat et.", tone: "exam" } },
        { type: "note", note: { title: "Genel bilgi: ışık hızı", body: "Işık boşlukta saniyede yaklaşık 300.000 km yol alır.", tone: "general" } },
        { type: "exam_trap_card", trap: { title: "Yol ≠ yer değiştirme", wrong: "Alınan yol ile yer değiştirme aynıdır.", right: "Yer değiştirme son konum eksi ilk konumdur." } },
      ],
    },
    {
      heading: "İvme",
      concept: "İvme",
      blocks: [
        { type: "procedure", procedure: { title: "İvme hesabı", steps: [{ label: "Hız farkını bul", detail: "son hız eksi ilk hız" }, { label: "Süreye böl", detail: "geçen süre" }] } },
        { type: "memory_hook_card", hook: { kind: "shortcut", title: "Eğim kuralı", body: "Hız-zaman grafiğinin eğimi ivmedir." } },
        { type: "note", note: { title: "Ezber kodu", body: "HİZ: Hız İvmeyle Zamanla değişir.", tone: "mnemonic" } },
        { type: "note", note: { title: "Akılda tut", body: "İvme vektörel bir büyüklüktür.", tone: "remember" } },
      ],
    },
  ],
  commonMistake: { claim: "Sabit hızda ivme vardır.", correction: "Sabit hızda ivme sıfırdır." },
});

const history = lesson({
  format: 3,
  title: "Osmanlı kuruluş dönemi",
  screens: [
    {
      heading: "Kuruluş",
      blocks: [
        { type: "text", text: "Osmanlı Beyliği 1299 yılında kuruldu." },
        // Aynı formül fizik dersinde de var: kâğıtta yalnız ilk konuda kalır.
        { type: "formula", formula: { title: "Ortalama hız", expression: "$v = \\frac{\\Delta x}{\\Delta t}$" } },
        { type: "note", note: { title: "Sınav ipucu", body: "Bursa'nın fethi 1326 yılıdır; başkent olur.", tone: "exam" } },
      ],
    },
  ],
});

describe("Paket J3 #14 · sınav sabahı kâğıdı", () => {
  it("etiketler birebir; adres hazırlığın altında", () => {
    expect(CRAM_SHEET_TITLE).toBe("⚡ Sınav Sabahı 15 Dakikalık Son Tekrar & Formül Kağıdı");
    expect(CRAM_PRINT_LABEL).toBe("Yazdır / PDF olarak kaydet");
    expect(CRAM_EMPTY_TEXT.startsWith("Önce birkaç ders bitir")).toBe(true);
    expect(examPrepCramSheetHref(PREP)).toBe(`/deneme-sinavlari/${PREP}/sinav-sabahi`);
  });

  it("dersten formül, ipucu, tuzak, hafıza çivisi, ezber kodu ve sık yapılan hatayı alır; genel bilgiyi almaz", () => {
    const rows = collectLessonCram(physics);
    const kinds = rows.map((row) => row.kind);
    expect(kinds).toEqual(["formula", "exam", "trap", "procedure", "hook", "mnemonic", "remember", "trap"]);
    expect(rows[0]!.text).toContain("v: hız (m/s)");
    expect(rows.find((row) => row.kind === "procedure")!.text).toBe("Hız farkını bul → Süreye böl");
    expect(rows.at(-1)!.text).toBe("Sakın: Sabit hızda ivme vardır. · Doğrusu: Sabit hızda ivme sıfırdır.");
    expect(rows.some((row) => row.text.includes("ışık"))).toBe(false);
  });

  it("konular yolun sırasıyla; tekrar eden formül ilk konuda kalır; konusuz ders kendi adıyla sonda", () => {
    const orphan = lesson({
      format: 3,
      title: "Hücre bölünmesi",
      screens: [{ heading: "Mitoz", blocks: [{ type: "note", note: { title: "Akılda tut", body: "Mitozda kromozom sayısı değişmez.", tone: "remember" } }] }],
    });
    const sheet = buildCramSheet({
      topics: [
        { key: "t1", label: "Hareket" },
        { key: "t2", label: "Osmanlı tarihi" },
      ],
      // Ders sırası karışık gelse de bölüm sırası yolun sırası.
      lessons: [
        { topicKey: "t2", lesson: history },
        { topicKey: "t1", lesson: physics },
        { topicKey: null, lesson: orphan },
      ],
      examPoints: [{ topicKey: "t2", points: ["Osmanlı'nın ilk başkenti Söğüt'tür."] }],
      focusTopics: [{ label: "Osmanlı tarihi", percent: 35 }],
    });
    expect(sheet.sections.map((section) => section.topic)).toEqual(["Hareket", "Osmanlı tarihi", "Hücre bölünmesi"]);
    const formulas = sheet.sections.flatMap((section) => section.items.filter((row) => row.kind === "formula"));
    expect(formulas).toHaveLength(1);
    const ottoman = sheet.sections[1]!;
    expect(ottoman.weak).toBe(true);
    expect(ottoman.percent).toBe(35);
    expect(ottoman.items.map((row) => row.kind)).toEqual(["exam", "point"]);
    expect(sheet.empty).toBe(false);
  });

  it("bir A4'e sığar: konu başına en çok 6, toplam en çok 36 satır; uzun metin kırpılır", () => {
    const busy = lesson({
      format: 3,
      title: "Muhasebe",
      screens: Array.from({ length: 10 }, (_, index) => ({
        heading: `Hesap ${index + 1}`,
        blocks: [
          { type: "note", note: { title: `İpucu ${index + 1}`, body: `${index + 1}. hesap grubunun borç ve alacak kuralı: ${"ayrıntı ".repeat(40)}`, tone: "exam" } },
          { type: "formula", formula: { title: `Kural ${index + 1}`, expression: `Varlık${index} = Kaynak${index}` } },
        ],
      })),
    });
    const topics = Array.from({ length: 9 }, (_, index) => ({ key: `k${index}`, label: `Konu ${index + 1}` }));
    const sheet = buildCramSheet({ topics, lessons: topics.map((topic) => ({ topicKey: topic.key, lesson: busy })) });
    // Aynı ders dokuz konuda: tekrarlar atılır, yalnız ilk konu dolar.
    expect(sheet.sections).toHaveLength(1);
    expect(sheet.sections[0]!.items.length).toBeLessThanOrEqual(CRAM_LIMITS.perTopicMax);

    const many = buildCramSheet({
      topics,
      lessons: topics.map((topic, index) => ({
        topicKey: topic.key,
        lesson: lesson({
          format: 3,
          title: `Ders ${index}`,
          screens: Array.from({ length: 8 }, (_, step) => ({
            heading: `Ekran ${step}`,
            blocks: [{ type: "note", note: { title: "Akılda tut", body: `Konu ${index} kural ${step}: benzersiz bilgi ${index * 10 + step}.`, tone: "remember" } }],
          })),
        }),
      })),
    });
    expect(many.itemCount).toBeLessThanOrEqual(CRAM_LIMITS.total);
    expect(many.sections.every((section) => section.items.length <= CRAM_LIMITS.perTopicMax)).toBe(true);
    expect(many.sections.every((section) => section.items.length >= CRAM_LIMITS.perTopicMin)).toBe(true);
    const longest = Math.max(...sheet.sections.flatMap((section) => section.items.map((row) => row.text.length)));
    expect(longest).toBeLessThanOrEqual(CRAM_LIMITS.text + 1);
  });

  it("kırpma yarım matematik ve vurgu bırakmaz", () => {
    const clipped = clipCramText(`Kural: ${"uzun ".repeat(30)} $a^2 + b^2 = c^2$ ve **önemli terim** sonu`, 160);
    expect((clipped.match(/\$/g)?.length ?? 0) % 2).toBe(0);
    expect(clipped.split("**").length % 2).toBe(1);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipCramText("kısa metin")).toBe("kısa metin");
  });

  it("en çok yanıldığın noktalar: tekrar edenler atılır, en çok 8; tekrar öğesi ve defter satırı okunur", () => {
    expect(reviewItemCramText({ mode: "choice", prompt: "Mitozda kromozom sayısı?", options: ["Değişmez", "Yarıya iner"], correct: ["Değişmez"], multi: false })).toBe(
      "Mitozda kromozom sayısı? → Doğrusu: Değişmez",
    );
    expect(
      reviewItemCramText({ mode: "choice", prompt: "Fotosentez gece olur.", options: ["Doğru", "Yanlış"], correct: ["Yanlış"], multi: false, trueFalse: true, corrected: "Fotosentez ışıkta olur." }),
    ).toBe("Fotosentez gece olur. → Doğrusu: Fotosentez ışıkta olur.");
    expect(reviewItemCramText({ mode: "recall", front: "ATP", back: "Hücrenin enerji birimi" })).toBe("ATP → Hücrenin enerji birimi");
    expect(reviewItemCramText(null)).toBeNull();
    expect(mistakeCramText("100 hesabı hangi gruptadır?", "Dönen varlıklar")).toBe("100 hesabı hangi gruptadır? → Doğrusu: Dönen varlıklar");
    expect(mistakeCramText("Soru", "")).toBeNull();

    const spots = Array.from({ length: 12 }, (_, index) => ({ text: `Yanılgı ${index % 10}: kural ${index % 10}`, topic: "Biyoloji" }));
    const sheet = buildCramSheet({ topics: [], lessons: [], weakSpots: spots });
    expect(sheet.weakSpots).toHaveLength(CRAM_LIMITS.weakSpots);
    expect(new Set(sheet.weakSpots.map((spot) => spot.text)).size).toBe(sheet.weakSpots.length);
    expect(sheet.empty).toBe(false);
  });

  it("hiçbir şey yoksa boş durum", () => {
    const sheet = buildCramSheet({ topics: [{ key: "a", label: "Konu" }], lessons: [], examPoints: [], weakSpots: [] });
    expect(sheet).toMatchObject({ empty: true, itemCount: 0, sections: [], weakSpots: [] });
  });

  it("sayfa: oturumlu, sahibi denetlenir, force-dynamic; Suspense ve loading.tsx yok; yazdırma CSS'i çerçeveyi gizler", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/sinav-sabahi/page.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain('.eq("user_id", user.id)');
    expect(page).toContain("loadCramSheet(");
    expect(page).not.toMatch(/<Suspense|\{[^}]*\bSuspense\b[^}]*\}\s*from "react"/);
    expect(existsSync("src/app/deneme-sinavlari/[prepId]/sinav-sabahi/loading.tsx")).toBe(false);
    expect(read("src/lib/learning/cram-sheet-load.ts")).toContain("readLessonV3(row.content_json)");
    expect(read("src/lib/learning/cram-sheet-load.ts")).not.toMatch(/lessonV2Schema|generateJson|openai/i);
    expect(read("src/components/parity/cram-print-button.tsx")).toContain("window.print()");
    const css = read("src/styles/cram-sheet.css");
    expect(css).toContain("@media print");
    expect(css).toMatch(/\.cp-sor-top,[\s\S]*display: none !important/);
    expect(css).toContain("column-count: 2");
    // Dosya hazırlık sayfasında da yükleniyor: yazdırma kuralı yalnız kâğıt sayfasında geçerli (yoksa başka sayfa boş basılır).
    expect(css).not.toMatch(/^\s*body \* \{/m);
    expect(css).toContain("body:has(.cp-cram-sheet) * {");
    expect(css).toContain("body:has(.cp-cram-sheet) .cp-cram-sheet *");
    expect(page).toContain('className="cp-cram cp-cram-sheet"');
    expect(read("src/components/parity/prep-share-tools.tsx")).toContain("{CRAM_SHEET_TITLE}");
  });
});

describe("Paket J3 #14 · sınıf grubuyla paylaşım", () => {
  it("düğme etiketi birebir; WhatsApp metni mutlak bağlantıyla", () => {
    expect(PREP_SHARE_LABEL).toBe("📲 Bu Hazırlığı Sınıf Arkadaşlarınla (WhatsApp) Paylaş");
    const token = createPrepInviteToken(PREP, 1_000_000)!;
    const url = prepInviteUrl(token, "https://cortexplus.app/");
    expect(url).toBe(`https://cortexplus.app/hazirlik-davet/${token}`);
    expect(isAbsoluteHttpUrl(url)).toBe(true);
    // Varsayılan köken de mutlak (sunucuda appOrigin, tarayıcıda window.location).
    expect(isAbsoluteHttpUrl(prepInviteUrl(token))).toBe(true);
    const href = prepInviteWhatsappHref("YKS Biyoloji", url);
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(href.slice("https://wa.me/?text=".length))).toBe(`${prepInviteText("YKS Biyoloji")} ${url}`);
    expect(prepInviteText("YKS Biyoloji")).not.toMatch(/https?:/);
  });

  it("imzalı, süreli, kurcalanamaz bağlantı; sır yoksa bağlantı yok", () => {
    const token = createPrepInviteToken(PREP, 1_000_000)!;
    expect(token).toMatch(/^sinif\.[0-9a-f-]{36}\.\d+\.[A-Za-z0-9_-]+$/);
    const ok = verifyPrepInviteToken(token, 2_000_000);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.claims.prepId).toBe(PREP);
      expect(ok.claims.expiresAt).toBeGreaterThanOrEqual(1_000_000 + PREP_INVITE_TTL_MS);
    }
    // Aynı saat içinde bağlantı aynı kalır.
    expect(createPrepInviteToken(PREP, 1_000_500)).toBe(token);
    expect(verifyPrepInviteToken(token, 1_000_000 + PREP_INVITE_TTL_MS + 3_600_001)).toEqual({ ok: false, reason: "expired" });
    const parts = token.split(".");
    expect(verifyPrepInviteToken([parts[0], PREP.replace("1111", "9999"), parts[2], parts[3]].join("."), 2_000_000)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyPrepInviteToken([parts[0], parts[1], String(Number(parts[2]) + 3_600_000), parts[3]].join("."), 2_000_000)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyPrepInviteToken(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`, 2_000_000)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyPrepInviteToken(null)).toEqual({ ok: false, reason: "invalid" });
    expect(createPrepInviteToken("hazırlık-değil")).toBeNull();
    secret.value = undefined;
    try {
      expect(createPrepInviteToken(PREP)).toBeNull();
      expect(verifyPrepInviteToken(token)).toEqual({ ok: false, reason: "unconfigured" });
    } finally {
      secret.value = "test-secret-for-prep-invite";
    }
  });

  it("misafir kayda gider: davet kodu ve dönüş adresi korunur", () => {
    const token = createPrepInviteToken(PREP, 1_000_000)!;
    const href = prepInviteSignupHref(token, "ab12cd34");
    const params = new URL(href, "https://cortexplus.app").searchParams;
    expect(href.startsWith("/kayit?")).toBe(true);
    expect(params.get("ref")).toBe("AB12CD34");
    expect(params.get("next")).toBe(prepInvitePath(token));
    expect(new URL(prepInviteSignupHref(token, "<script>"), "https://x.y").searchParams.get("ref")).toBeNull();
  });

  it("katılım: imzalı bağlantı, sınır, ücretsiz kapı, kendi kopyası; kişisel veri kopyalanmaz", () => {
    const route = read("src/app/api/learning/exam-prep/invite/join/route.ts");
    expect(route).toContain('withUser(request, { scope: "prep-invite-join"');
    expect(route).toMatch(/if \(await freePrepLimitReached\(service, userId\)\)/);
    const store = read("src/lib/learning/prep-invite-store.ts");
    expect(store).toContain("verifyPrepInviteToken(token)");
    expect(store).toContain('visibility: "private"');
    expect(store).toContain("forked_from: source.id");
    expect(store).toContain('.select("label, sort_order")');
    expect(store).not.toMatch(/exam_prep_node_attempts|exam_prep_topic_mastery|exam_prep_misconceptions|full_name/);
    expect(store).toContain('source: "prep_joined"');
    const page = read("src/app/hazirlik-davet/[token]/page.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("prepInviteSignupHref(token");
    expect(page).not.toMatch(/<Suspense|full_name/);
    expect(existsSync("src/app/hazirlik-davet/[token]/loading.tsx")).toBe(false);
    // Hazırlık sayfası bağlantıyı sunucuda imzalar ve mutlak adresle verir.
    const prepPage = read("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(prepPage).toContain("createPrepInviteToken(prep.id as string)");
    expect(prepPage).toContain("prepInviteUrl(inviteToken)");
  });

  it("düğmeler hazırlık sayfasında: kâğıt bağlantısı ve WhatsApp adresi", () => {
    render(<PrepShareTools prepId={PREP} inviteUrl="https://cortexplus.app/hazirlik-davet/x" whatsappHref="https://wa.me/?text=a" />);
    const cram = screen.getByText(CRAM_SHEET_TITLE).closest("a")!;
    expect(cram.getAttribute("href")).toBe(examPrepCramSheetHref(PREP));
    const share = screen.getByText(PREP_SHARE_LABEL).closest("a")!;
    expect(share.getAttribute("href")).toBe("https://wa.me/?text=a");
    expect(share.getAttribute("target")).toBe("_blank");
    cleanup();
    render(<PrepShareTools prepId={PREP} inviteUrl={null} whatsappHref={null} />);
    expect(screen.queryByText(PREP_SHARE_LABEL)).toBeNull();
    expect(screen.getByText(CRAM_SHEET_TITLE)).toBeTruthy();
  });
});

describe("Paket J3 #14 · sınav sonrası başarı kartı", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("kart cümlesi: artış, aynı, düşüş, başlangıç yok; asla '+-'", () => {
    expect(examResultCardText({ baselinePct: 42, score: 88 })).toBe("🎓 Başlangıç: %42 → Sınav Notu: 88 (+46 Puan Artış!)");
    expect(examResultCardText({ baselinePct: 70, score: 70 })).toBe("🎓 Başlangıç: %70 → Sınav Notu: 70 (Başladığın seviyeyi korudun)");
    const down = examResultCardText({ baselinePct: 80, score: 64 });
    expect(down).toBe("🎓 Başlangıç: %80 → Sınav Notu: 64");
    expect(down).not.toMatch(/Artış|\+|-\d/);
    expect(examResultCardText({ baselinePct: null, score: 91 })).toBe("🎓 Sınav Notu: 91");
    for (let baseline = 0; baseline <= 100; baseline += 7) {
      for (let score = 0; score <= 100; score += 9) {
        const text = examResultCardText({ baselinePct: baseline, score });
        expect(text).not.toContain("+-");
        expect(text).not.toContain("+0");
      }
    }
    expect(examResultTrend(80, 64)).toBe("down");
    expect(examResultShareable("down")).toBe(false);
    expect(examResultShareable("up")).toBe(true);
    expect(examResultShareable("none")).toBe(true);
  });

  it("paylaşım tanıtım sayfasının mutlak adresiyle; kişisel veri yok", () => {
    const href = examResultWhatsappHref(examResultCardText({ baselinePct: 42, score: 88 }), "https://cortexplus.app/");
    const text = decodeURIComponent(href.slice("https://wa.me/?text=".length));
    expect(text).toBe("🎓 Başlangıç: %42 → Sınav Notu: 88 (+46 Puan Artış!) Cortex Plus ile hazırlandım. https://cortexplus.app/");
  });

  it("başlangıç: önce seviye tespiti, yoksa ilk puanlı adım (en az 3 soru), yoksa yok", () => {
    const attempts = [
      { kind: "lesson", score: 1, total: 4, createdAt: "2026-10-01T08:00:00Z" },
      { kind: "quiz", score: 2, total: 2, createdAt: "2026-10-02T08:00:00Z" },
      { kind: "true_false", score: 6, total: 10, createdAt: "2026-10-04T08:00:00Z" },
      { kind: "quiz", score: 4, total: 5, createdAt: "2026-10-03T08:00:00Z" },
    ];
    expect(chooseExamBaseline({ intro: { score: 5, total: 12 }, attempts })).toEqual({ pct: 42, source: "level" });
    expect(chooseExamBaseline({ intro: { score: 1, total: 2 }, attempts })).toEqual({ pct: 80, source: "first_test" });
    expect(chooseExamBaseline({ intro: null, attempts: attempts.slice(0, 2) })).toBeNull();
  });

  it("ne zaman sorulur: sınav günü geçti, not yok, erteleme bitti", () => {
    expect(examDatePassed("2026-10-30", "2026-10-31")).toBe(true);
    expect(examDatePassed("2026-10-31", "2026-10-31")).toBe(false);
    expect(examDatePassed(null, "2026-10-31")).toBe(false);
    expect(examResultDue({ examDate: "2026-10-30", today: "2026-10-31" })).toBe(true);
    expect(examResultDue({ examDate: "2026-10-30", today: "2026-10-31", snoozedUntil: "2026-11-02" })).toBe(false);
    expect(examResultDue({ examDate: "2026-10-30", today: "2026-11-02", snoozedUntil: "2026-11-02" })).toBe(true);
    expect(
      examResultDue({ examDate: "2026-10-30", today: "2026-10-31", result: { score: 80, at: "", baselinePct: null, baselineSource: null } }),
    ).toBe(false);
    expect(parseExamScore("85")).toBe(85);
    expect(parseExamScore(101)).toBeNull();
    expect(parseExamScore(85.5)).toBeNull();
    expect(parseExamScore("")).toBeNull();
  });

  it("learning_preferences gidiş-dönüş: not ve erteleme korunur, bozuk değer düşer, ayar kaydı silmez", () => {
    const stored = { score: 88, at: "2026-11-01T09:00:00.000Z", baselinePct: 42, baselineSource: "level" };
    const raw = { style: "examples", examTime: "10:00", examResult: stored, examResultSnoozedUntil: "2026-11-03" };
    const parsed = parseLearningPreferences(raw);
    expect(parsed.examResult).toEqual(stored);
    expect(parsed.examResultSnoozedUntil).toBe("2026-11-03");
    expect(parsed.examTime).toBe("10:00");
    // Ayarlar kaydı: `{ ...parseLearningPreferences(eski), ...yeni }` — not kaybolmaz.
    const saved = { ...parsed, ...{ style: "theory" as const, pace: "fast" as const } };
    expect(parseLearningPreferences(JSON.parse(JSON.stringify(saved))).examResult).toEqual(stored);
    expect(parseLearningPreferences({ examResult: { score: 140 }, examResultSnoozedUntil: "yarın" })).not.toHaveProperty("examResult");
    expect(parseLearningPreferences({ examResult: { score: 140 } })).not.toHaveProperty("examResultSnoozedUntil");
    expect(parseStoredExamResult({ score: 70, baselinePct: 300, baselineSource: "level" })).toEqual({
      score: 70,
      at: "",
      baselinePct: null,
      baselineSource: null,
    });
    const route = read("src/app/api/learning/exam-prep/exam-result/route.ts");
    expect(route).toContain('withUser(request, { scope: "exam-result"');
    expect(route).toContain('.eq("user_id", userId)');
    expect(route).toContain("next = { ...raw,");
  });

  it("ekran: sorulur, yazılınca kart; 'henüz açıklanmadı' kartı kapatır", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        calls.push(body);
        const payload = body.later ? { ok: true, snoozed: true } : { ok: true, result: { score: body.score, baselinePct: 42 } };
        return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    render(<ExamResultCard prepId={PREP} due stored={null} landingUrl="https://cortexplus.app/" />);
    expect(screen.getByText(`🎓 ${EXAM_RESULT_ASK}`)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Sınav notu (0-100)"), { target: { value: "88" } });
    fireEvent.click(screen.getByText("Kartımı oluştur"));
    expect(await screen.findByText("🎓 Başlangıç: %42 → Sınav Notu: 88 (+46 Puan Artış!)")).toBeTruthy();
    expect(calls[0]).toEqual({ prepId: PREP, score: 88 });
    const share = screen.getByText("WhatsApp'ta paylaş").closest("a")!;
    expect(share.getAttribute("href")).toContain(encodeURIComponent("https://cortexplus.app/"));
    cleanup();

    render(<ExamResultCard prepId={PREP} due stored={null} landingUrl="https://cortexplus.app/" />);
    fireEvent.click(screen.getByText(EXAM_RESULT_LATER));
    await vi.waitFor(() => expect(screen.queryByText(`🎓 ${EXAM_RESULT_ASK}`)).toBeNull());
    expect(calls[1]).toEqual({ prepId: PREP, later: true });
    cleanup();

    // Düşüşte nazik kart, paylaşım önerilmez; sınav geçmemişse ve not yoksa hiçbir şey.
    render(<ExamResultCard prepId={PREP} due={false} stored={{ score: 50, baselinePct: 70 }} landingUrl="https://cortexplus.app/" />);
    expect(screen.getByText("🎓 Başlangıç: %70 → Sınav Notu: 50")).toBeTruthy();
    expect(screen.queryByText("WhatsApp'ta paylaş")).toBeNull();
    cleanup();
    const { container } = render(<ExamResultCard prepId={PREP} due={false} stored={null} landingUrl="https://cortexplus.app/" />);
    expect(container.innerHTML).toBe("");
  });
});
