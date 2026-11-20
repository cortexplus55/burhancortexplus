/**
 * Ücretsiz tekrarda boş kayıt şişmesi (19 Kasım 2026, Faz 4 denetimi): "Tekrar incele" / "Dersi tekrarla" her açılışta
 * yeni bir `active` satır yazıyordu. Cevapsız tekrar kaydı (süresi geçmemişse) yeniden açılır.
 */
import { describe, expect, it } from "vitest";
import { idleReplayReusable } from "@/lib/learning/node/replay";

describe("cevapsız tekrar kaydı", () => {
  const payload = { type: "quiz", questions: [], reviewed: true };

  it("cevap ve cevap izi yoksa yeniden açılır", () => {
    expect(idleReplayReusable({ payload, answers: null, answer_meta: null })).toBe(true);
    expect(idleReplayReusable({ payload, answers: {}, answer_meta: {} })).toBe(true);
    expect(idleReplayReusable({ payload, answers: [], answer_meta: null })).toBe(true);
  });

  it("tek cevap bile varsa yeni tekrar yazılır (yarım kalan çözüm ezilmez)", () => {
    expect(idleReplayReusable({ payload, answers: { "0": 1 }, answer_meta: {} })).toBe(false);
    expect(idleReplayReusable({ payload, answers: {}, answer_meta: { "0": { hints: 1 } } })).toBe(false);
  });

  it("süresi geçmiş yazılı deneme tekrarı yeniden açılmaz; gövdesiz kayıt da", () => {
    const now = Date.parse("2026-11-19T12:00:00Z");
    expect(idleReplayReusable({ payload, answers: {}, expires_at: "2026-11-19T11:00:00Z" }, now)).toBe(false);
    expect(idleReplayReusable({ payload, answers: {}, expires_at: "2026-11-19T13:00:00Z" }, now)).toBe(true);
    expect(idleReplayReusable({ payload: null, answers: {} })).toBe(false);
  });
});
