-- Adaptive session resume idempotency
--
-- Root cause: startSession() called nextAction() on every resume of an
-- already-active session (page reload, tab restore, remount), and
-- nextAction() always mints a brand-new decisionTraceId. Content generation
-- is cached by decisionTraceId (action-content/store.ts), so a fresh id on
-- every resume always missed that cache. Net effect, confirmed live in
-- production 2026-09-27: a single page reload with no answer submitted
-- produced two `openai_decision` rows and two `intervention_started` events
-- for the same topic at the same timestamp, plus a brand-new question
-- silently replacing the one the student was looking at.
--
-- Fix persists the current *unanswered* action on the session row so resume
-- can return it without calling nextAction() again. A new action is computed
-- only once the pending one is answered (submitEvidence) or the session
-- completes (getActiveSession already excludes non-'active' sessions).
ALTER TABLE public.adaptive_learning_sessions
  ADD COLUMN IF NOT EXISTS pending_decision_trace_id uuid,
  ADD COLUMN IF NOT EXISTS pending_action jsonb;

-- The prior non-unique index let two concurrent /session/start calls (both
-- finding no existing active session) each insert their own 'active' row for
-- the same user_id+exam_prep_id, each minting its own decision. A unique
-- partial index makes the losing insert fail with 23505 instead; startSession
-- catches that and reads the winner's row + pending action.
--
-- Before applying to a database that already has adaptive session history,
-- check for pre-existing duplicates and resolve them first (e.g. mark the
-- older row 'abandoned') or this index creation will fail:
--   SELECT user_id, exam_prep_id, count(*)
--   FROM public.adaptive_learning_sessions
--   WHERE status = 'active'
--   GROUP BY 1, 2
--   HAVING count(*) > 1;
--
-- NULL note: PostgreSQL unique indexes treat NULLs as distinct from each
-- other by default (NULLS DISTINCT), which would let two "active" rows with
-- a NULL key column coexist and defeat this invariant. That does not apply
-- here: both user_id and exam_prep_id are declared NOT NULL on this table
-- (see the CREATE TABLE in 20260927120000_adaptive_learning_engine.sql,
-- lines 109-110) and neither column has ever been altered since, so NULL is
-- schema-impossible for either key column — no NULLS NOT DISTINCT (PG 15+)
-- or expression-index workaround is needed for the invariant to hold.
DROP INDEX IF EXISTS public.adaptive_learning_sessions_active_idx;

CREATE UNIQUE INDEX IF NOT EXISTS adaptive_learning_sessions_active_uidx
  ON public.adaptive_learning_sessions (user_id, exam_prep_id)
  WHERE status = 'active';

-- ─── Generation claims ───────────────────────────────────────────────────
-- The unique index above stops two concurrent /session/start calls from
-- creating two SESSION rows, but does not by itself stop them from each
-- running nextAction() for that session's first action: by the time the
-- losing insert reads the winner's row, the winner may well not have
-- finished generating (and therefore not yet persisted) its action, so a
-- naive "no pending_action yet -> generate one" fallback on the loser would
-- still mint a second decision. The same gap exists on the /session/evidence
-- path: two requests submitting the same answer (same idempotencyKey) both
-- see "no pending_action for the post-answer step yet" before either has
-- finished computing it.
--
-- This table makes "who gets to generate" a real, atomic, Postgres-enforced
-- claim, independent of any Node process — safe across Vercel's
-- multi-instance model. `token` is "start" for a session's first action, or
-- the answering evidence's idempotencyKey for the action that follows an
-- answer. Exactly one request can INSERT a given (session_id, token) pair;
-- every other concurrent request for the same pair gets 23505, and polls
-- this row until decision_trace_id/action are filled in by the winner. A
-- claim older than the app's stale threshold (20s at the time of writing,
-- see GENERATION_CLAIM_STALE_MS in session-engine.ts — comfortably above the
-- ~1-1.5s p95 decision latency observed in production) can be taken over by
-- another request, so a request that dies mid-generation does not wedge the
-- session forever.
CREATE TABLE IF NOT EXISTS public.adaptive_generation_claims (
  session_id uuid NOT NULL REFERENCES public.adaptive_learning_sessions (id) ON DELETE CASCADE,
  token text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  decision_trace_id uuid,
  action jsonb,
  PRIMARY KEY (session_id, token)
);

-- Purely an internal coordination table for session-engine.ts, accessed
-- only through the service-role client from /api/adaptive/* routes — unlike
-- every other adaptive_* table it has no user_id column and no legitimate
-- client-facing read (it holds no content a student's own UI ever displays
-- directly; the resulting action reaches them via adaptive_learning_sessions
-- instead). RLS is enabled with deliberately no policies, so both anon and
-- authenticated are denied by default and only the service role can touch it.
ALTER TABLE public.adaptive_generation_claims ENABLE ROW LEVEL SECURITY;
