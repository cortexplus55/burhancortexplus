import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { splitForFastStart, tutorSpeechLines, TUTOR_TTS_LINE_CHARS, TUTOR_TTS_MAX_LINES } from "@/lib/speech/tutor-speech-lines";

/*
  Öğretmenin doğal sesi (öğretmen v3, 21 Kasım 2026): `POST /api/tutor/tts` metni akademik seslendirme motorundan geçirip
  öğretmen üslubunda seslendirir; ücret ses uçlarının ortak kuralıyla. Model ve ses çağrısı yok: ses katmanı sahte.
*/

const service = {};
const synthesizeCharged = vi.fn();
let feature = true;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/guards")>()),
  withUser: vi.fn(async () => ({ ok: true, ctx: { userId: "u1", service } })),
}));
vi.mock("@/lib/billing/entitlements", () => ({
  getUserEntitlements: vi.fn(async () => ({})),
  requireFeature: vi.fn(() => feature),
}));
vi.mock("@/lib/learning/audio-cache", () => ({ synthesizeCharged: (...args: unknown[]) => synthesizeCharged(...args) }));

const post = async (text: unknown) => {
  const { POST } = await import("@/app/api/tutor/tts/route");
  return POST(new Request("http://x/api/tutor/tts", { method: "POST", body: JSON.stringify({ text }) }));
};

beforeEach(() => {
  feature = true;
  synthesizeCharged.mockReset();
  synthesizeCharged.mockResolvedValue({ ok: true, creditsSpent: 15, tracks: [{ url: "https://ses/1.mp3", durationMs: 900 }] });
});

describe("öğretmen sesi ucu", () => {
  it("simgeler Türkçe okunuşa çevrilip öğretmen üslubunda seslendirilir", async () => {
    const response = await post("√45 = √9 × √5 olur. Na⁺ ve 120 mmHg.");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ creditsSpent: 15, parts: [{ url: "https://ses/1.mp3", durationMs: 900 }] });
    const lines = synthesizeCharged.mock.calls[0]![2] as { text: string; speaker: string; style: string }[];
    expect(lines.map((line) => line.text)).toEqual(["kök 45 eşittir kök 9 çarpı kök 5 olur.", "sodyum artı ve 120 milimetre cıva."]);
    expect(lines.every((line) => line.style === "tutor" && line.speaker === "ada")).toBe(true);
  });

  it("ücretsiz hesapta ses Plus'ta (402); hak yetmezse 402 insufficient_credits; arıza 503", async () => {
    synthesizeCharged.mockResolvedValueOnce({ ok: false, reason: "premium_required" });
    expect((await post("Kısa bir yanıt.")).status).toBe(402);
    synthesizeCharged.mockResolvedValueOnce({ ok: false, reason: "insufficient_credits" });
    const refused = await post("Kısa bir yanıt.");
    expect(refused.status).toBe(402);
    expect((await refused.json()).code).toBe("insufficient_credits");
    synthesizeCharged.mockResolvedValueOnce({ ok: false, reason: "audio_unavailable" });
    expect((await post("Kısa bir yanıt.")).status).toBe(503);
    feature = false;
    expect((await post("Kısa bir yanıt.")).status).toBe(402);
  });

  it("boş ya da çok uzun metin reddedilir", async () => {
    expect((await post("")).status).toBe(400);
    expect((await post("a".repeat(7000))).status).toBe(400);
    expect((await post("   ")).status).toBe(400);
  });
});

describe("satırlar ve hızlı başlangıç", () => {
  it("uzun cümle sınırın altında parçalanır; satır sayısı sınırlı", () => {
    const long = `${Array.from({ length: 60 }, (_, i) => `madde ${i + 1} burada uzun bir açıklama taşıyor`).join(", ")}.`;
    const lines = tutorSpeechLines(long);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.length <= TUTOR_TTS_LINE_CHARS)).toBe(true);
    const many = Array.from({ length: 80 }, (_, i) => `Cümle ${i + 1} burada.`).join(" ");
    expect(tutorSpeechLines(many)).toHaveLength(TUTOR_TTS_MAX_LINES);
  });

  it("ilk parça ilk cümlelerdir; kalanı arkadan istenir", () => {
    const [head, tail] = splitForFastStart("Harika gidiyorsun. Şimdi ikinci adıma geçelim. Sence kuvvet neye bağlı?");
    expect(head).toBe("Harika gidiyorsun. Şimdi ikinci adıma geçelim. Sence kuvvet neye bağlı?");
    expect(tail).toBe("");
    const text = `${"Bu birinci uzun cümle oldukça fazla ayrıntı taşıyor ve hızlı başlangıçta tek başına gider. ".repeat(3)}Son soru?`;
    const [first, rest] = splitForFastStart(text);
    expect(first.length).toBeLessThanOrEqual(220);
    expect(rest.endsWith("Son soru?")).toBe(true);
  });
});

describe("tarayıcının robot sesi kullanılmaz", () => {
  it("öğretmen v3'ün 🔊 ve kendiliğinden okuma yolu sunucu sesine gider", () => {
    const panel = readFileSync("src/components/chat/chat-panel.tsx", "utf8");
    const speak = panel.slice(panel.indexOf("function speakReply"), panel.indexOf("function toggleSpeakReply"));
    expect(speak).toContain("playTutorVoice(");
    expect(speak).not.toContain("speakTurkish(");
    const voice = readFileSync("src/lib/teacher/tutor-voice.ts", "utf8");
    expect(voice).toContain('"/api/tutor/tts"');
    expect(voice).not.toMatch(/speechSynthesis\.|SpeechSynthesisUtterance/);
  });
});
