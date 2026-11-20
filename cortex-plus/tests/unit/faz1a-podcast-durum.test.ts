import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  PODCAST_STATUS_LABEL,
  PODCAST_STATUS_STEPS,
  furtherPodcastStatus,
  markPodcastReady,
  parsePodcastStatus,
  readPodcastStatus,
  validPodcastStatusId,
  writePodcastStatus,
} from "@/lib/learning/podcast-status";
import { PLAIN_PODCAST_KEY_SUFFIX, podcastCacheKey, podcastTopicKey } from "@/lib/learning/podcast-episode";

/* Faz 1-A §4.2 (19 Kasım 2026): podcast durum adımları, kontrolsüz bölüm önbelleği, takılan parçada tek yeniden istek. */

const ID = "7f1c2a40-3b5d-4c6e-8f90-1a2b3c4d5e6f";

describe("podcast durum adımları", () => {
  it("sıra şartnamedeki sıra; adlar öğrenci dilinde, iç kod adı yok", () => {
    expect(PODCAST_STATUS_STEPS).toEqual(["queued", "generating_script", "synthesizing_audio", "ready"]);
    for (const step of PODCAST_STATUS_STEPS) expect(PODCAST_STATUS_LABEL[step]).not.toMatch(/_|queued|ready/);
    expect(parsePodcastStatus("failed")).toBe("failed");
    expect(parsePodcastStatus("x")).toBeNull();
  });

  it("adım geri gitmez; hata her şeyin önüne geçer", () => {
    expect(furtherPodcastStatus("generating_script", "queued")).toBe("generating_script");
    expect(furtherPodcastStatus(null, "synthesizing_audio")).toBe("synthesizing_audio");
    expect(furtherPodcastStatus("ready", "failed")).toBe("failed");
  });

  it("yazım ve okuma kendi satırına; tablo yoksa podcast durmaz", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    await writePodcastStatus({ from: () => ({ upsert }) } as never, { id: ID, userId: "u1", prepId: "p1", topicId: null, status: "queued" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: ID, user_id: "u1", status: "queued" }), { onConflict: "id" });
    await writePodcastStatus({ from: () => ({ upsert }) } as never, { id: "kötü", userId: "u1", prepId: "p1", topicId: null, status: "queued" });
    expect(upsert).toHaveBeenCalledTimes(1);
    const missing = { from: () => ({ upsert: async () => ({ error: { code: "42P01" } }) }) };
    await expect(writePodcastStatus(missing as never, { id: ID, userId: "u1", prepId: "p1", topicId: null, status: "failed" })).resolves.toBeUndefined();
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { status: "synthesizing_audio", error_code: null, updated_at: "t" }, error: null }) };
    expect((await readPodcastStatus({ from: () => chain } as never, "u1", ID))?.status).toBe("synthesizing_audio");
    expect(validPodcastStatusId(ID)).toBe(true);
  });

  it("ready yalnız ses aşamasındaki kendi satıra yazılır", async () => {
    const eqs: [string, unknown][] = [];
    const chain = { update: () => chain, eq: (key: string, value: unknown) => (eqs.push([key, value]), chain), select: async () => ({ data: [{ id: ID }], error: null }) };
    expect(await markPodcastReady({ from: () => chain } as never, "u1", ID)).toBe(true);
    expect(eqs).toEqual([["id", ID], ["user_id", "u1"], ["status", "synthesizing_audio"]]);
  });
});

describe("kalıcı önbellek ve takılan parça", () => {
  it("ders sonu kontrolsüz bölüm ayrı anahtarla saklanır, kontrollü bölümün yerine geçmez", () => {
    expect(podcastCacheKey("Kaldırma kuvveti")).toBe(podcastTopicKey("Kaldırma kuvveti"));
    expect(podcastCacheKey("Kaldırma kuvveti", "plain")).toBe(`${podcastTopicKey("Kaldırma kuvveti")}${PLAIN_PODCAST_KEY_SUFFIX}`);
    const route = readFileSync("src/app/api/learning/exam-prep/podcast/route.ts", "utf8");
    expect(route).toContain('readPodcastCache(service, prepId, topic.label, length, "plain")');
    expect(route).toContain('variant: "plain"');
    for (const step of ["queued", "generating_script", "synthesizing_audio", "failed"]) expect(route).toContain(`markStatus("${step}"`);
  });

  it("oynatıcı takılan ses parçasını bir kez kendiliğinden yeniden ister; sunucu akışı kapanınca sentezi düşürmez", () => {
    const player = readFileSync("src/components/parity/exam-podcast-player.tsx", "utf8");
    expect(player).toContain("export const AUDIO_STALL_RETRIES = 1;");
    expect(player).toMatch(/stallRetries >= AUDIO_STALL_RETRIES/);
    const audio = readFileSync("src/app/api/learning/podcast/audio/route.ts", "utf8");
    expect(audio).toContain("if (!streamOpen) return;");
    const migration = readFileSync("supabase/migrations/20261119130000_faz1a_podcast_generation_status.sql", "utf8");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.podcast_generation_status");
    expect(migration).not.toMatch(/DROP|ALTER TABLE public\.(?!podcast_generation_status)/);
  });
});
