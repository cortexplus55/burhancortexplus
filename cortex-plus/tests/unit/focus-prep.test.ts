import { describe, expect, it } from "vitest";
import {
  parseFocusPrepCookie,
  selectFocusPrep,
  type FocusPrepCandidate,
} from "@/lib/learning/focus-prep";

function prep(
  partial: Partial<FocusPrepCandidate> & { id: string },
): FocusPrepCandidate {
  return {
    title: partial.title ?? partial.id,
    examDate: partial.examDate ?? null,
    createdAt: partial.createdAt ?? "2026-09-01T00:00:00.000Z",
    lastActivityAt: partial.lastActivityAt ?? null,
    unfinished: partial.unfinished ?? true,
    id: partial.id,
  };
}

describe("selectFocusPrep", () => {
  const now = new Date("2026-09-28T12:00:00.000Z");

  it("picks just-created prep over older nearer exam (live case)", () => {
    const result = selectFocusPrep({
      now,
      preps: [
        prep({
          id: "old-trig",
          title: "Uat 99 Sayfa Trigonometri",
          examDate: "2026-10-11", // ~13 days
          createdAt: "2026-09-01T00:00:00.000Z",
          lastActivityAt: "2026-09-20T00:00:00.000Z",
        }),
        prep({
          id: "new-kpss",
          title: "KPSS Vatandaslik",
          examDate: "2026-10-26", // 28 days
          createdAt: "2026-09-28T11:59:00.000Z",
          lastActivityAt: null,
        }),
      ],
    });
    expect(result.focusPrepId).toBe("new-kpss");
    expect(result.reason).toBe("just_created");
  });

  it("activity recency beats exam proximity", () => {
    const result = selectFocusPrep({
      now,
      preps: [
        prep({
          id: "near",
          examDate: "2026-10-05",
          createdAt: "2026-09-01T00:00:00.000Z",
          lastActivityAt: "2026-09-10T00:00:00.000Z",
        }),
        prep({
          id: "far-but-active",
          examDate: "2026-11-01",
          createdAt: "2026-09-01T00:00:00.000Z",
          lastActivityAt: "2026-09-27T00:00:00.000Z",
        }),
      ],
    });
    expect(result.focusPrepId).toBe("far-but-active");
    expect(result.reason).toBe("recent_activity");
  });

  it("cookie choice wins when valid", () => {
    const result = selectFocusPrep({
      now,
      cookiePrepId: "chosen",
      preps: [
        prep({ id: "chosen", examDate: "2026-10-20", createdAt: "2026-09-01T00:00:00.000Z" }),
        prep({
          id: "other",
          examDate: "2026-10-05",
          createdAt: "2026-09-28T00:00:00.000Z",
          lastActivityAt: null,
        }),
      ],
    });
    expect(result.focusPrepId).toBe("chosen");
    expect(result.reason).toBe("cookie");
  });

  it("ignores stale cookie for exams >7 days past", () => {
    const result = selectFocusPrep({
      now,
      cookiePrepId: "stale",
      preps: [
        prep({
          id: "stale",
          examDate: "2026-09-01",
          createdAt: "2026-08-01T00:00:00.000Z",
        }),
        prep({
          id: "fresh",
          examDate: "2026-10-20",
          createdAt: "2026-09-28T00:00:00.000Z",
          lastActivityAt: null,
        }),
      ],
    });
    expect(result.focusPrepId).toBe("fresh");
  });

  it("surfaces urgent chip for ≤3 day exam without hijacking focus", () => {
    const result = selectFocusPrep({
      now,
      cookiePrepId: "focus",
      preps: [
        prep({
          id: "focus",
          title: "Odak",
          examDate: "2026-10-20",
          createdAt: "2026-09-01T00:00:00.000Z",
        }),
        prep({
          id: "urgent",
          title: "Yakın Sınav",
          examDate: "2026-09-30",
          createdAt: "2026-09-01T00:00:00.000Z",
          unfinished: true,
        }),
      ],
    });
    expect(result.focusPrepId).toBe("focus");
    expect(result.urgentChip?.prepId).toBe("urgent");
    expect(result.urgentChip?.daysLeft).toBe(2);
  });

  it("active attempt wins over everything", () => {
    const result = selectFocusPrep({
      now,
      activeAttemptPrepId: "attempt",
      cookiePrepId: "cookie",
      preps: [
        prep({ id: "attempt", examDate: "2026-11-01", createdAt: "2026-09-01T00:00:00.000Z" }),
        prep({
          id: "cookie",
          examDate: "2026-10-05",
          createdAt: "2026-09-28T00:00:00.000Z",
          lastActivityAt: null,
        }),
      ],
    });
    expect(result.focusPrepId).toBe("attempt");
    expect(result.reason).toBe("active_attempt");
  });

  it("parses focus cookie", () => {
    expect(parseFocusPrepCookie("cp_focus_prep=abc-123; Path=/")).toBe("abc-123");
    expect(parseFocusPrepCookie(null)).toBeNull();
  });
});
