import { describe, expect, it } from "vitest";
import { closedGaps, latestAttemptForTopic, mergeExplainHistory, type ExplainAttempt } from "@/lib/learning/explain-history";

const attempt = (id: string, topic: string, extra: Partial<ExplainAttempt> = {}): ExplainAttempt => ({
  id,
  topic,
  explanation: "yeterince uzun bir anlatım metni burada",
  verdict: "kismen",
  summary: "özet",
  gaps: [{ point: "Işık evresi", why: "ATP bağını kurmadın" }],
  missed: [],
  createdAt: "2026-10-25T08:00:00.000Z",
  ...extra,
});

describe("anlatarak öğren geçmişi", () => {
  it("önceki eksiği yeni listede yoksa kapatılmış sayar", () => {
    expect(closedGaps([{ point: "Işık evresi" }, { point: "Calvin" }], [{ point: "Calvin döngüsü" }])).toEqual([
      "Işık evresi",
    ]);
    expect(closedGaps([{ point: "Işık evresi" }], [{ point: "ışık evresi ATP" }])).toEqual([]);
  });

  it("aynı konunun son denemesini ve birleşik geçmişi verir", () => {
    const older = attempt("a", "Fotosentez", { createdAt: "2026-10-24T08:00:00.000Z" });
    const newer = attempt("b", "Fotosentez", { createdAt: "2026-10-25T08:00:00.000Z", verdict: "anladin", gaps: [] });
    expect(latestAttemptForTopic([newer, older], "fotosentez")?.id).toBe("b");
    expect(mergeExplainHistory([newer], [older, newer]).map((row) => row.id)).toEqual(["b", "a"]);
  });
});
