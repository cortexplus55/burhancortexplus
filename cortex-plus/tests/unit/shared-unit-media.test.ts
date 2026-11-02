import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("paylaşımlı ünite medyası (belgesiz hazırlık)", () => {
  const video = read("src/app/api/learning/exam-prep/video/route.ts");
  const podcast = read("src/app/api/learning/exam-prep/podcast/route.ts");
  const lib = read("src/lib/content-pool/shared-media.ts");
  const mig = read("supabase/migrations/20261102150000_shared_unit_media.sql");

  it("Plus kapıları aynen: önbellek kapıdan sonra", () => {
    expect(video.indexOf('"video"')).toBeGreaterThan(-1);
    expect(video.indexOf("sharedMediaUnit(")).toBeGreaterThan(video.indexOf('"video"'));
    expect(podcast.indexOf("sharedMediaUnit(")).toBeGreaterThan(podcast.indexOf('"podcast"'));
  });
  it("yalnız belgesiz hazırlık; maliyet SHARED_CONTENT_MEDIA; tavan ortak", () => {
    expect(lib).toContain("data.document_id || docs");
    expect(lib).toContain('"SHARED_CONTENT_MEDIA"');
    expect(lib).toContain("sharedContentSpent");
    expect(video).toContain("sharedUsageCode: SHARED_MEDIA_CODE");
    expect(podcast).toContain("sharedUsageCode: SHARED_MEDIA_CODE");
  });
  it("göç eklemeli ve RLS kapalı-dışa", () => {
    expect(mig).toContain("create table if not exists");
    expect(mig).toContain("enable row level security");
    expect(mig).not.toMatch(/drop |alter column/i);
  });
});
