/**
 * Which exam prep the dashboard / Çalış surfaces should focus on.
 * Cookie: cp_focus_prep (prep id, 60 days). No migration required.
 */

export const FOCUS_PREP_COOKIE = "cp_focus_prep";
export const FOCUS_PREP_COOKIE_DAYS = 60;

export type FocusPrepCandidate = {
  id: string;
  title: string;
  examDate: string | null;
  createdAt: string;
  /** Most recent study activity (attempts / mastery / createdAt). */
  lastActivityAt: string | null;
  unfinished?: boolean;
};

export type FocusPrepInput = {
  preps: FocusPrepCandidate[];
  /** Active in-progress node attempt → that prep wins. */
  activeAttemptPrepId?: string | null;
  /** Explicit student choice from cookie (or profile). */
  cookiePrepId?: string | null;
  now?: Date;
};

export type FocusPrepResult = {
  focusPrepId: string | null;
  reason:
    | "active_attempt"
    | "cookie"
    | "just_created"
    | "recent_activity"
    | "nearest_exam"
    | "newest"
    | "none";
  /** Other unfinished prep with exam ≤3 days away — secondary chip, not hijack. */
  urgentChip: { prepId: string; title: string; daysLeft: number } | null;
};

function daysUntil(examDate: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(examDate);
  if (!m) return null;
  const exam = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((exam.getTime() - today.getTime()) / 86_400_000);
}

function isStalePast(examDate: string | null, now: Date): boolean {
  if (!examDate) return false;
  const days = daysUntil(examDate, now);
  return days != null && days < -7;
}

function activityTs(prep: FocusPrepCandidate): number {
  const raw = prep.lastActivityAt ?? prep.createdAt;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

export function selectFocusPrep(input: FocusPrepInput): FocusPrepResult {
  const now = input.now ?? new Date();
  const preps = input.preps.filter((p) => !isStalePast(p.examDate, now));
  if (!preps.length) {
    return { focusPrepId: null, reason: "none", urgentChip: null };
  }

  const byId = new Map(preps.map((p) => [p.id, p]));

  let focusId: string | null = null;
  let reason: FocusPrepResult["reason"] = "none";

  if (input.activeAttemptPrepId && byId.has(input.activeAttemptPrepId)) {
    focusId = input.activeAttemptPrepId;
    reason = "active_attempt";
  } else if (input.cookiePrepId && byId.has(input.cookiePrepId)) {
    const chosen = byId.get(input.cookiePrepId)!;
    if (!isStalePast(chosen.examDate, now)) {
      focusId = chosen.id;
      reason = "cookie";
    }
  }

  if (!focusId) {
    // Just created: created after the most recent study activity on any prep
    const maxActivity = Math.max(
      0,
      ...preps.map((p) => {
        const a = p.lastActivityAt ? Date.parse(p.lastActivityAt) : 0;
        return Number.isFinite(a) ? a : 0;
      }),
    );
    const fresh = [...preps]
      .filter((p) => {
        const created = Date.parse(p.createdAt);
        if (!Number.isFinite(created)) return false;
        // No study activity yet (lastActivityAt null or equals created)
        const studied =
          p.lastActivityAt &&
          Date.parse(p.lastActivityAt) > Date.parse(p.createdAt) + 1000;
        return !studied && created >= maxActivity;
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (fresh[0]) {
      focusId = fresh[0].id;
      reason = "just_created";
    }
  }

  if (!focusId) {
    const byActivity = [...preps].sort((a, b) => activityTs(b) - activityTs(a));
    if (byActivity[0] && activityTs(byActivity[0]) > 0) {
      focusId = byActivity[0].id;
      reason = "recent_activity";
    }
  }

  if (!focusId) {
    const future = preps
      .map((p) => ({ prep: p, days: p.examDate ? daysUntil(p.examDate, now) : null }))
      .filter((row) => row.days != null && row.days >= 0)
      .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
    if (future[0]) {
      focusId = future[0].prep.id;
      reason = "nearest_exam";
    } else {
      focusId = [...preps].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      )[0]!.id;
      reason = "newest";
    }
  }

  let urgentChip: FocusPrepResult["urgentChip"] = null;
  for (const prep of preps) {
    if (prep.id === focusId) continue;
    if (prep.unfinished === false) continue;
    const days = prep.examDate ? daysUntil(prep.examDate, now) : null;
    if (days != null && days >= 0 && days <= 3) {
      if (!urgentChip || days < urgentChip.daysLeft) {
        urgentChip = { prepId: prep.id, title: prep.title, daysLeft: days };
      }
    }
  }

  return { focusPrepId: focusId, reason, urgentChip };
}

export function focusPrepCookieHeader(prepId: string): string {
  const maxAge = FOCUS_PREP_COOKIE_DAYS * 24 * 60 * 60;
  return `${FOCUS_PREP_COOKIE}=${encodeURIComponent(prepId)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function parseFocusPrepCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === FOCUS_PREP_COOKIE) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=") || null;
      }
    }
  }
  return null;
}

/** Client-side cookie write (document.cookie). */
export function setFocusPrepCookieClient(prepId: string): void {
  if (typeof document === "undefined") return;
  document.cookie = focusPrepCookieHeader(prepId);
}
