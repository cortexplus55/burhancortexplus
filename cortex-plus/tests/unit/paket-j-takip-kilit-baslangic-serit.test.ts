import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { gatePrepWide, nodeLockedForFree } from "@/lib/billing/free-topic-rule";
import { emailUnverifiedFromMetadata } from "@/lib/auth/email-unverified-flag";
import { firstTopicGate } from "@/components/parity/exam-node/gates";

/*
  Paket J takip (1 Kasım 2026): beklemesiz kilit kartı, başlangıç kıyası, e-posta şeridi her kabukta.
  Örnekler farklı derslerden (kimya, coğrafya, muhasebe); kural konuya bakmaz.
*/

const read = (path: string) => readFileSync(path, "utf8");

vi.mock("@/lib/billing/entitlements", () => ({ getUserEntitlements: vi.fn(async () => ({ isPremium: false })) }));
vi.mock("@/lib/billing/free-preview", () => ({ billingExempt: vi.fn(async () => false) }));

type Row = Record<string, unknown>;
function fakeService(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let head = false;
      const builder: Record<string, unknown> = {
        select(_cols: string, opts?: { head?: boolean }) {
          head = Boolean(opts?.head);
          return builder;
        },
        eq(col: string, value: unknown) {
          rows = rows.filter((row) => row[col] === value);
          return builder;
        },
        in(col: string, values: unknown[]) {
          rows = rows.filter((row) => values.includes(row[col]));
          return builder;
        },
        order() {
          return builder;
        },
        limit(n: number) {
          rows = rows.slice(0, n);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(resolve: (value: unknown) => void) {
          resolve(head ? { count: rows.length, error: null } : { data: rows, error: null });
        },
      };
      return builder;
    },
  };
}

