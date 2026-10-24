import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { preferNextNodeForTracking } from "@/lib/learning/learning-tracking";
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

describe("Plus adımını atlayan yerler", () => {
  it("hazırlık sayfası, değerlendirme ve tamamlama aynı kararı kullanır", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/page.tsx", "utf8");
    expect(page).toContain("pathSkipKinds(service, user.id)");
    expect(page).toMatch(/node\.status === "ready" && !skipKinds\.has\(node\.kind\)/);
    expect(readFileSync("src/app/deneme-sinavlari/[prepId]/degerlendirme/page.tsx", "utf8")).toContain("skipKinds,");
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain("skipKindsRead ??= pathSkipKinds(service, userId)");
    expect(route).toContain("skipKinds: await skipKinds(),");
    expect(route).not.toMatch(/const \{ data: nextRow \} = await service/);
    expect(readFileSync("src/lib/learning/learning-tracking-persist.ts", "utf8")).toContain("skipKinds: input.skipKinds");
  });

  it("göç tamamlama fonksiyonunda aynı üç türü atlar", () => {
    const sql = readFileSync("supabase/migrations/20261024130000_free_path_skips_plus.sql", "utf8");
    for (const kind of PLUS_ONLY_NODE_KINDS) expect(sql).toContain(`'${kind}'`);
    expect(sql.match(/kind IN \('podcast', 'oral', 'written_exam'\)/g)?.length).toBe(3);
    expect(sql).not.toMatch(/DROP POLICY/i);
  });
});
