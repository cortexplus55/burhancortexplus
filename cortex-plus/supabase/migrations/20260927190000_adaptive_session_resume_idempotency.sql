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
DROP INDEX IF EXISTS public.adaptive_learning_sessions_active_idx;

CREATE UNIQUE INDEX IF NOT EXISTS adaptive_learning_sessions_active_uidx
  ON public.adaptive_learning_sessions (user_id, exam_prep_id)
  WHERE status = 'active';
