import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it } from "vitest";
import { freePathUnblockIds, preferNextNodeForTracking } from "@/lib/learning/learning-tracking";
import { PLUS_ONLY_NODE_KINDS } from "@/lib/billing/free-meters";
import type { NodeStatus, PlanNodeKind } from "@/lib/learning/exam-prep-plan";

/*
  24 Ekim 2026 lansman testi: ücretsiz öğrencinin yolu ilk dersten sonra podcast'te (Plus) duruyordu;
  "Devam et" podcast'i açıp "Plus'ta" kapısını gösteriyordu. Ücretsiz hesapta Plus adımı sıradaki olmaz.
*/
const at = (sortOrder: number, kind: PlanNodeKind, status: NodeStatus) => ({ id: `n${sortOrder}`, kind, status, sortOrder });

describe("preferNextNodeForTracking: ücretsiz hesap Plus adımına gönderilmez", () => {
  const nodes = [at(0, "lesson", "done"), at(1, "podcast", "ready"), at(2, "quiz", "ready"), at(3, "oral", "locked")];

  it("ücretsizde Plus adımı atlanır", () => {
    expect(preferNextNodeForTracking(nodes, { openMisconceptions: 0, weakOrStaleTopicKeys: [], skipKinds: PLUS_ONLY_NODE_KINDS })?.id).toBe("n2");
  });

  it("abonede sıradaki yine podcast", () => {
    expect(preferNextNodeForTracking(nodes, { openMisconceptions: 0, weakOrStaleTopicKeys: [] })?.id).toBe("n1");
  });

  it("açık adım yalnız Plus'sa bitmemiş ilk açılabilir adım", () => {
    const only = [at(0, "lesson", "done"), at(1, "podcast", "ready"), at(2, "quiz", "locked")];
    expect(preferNextNodeForTracking(only, { openMisconceptions: 0, weakOrStaleTopicKeys: [], skipKinds: PLUS_ONLY_NODE_KINDS })?.id).toBe("n2");
  });
});

describe("freePathUnblockIds: düzeltmeden önce takılan yol bir kez açılır", () => {
  it("canlıdaki takılı yol: ders bitti, podcast açık, gerisi kilitli → soru-cevap açılır", () => {
    const stuck = [at(0, "lesson", "done"), at(1, "podcast", "ready"), at(2, "qa", "locked"), at(3, "quiz", "locked")];
    expect(freePathUnblockIds(stuck, PLUS_ONLY_NODE_KINDS)).toEqual(["n2"]);
  });

  it("aradaki kilitli Plus adımları da açılır, ilk açılabilir adımda durur", () => {
    const stuck = [at(0, "lesson", "done"), at(1, "podcast", "ready"), at(2, "oral", "locked"), at(3, "quiz", "locked"), at(4, "spaced", "locked")];
    expect(freePathUnblockIds(stuck, PLUS_ONLY_NODE_KINDS)).toEqual(["n2", "n3"]);
  });

  it("açılabilir hazır adım varsa, abonede ya da önünde bitmemiş adım varsa dokunulmaz", () => {
    const fine = [at(0, "lesson", "done"), at(1, "podcast", "ready"), at(2, "quiz", "ready"), at(3, "spaced", "locked")];
    expect(freePathUnblockIds(fine, PLUS_ONLY_NODE_KINDS)).toEqual([]);
    const stuck = [at(0, "lesson", "done"), at(1, "podcast", "ready"), at(2, "quiz", "locked")];
    expect(freePathUnblockIds(stuck, new Set())).toEqual([]);
    expect(freePathUnblockIds([at(0, "lesson", "done"), at(1, "quiz", "locked")], PLUS_ONLY_NODE_KINDS)).toEqual(["n1"]);
  });
});

describe("Plus adımını atlayan yerler", () => {
  it("hazırlık sayfası, değerlendirme ve tamamlama aynı kararı kullanır", () => {
    const page = readSource("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(page).toContain("pathSkipKinds(service, user.id)");
    expect(page).toMatch(/node\.status === "ready" && !skipKinds\.has\(node\.kind\)/);
    expect(readSource("src/app/deneme-sinavlari/[prepId]/degerlendirme/page.tsx")).toContain("skipKinds,");
    const route = readSource("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("skipKindsRead ??= pathSkipKinds(service, userId)");
    expect(route).toContain("skipKinds: await skipKinds(),");
    expect(route).not.toMatch(/const \{ data: nextRow \} = await service/);
    expect(readSource("src/lib/learning/learning-tracking-persist.ts")).toContain("skipKinds: input.skipKinds");
  });

  it("göç tamamlama fonksiyonunda aynı üç türü atlar", () => {
    const sql = readSource("supabase/migrations/20261024130000_free_path_skips_plus.sql");
    for (const kind of PLUS_ONLY_NODE_KINDS) expect(sql).toContain(`'${kind}'`);
    expect(sql.match(/kind IN \('podcast', 'oral', 'written_exam'\)/g)?.length).toBe(3);
    expect(sql).not.toMatch(/DROP POLICY/i);
  });
});