describe("FIX 1 — beklemesiz kilit", () => {
  const first = { label: "Asitler ve Bazlar", ids: new Set(["t1", "doc-t1"]) };

  it("1. konunun adımı açık, başka konunun adımı kilitli, kaydı olan adım açık kalır", () => {
    expect(nodeLockedForFree(first, { nodeTopicId: "t1", prepWide: false, requestedTopicLabel: null, opened: false })).toBe(false);
    expect(nodeLockedForFree(first, { nodeTopicId: "doc-t1", prepWide: false, requestedTopicLabel: null, opened: false })).toBe(false);
    expect(nodeLockedForFree(first, { nodeTopicId: "t2", prepWide: false, requestedTopicLabel: null, opened: false })).toBe(true);
    expect(nodeLockedForFree(first, { nodeTopicId: "t2", prepWide: false, requestedTopicLabel: null, opened: true })).toBe(false);
    expect(nodeLockedForFree(first, { nodeTopicId: null, prepWide: false, requestedTopicLabel: null, opened: false })).toBe(true);
  });

  it("hazırlık geneli adım yalnız 1. konu seçiliyse açık (büyük/küçük harf Türkçe)", () => {
    expect(nodeLockedForFree(first, { nodeTopicId: null, prepWide: true, requestedTopicLabel: "ASİTLER VE BAZLAR", opened: false })).toBe(false);
    expect(nodeLockedForFree(first, { nodeTopicId: null, prepWide: true, requestedTopicLabel: null, opened: false })).toBe(true);
    expect(nodeLockedForFree(first, { nodeTopicId: null, prepWide: true, requestedTopicLabel: "Kıtalar", opened: false })).toBe(true);
  });

  it("hazırlık geneli tanımı başlatma isteğiyle aynı: uyarlamalı odaklı pratik kendi konusunu taşır", () => {
    expect(gatePrepWide("gaps", {}, "x")).toBe(true);
    expect(gatePrepWide("flashcards", null, "x")).toBe(true);
    expect(gatePrepWide("focused", { adaptive: "low", topicTitle: "Kıtalar" }, "x")).toBe(false);
    expect(gatePrepWide("lesson", {}, "x")).toBe(false);
    expect(read("src/lib/learning/node/start.ts")).toContain("prepWide: gatePrepWide(kind, node.session_meta, topicLabel)");
  });

  it("toplu karar (yol): kilitli adımlar ve 1. konu özeti; abonede null", async () => {
    const { freeTopicLocks } = await import("@/lib/billing/free-topic-gate");
    const service = fakeService({
      exam_prep_topics: [{ id: "t1", label: "Bilanço", document_topic_node_id: null, exam_prep_id: "p" }],
      exam_prep_nodes: [],
      exam_prep_node_attempts: [{ id: "a1", node_id: "n3", user_id: "u", exam_prep_id: "p", kind: "lesson", status: "completed", score: 2, total: 3 }],
    });
    const result = await freeTopicLocks(service as never, {
      userId: "u",
      prepId: "p",
      nodes: [
        { id: "n1", kind: "lesson", sessionMeta: { topicId: "t1" }, topicLabel: "Bilanço" },
        { id: "n2", kind: "quiz", sessionMeta: { topicId: "t2" }, topicLabel: "Gelir Tablosu" },
        { id: "n3", kind: "lesson", sessionMeta: { topicId: "t2" }, topicLabel: "Gelir Tablosu" },
        { id: "n4", kind: "gaps", sessionMeta: {}, topicLabel: "Muhasebe" },
      ],
    });
    expect(result?.lockedIds).toEqual(["n2", "n4"]);
    expect(result?.summary.title).toBe("Bilanço");

    const { getUserEntitlements } = await import("@/lib/billing/entitlements");
    vi.mocked(getUserEntitlements).mockResolvedValueOnce({ isPremium: true } as never);
    expect(await freeTopicLocks(service as never, { userId: "u", prepId: "p", nodes: [{ id: "n2", kind: "quiz", sessionMeta: { topicId: "t2" }, topicLabel: "x" }] })).toBeNull();
  });

  it("kart başlığı: 1. konu bittiyse 🚀 + 'Kalan Konuları Açmak İçin Plus'a Geç', bitmediyse 🔒", () => {
    const done = firstTopicGate({ title: "Bilanço", done: 3, total: 3, lessonsDone: 2, bestScore: 90, completed: true });
    expect(done.headline).toBe("🚀 1. Konuyu Başarıyla Tamamladın!");
    expect(done.message).toContain("Kalan Konuları Açmak İçin Plus'a Geç");
    expect(done.wins).toContain("📈 En iyi sonucun %90");
    expect(firstTopicGate({ title: "Bilanço", completed: false }).headline).toBe("🔒 Kalan konular Plus'ta");
  });

  it("adım sayfası kartı sunucuda çizer (oturum bileşeni yüklenmez); okuma düşerse açık; yol rozet + anında kart", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx");
    expect(page).toContain("}).catch(() => null);");
    expect(page.indexOf("<FirstTopicLockPage")).toBeLessThan(page.indexOf("<ExamNodeSession"));
    expect(page.indexOf("freeTopicGate(createServiceClient()")).toBeLessThan(page.indexOf("intro_deferred_at: new Date()"));
    const home = read("src/components/parity/exam-prep-home.tsx");
    expect(home).toContain('data-testid="path-plan-lock"');
    expect(home).toContain("if (node.planLocked && node.status !== \"done\")");
    const prepPage = read("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(prepPage).toContain("firstTopicLock={firstTopicLocks?.summary ?? null}");
  });
});

describe("FIX 3 — e-posta şeridi", () => {
  it("yalnız açık bayrak: doğrulanmış/Google/eksik bayrak şerit göstermez", () => {
    expect(emailUnverifiedFromMetadata({ email_unverified: true })).toBe(true);
    expect(emailUnverifiedFromMetadata({ email_unverified: false })).toBe(false);
    expect(emailUnverifiedFromMetadata({ provider: "google" })).toBe(false);
    expect(emailUnverifiedFromMetadata({ email_unverified: "true" })).toBe(false);
    expect(emailUnverifiedFromMetadata(null)).toBe(false);
  });

  it("her öğrenci kabuğunda (oturum dahil), kurucuda hiç; ilk değer sunucudan", () => {
    const shell = read("src/components/parity/sor-shell.tsx");
    expect(shell).toContain("{account?.isAdmin ? null : <EmailVerifyBanner initialUnverified={emailUnverified} />}");
    expect(read("src/lib/student/parity-shell-props.ts")).toContain("emailUnverified");
  });
});
