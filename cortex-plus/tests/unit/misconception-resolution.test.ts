import { describe, expect, it } from "vitest";
import {
  misconceptionsToResolve,
  RESOLVE_DISTINCT_DAYS,
  sameTopicKey,
} from "@/lib/learning/misconception-resolution";

/*
  Yanılgı çözümü (20 Ekim 2026): satırlar yazılıyor ama hiç kapanmıyordu; bir kez yanlış yapan
  öğrenci "Hazırsın"a hiç ulaşamıyordu. Kural: aynı konu, yanılgıdan sonra, iki ayrı Türkiye
  gününde yardımsız doğru.
*/

const planned = ["Stokiyometri", "Gazlar"];
const miss = (over: Partial<{ id: string; topicLabel: string | null; attemptId: string | null; createdAt: string }> = {}) => ({
  id: "m1",
  topicLabel: "Stokiyometri",
  attemptId: "a0",
  createdAt: "2026-10-10T09:00:00.000Z",
  ...over,
});
const right = (createdAt: string, topicKey = "stokiyometri", attemptId = "a1") => ({ topicKey, attemptId, createdAt });

describe("misconceptionsToResolve", () => {
  it("iki gün kuralı", () => {
    expect(RESOLVE_DISTINCT_DAYS).toBe(2);
  });

  it("aynı Türkiye gününde iki doğru çözmez", () => {
    const ids = misconceptionsToResolve({
      open: [miss()],
      evidence: [right("2026-10-11T08:00:00.000Z"), right("2026-10-11T15:00:00.000Z", "stokiyometri", "a2")],
      plannedTopicKeys: planned,
    });
    expect(ids).toEqual([]);
  });

  it("yanılgıdan sonra iki ayrı günde doğru çözer", () => {
    const ids = misconceptionsToResolve({
      open: [miss()],
      evidence: [right("2026-10-11T08:00:00.000Z"), right("2026-10-13T08:00:00.000Z", "stokiyometri", "a2")],
      plannedTopicKeys: planned,
    });
    expect(ids).toEqual(["m1"]);
  });

  it("yanılgıyı yazan denemenin kendi doğruları sayılmaz", () => {
    const ids = misconceptionsToResolve({
      open: [miss({ attemptId: "a0" })],
      evidence: [right("2026-10-11T08:00:00.000Z", "stokiyometri", "a0"), right("2026-10-13T08:00:00.000Z", "stokiyometri", "a0")],
      plannedTopicKeys: planned,
    });
    expect(ids).toEqual([]);
  });

  it("yanılgıdan önceki doğrular sayılmaz", () => {
    const ids = misconceptionsToResolve({
      open: [miss({ createdAt: "2026-10-12T09:00:00.000Z" })],
      evidence: [right("2026-10-10T08:00:00.000Z"), right("2026-10-13T08:00:00.000Z", "stokiyometri", "a2")],
      plannedTopicKeys: planned,
    });
    expect(ids).toEqual([]);
  });

  it("başka konu çözmez; alt başlıklı aynı konu çözer", () => {
    const other = misconceptionsToResolve({
      open: [miss()],
      evidence: [right("2026-10-11T08:00:00.000Z", "gazlar"), right("2026-10-13T08:00:00.000Z", "gazlar", "a2")],
      plannedTopicKeys: planned,
    });
    expect(other).toEqual([]);
    const sub = misconceptionsToResolve({
      open: [miss()],
      evidence: [
        right("2026-10-11T08:00:00.000Z", "stokiyometri: sınırlayıcı bileşen"),
        right("2026-10-13T08:00:00.000Z", "stokiyometri: sınırlayıcı bileşen", "a2"),
      ],
      plannedTopicKeys: planned,
    });
    expect(sub).toEqual(["m1"]);
    expect(sameTopicKey("Stokiyometri", "stokiyometri: sınırlayıcı")).toBe(true);
    expect(sameTopicKey("Stokiyometri", "Gazlar")).toBe(false);
  });

  it("konusuz ya da planda olmayan yanılgı (sohbet) herhangi bir konunun doğrularıyla çözülür", () => {
    const ids = misconceptionsToResolve({
      open: [
        miss({ id: "chat-null", topicLabel: null, attemptId: null }),
        miss({ id: "chat-free", topicLabel: "Sohbette geçen serbest konu", attemptId: null }),
        miss({ id: "genel", topicLabel: "genel", attemptId: null }),
      ],
      evidence: [right("2026-10-11T08:00:00.000Z", "gazlar"), right("2026-10-13T08:00:00.000Z", "stokiyometri", "a2")],
      plannedTopicKeys: planned,
    });
    expect(ids.sort()).toEqual(["chat-free", "chat-null", "genel"]);
  });

  it("gün Türkiye'ye göre: 23:30 ve 00:30 (aynı UTC günü) iki ayrı gün", () => {
    // 20:30Z = 23:30 TRT (11 Ekim), 21:30Z = 00:30 TRT (12 Ekim); ikisi de UTC'de 11 Ekim.
    const ids = misconceptionsToResolve({
      open: [miss()],
      evidence: [right("2026-10-11T20:30:00.000Z"), right("2026-10-11T21:30:00.000Z", "stokiyometri", "a2")],
      plannedTopicKeys: planned,
    });
    expect(ids).toEqual(["m1"]);
  });
});
