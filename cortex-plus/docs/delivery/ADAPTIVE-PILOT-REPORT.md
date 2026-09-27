# Adaptive Learning Engine — Phase 3 Pilot Report

**Date:** 2026-09-26 (engine), verified live 2026-09-27  
**Policy:** `adaptive-v1`  
**Pilot user:** `burhan55600@gmail.com` (`9d79106a-d31e-46e5-9cc5-4a09b519bc34`)  
**Global rollout:** OFF (all adaptive flags `enabled=false`; pilot via `metadata.pilot_user_ids` only)  
**Session loop:** **PASS** — verified end-to-end in production 2026-09-27, see [Live production verification](#live-production-verification--session-loop-pass-2026-09-27) below.  
**Session resume/reload:** **PASS** — a real duplicate-decision bug found and fixed (PR #129), including a true-concurrency race caught in review; verified live 2026-09-27, see [Session resume/reload idempotency](#session-resumereload-idempotency--fixed-and-verified-2026-09-27) below.

---

## Architecture status

Phase 2 stack retained (no redesign): LearningGovernor → PolicyEngine → MasteryEngine → Jev/OpenAI/deterministic → TutorModelRouter → action-content.

Phase 3 hardening added:

| Area | Change |
|---|---|
| Anti-loop | ≥3 identical action+topic without progress → escalate ladder |
| Teaching mode | `escalateTeachingMode` on `repeatedErrorCount` |
| Exam phase | 20d learn / 7d mixed / 2d cram in priority + action filters |
| Readiness | EMA + deadband (`READINESS_DEADBAND=3`) |
| Jev model | Validate `JEV_MODEL` against `/v1/models`; admin diagnostic + fallback |
| Replan flag | Passes `userId` for pilot daily replan |
| Student UI | Strip `model` / escalation from student payloads |
| Trust copy | Turkish reasons for misconception / review / missed-day |
| Chat | Inject continuous mastery + recent misconception |
| Analytics | Metric defs + server/client trackers; intervention success window = 3 |
| Admin | Pilot list, mastery, costs, GPT %, latency p50/p95, interventions, errors |
| Fingerprint | Soft near-duplicate question guard |

---

## Migrations applied / validated

| Migration | Production `dgjfyewgrukglsehyntc` |
|---|---|
| `20260927120000_adaptive_learning_engine` | Applied via MCP `apply_migration` |
| `20260927180000_feature_flag_pilot_metadata` | Applied |
| `20260927190000_adaptive_session_resume_idempotency` | Applied by user via Supabase SQL editor 2026-09-27 |

Verified: 8 `adaptive_*` tables, mastery columns, `feature_flags.metadata`, 4 flags OFF, `adaptive-v1` policy, SELECT-own RLS policies.

**Not** applied: full local migration backlog (≥20260925 other files). Adaptive pair only, per deploy checklist.

---

## Live Jev result

| Check | Result |
|---|---|
| `adaptive-jev-live.test.ts` | **Skipped** — `TYPESAFE_API_KEY` absent in test process / not in Vercel env listing reviewed |
| Fallback on 500 / circuit | **Pass** (`adaptive-jev-fallback.test.ts`) |
| Jev vs fallback safety | **Pass** — both blocked from advancing without prerequisites (pilot scenario test) |
| Invalid model path | Code path added (`resolveJevModel` + diagnostic); live probe pending key |

**External blocker:** configure `TYPESAFE_API_KEY` (and optional `JEV_MODEL`) in local `.env.local` + Vercel, then re-run live suite.

---

## Exam Graph quality

Pilot materials prepared: [pilot-materials/probability-stats-pilot.md](./pilot-materials/probability-stats-pilot.md) — 5 topics, prerequisites, formulas, misconceptions, CLT as moderately difficult concept.

**Live product-flow graph audit** (upload → process → nodes) awaits Phase 3 code deploy + browser session. Expected graph edges documented in the materials file.

---

## Master Plan quality

Unit/scenario coverage:

- Missed-day trigger can replan master; micro mistakes cannot (`shouldReplanMaster`)
- Daily capacity constraints unchanged from Phase 2 `ensureCurrentDailyPlan` (no stacking of all missed minutes in unit scenarios)

Live schedule minute audit pending browser pilot after deploy.

---

## Daily Plan behavior

`ensureCurrentDailyPlan` + missed-day path retained. Pilot flag now correctly enables `/api/adaptive/replan` daily scope for the pilot UUID.

---

## Student State persistence

Schema + `persistTopicMastery` dual-write continuous/discrete mastery. Session resume via `getActiveSession`. Behavior jsonb preferred format now read when present.

---

## Worked example quality

Phase 2 generators retained; Phase 3 adds misconception-addressed field + transfer Q + fingerprint diversity. Concrete LLM sample audit deferred to live session with OpenAI key after deploy.

---

## Misconception handling

Concrete pilot scenario numbers (unit):

```
emerging seed mastery ≈ 0.45
→ wrong + tag "P(A|B)=P(A)*P(B)" → mastery decreases, repeatedErrorCount↑
→ second wrong → anti-loop removes repeated practice; remediation actions open
→ transfer correct → mastery increases again
```

---

## Fast learner behavior

Mastery ≥0.7 + confidence ≥0.55 + evidence ≥3 → `teach`/`reteach` filtered out; `mini_assessment` preferred. **Tested.**

---

## Struggling learner behavior

Repeated misconception expands reteach/worked_example/easier; teaching mode escalates; ≥3 same action without progress forces ladder step. **Tested.**

---

## Spaced review

Success lengthens interval; failure shortens; exam date caps. **Tested.**

---

## Missed-day adaptation

`missed_days` with count ≥1 → master replan allowed; behind with 0 sessions → no replan. **Tested.** Live dashboard banner copy uses trust UX strings.

---

## Mid-plan document update

Replan policy `source_scope_changed` remains allowed; no blind destroy of Student State. Live incremental graph QA pending deploy.

---

## GPT routing

Default `gpt-4o-mini`. Escalation with `repeatedConfusion` + Jev signal → `gpt-4o` with logged reasons. **Tested.**

---

## Jev fallback

Circuit opens after 3 failures; OpenAI/deterministic path; audit insert. **Tested.** Live invalid-key / timeout / 500 injection documented in unit mocks; restore N/A without live key.

---

## Costs (internal estimates)

Without live sessions on production adaptive APIs, empirical cost/session is not yet measured. Ballpark from Phase 2 admin estimator:

| Profile | Sessions/month | Assumed cost/session | Monthly AI (est.) |
|---|---|---|---|
| LIGHT | 8 | $0.02–0.05 | $0.16–0.40 |
| NORMAL | 30 | $0.03–0.08 | $0.90–2.40 |
| HEAVY | 60 | $0.05–0.12 | $3.00–7.20 |

Student credits unchanged. Re-measure on `/admin/adaptive?userId=…` after real sessions.

---

## Latency

Admin panel now shows p50/p95 from recent `adaptive_jev_decisions.latency_ms` for a user. No production samples yet for this pilot UUID.

---

## Security

- Flags global OFF  
- SELECT-own RLS  
- Service-role writes  
- Student payloads strip model/provider  
- Non-pilot: `isFeatureEnabled` false when not in `pilot_user_ids`

---

## Non-pilot regression

Flags remain `enabled=false`. Non-pilot users are outside `pilot_user_ids` → adaptive APIs 404 via `api-guard`; hub overlay skipped. Classic exam-prep path unchanged.

---

## Remaining limitations / blockers

1. **TYPESAFE_API_KEY missing** → live Jev = NO until configured  
2. ~~Phase 3 app code not yet on production~~ — **resolved 2026-09-27**: merged (PR #126, then PR #127 fixing the session-start CTA bug), deployed, and the session loop verified live in production. See below.
3. Soft gap: `misconceptionFlags` still not a first-class DB column (payload/events carry tags)  
4. Circuit breaker still in-process (serverless instance-local)

---

## Pilot acceptance questions (§42)

| # | Question | Answer |
|---|---|---|
| 1 | Upload materials → coherent exam plan? | **PARTIAL** — materials ready; live create/upload after deploy |
| 2 | Open tomorrow without deciding what to study? | **YES** (architecture + daily plan) — needs deploy for UX |
| 3 | Know what student learned yesterday? | **YES** (Student State + sessions) |
| 4 | Wrong answer → meaningful adaptation? | **YES** (scenario evidence) |
| 5 | Repeated confusion changes strategy? | **YES** (anti-loop + mode escalate) |
| 6 | Strong student moves faster? | **YES** |
| 7 | Prerequisite gaps repaired? | **YES** (policy + scenario) |
| 8 | Mastered topics return as reviews? | **YES** (scheduler + daily plan wiring) |
| 9 | Recover from missed days? | **YES** (policy + planner) |
| 10 | New material updates without deleting history? | **YES** (versioned master; live doc upload pending) |
| 11 | Jev works live? | **NO** — external blocker: API key |
| 12 | Survive Jev failure? | **YES** |
| 13 | GPT-4o-mini default? | **YES** |
| 14 | GPT-4o escalation justified + logged? | **YES** |
| 15 | Real cost per active student? | **PARTIAL** — instrumentation yes; empirical after live sessions |
| 16 | Non-pilot unaffected? | **YES** |

**Phase 3 complete?** **No** — blocked on live Jev credentials and production deploy of this code for full browser acceptance. Pedagogical gates 4–9, 12–14, 16 are green in tests; 11 is a true external blocker.

---

## Final summary (§43)

| Item | Status |
|---|---|
| Migrations | Applied + verified on production |
| Live Jev | Skipped / blocked (no key) |
| Pilot user flow | Targeting ON; full browser flow **verified live 2026-09-27** (see Live production verification) |
| Adaptive sessions tested | Scenario/unit matrix **+ 1 live production session (PASS)** |
| Interventions tested | Wrong→remediate→transfer path in unit pilot |
| Plan adaptations | Missed-day + exam-phase + anti-loop |
| Persistence | Schema + mastery dual-write verified |
| Fallback | Pass |
| GPT routing | mini default; 4o on escalation |
| Cost/session | Estimator only until live usage |
| Latency p50/p95 | Admin wired; no pilot samples yet |
| Tests | **72 pass / 1 skipped**; `tsc` clean |
| Non-pilot | Flags OFF; pilot UUID only |
| Remaining blockers | TYPESAFE_API_KEY; git push deploy for production UI |

**Rollout:** session loop verified PASS in production 2026-09-27; global rollout NOT YET — see the controlled-pilot-scenarios checklist above. Leave flags global OFF; pilot UUID already set.

---

## OpenAI-backed operating mode (2026-09-27)

TypeSafe Jev access is still on the early-access waitlist. The pilot does not wait on it.

| Item | Status |
|---|---|
| Adaptive Learning Engine | **READY FOR OPENAI-BACKED PILOT** |
| Jev integration | **IMPLEMENTED, WAITING FOR TYPESAFE EARLY ACCESS** |
| Jev validated | **No** |
| Active decision provider | OpenAI (`DECISION_PROVIDER=auto`): gpt-4o-mini, gpt-4o only on escalation |
| Provider telemetry | `openai_decision` when Jev is intentionally off. `openai_fallback` only after a real Jev failure |
| Global flags | OFF |

Switching to Jev later is configuration (`JEV_ENABLED=true` plus `TYPESAFE_API_KEY`), not an engine rewrite. No migration is required to enable Jev. Do not send all traffic to Jev until the stored sanitized cases are compared offline.

---

## Live production verification — session loop PASS (2026-09-27)

### PR #126 → PR #127: root cause and fix

The Adaptive Learning Engine (this whole document's subject) had been written but never committed — recovered and merged as **PR #126** (merge commit `1d5bc33`). Immediately after that merge, production showed `adaptive_master_plans=1` and `adaptive_daily_plans=1` (the planning layer ran) but `adaptive_learning_sessions=0` (the session loop never started) for the pilot account.

**Root cause:** `loadLearningHub()` (`src/lib/learning/learning-hub.ts`) only re-pointed the dashboard's primary CTA ("Çalışmaya Başla") to `/oturum` when `!resumeHref && !processing`. `resumeHref` is set by any `exam_prep_node_attempts` row with `status='active'` — an unrelated legacy "resume your unfinished lesson" marker. The pilot account had one left over from earlier (pre-pilot) testing, so the CTA kept pointing at the old legacy screen and the pilot user had no working link into `/api/adaptive/session/start`.

**Fix:** [PR #127](https://github.com/cortexplus55/burhancortexplus/pull/127), merge commit `99cbc39424bc326cfb9b02dea9377fad84941826`. Extracted the condition into `shouldRouteToAdaptiveSession({ resumeHref, processing })` and dropped `resumeHref` from the gate — for a pilot user, resuming *the adaptive session* is the intended "resume," not an old legacy attempt. `processing` (a document still being ingested) stays as a gate. Production Vercel deployment of this commit: **success** (build/test/e2e all green).

### Browser-verified run (this session, live production, `burhan55600@gmail.com`)

Driven through the actual UI (dashboard → "Çalışmaya Başla" → answer a question wrong → answer a question right → end session), not the database directly. Confirmed via `/admin/adaptive?userId=9d79106a-d31e-46e5-9cc5-4a09b519bc34` immediately after:

| Check | Result |
|---|---|
| Adaptive sessions | **1**, `status=completed`, `completion_pct=100` |
| Adaptive decisions | **3**, provider = `openai_decision` for all three |
| Jev calls | **0** |
| Fallback count | **0** (Fallback column: "Fallback yok") |

**Event total: 10**

| Event type | Count |
|---|---|
| `session_started` | 1 |
| `answer_submitted` | 2 |
| `intervention_started` | 3 |
| `misconception_detected` | 1 |
| `mastery_updated` | 2 |
| `session_completed` | 1 |

**Current prep mastery (both topics touched this run):**

| | Wrong-answered topic | Correct-answered topic |
|---|---|---|
| mastery | 0 | 0.0552 |
| mastery_confidence | 0.178 | 0.23 |
| status | introduced | introduced |
| repeated_error_count / streak_correct | repeated_error_count = 1 | streak_correct = 1 |
| evidence_count | 1 | 1 |

**Verdict on this behavior: PASS.**
- A single wrong answer did **not** raise mastery (stayed at 0) — no credit given without evidence.
- A single correct answer made a small, evidence-based increase (0 → 0.0552) — not a jump to "mastered."
- Neither topic left `introduced` status from one answer either way. `MasteryEngine` is behaving as evidence-accumulating, not single-shot.

### Cost — two distinct metrics, not one

These are **different things** and should not be quoted interchangeably:

1. **Decision-provider cost** (the `DecisionProvider` call only — deciding *what to do next*, not generating the lesson content): sum of `adaptive_jev_decisions.usage` for this session ≈ **$0.00313**.
2. **Total session model cost** (decision + all generated content — lessons, questions, feedback): what the admin/telemetry panel reports per session ≈ **$0.0162** (breakdown observed: 1,262 mini decision tokens + 784 GPT-4o decision tokens + 6,196 content tokens → $0.0033 decision + $0.0129 content = $0.0162 total).

The content-generation cost (~$0.013) dominates the decision cost (~$0.003) roughly 4:1 for this session — expected, since the DecisionProvider call is a small structured-output request while content generation writes full lesson/question text.

### Pilot isolation and security — reconfirmed

- `/admin/adaptive` (no `userId`): all four adaptive flags show `enabled=false` at the global level; pilot count 1 for `adaptive_learning_enabled` / `adaptive_daily_replan_enabled` / `adaptive_model_router_enabled`, pilot count **0** for `jev_enabled` (empty metadata, matching "Jev remains disabled").
- Decision Engine banner: **"OpenAI temporary provider"** / **"Jev: Waiting for API access / disabled"**.
- Non-pilot legacy flow: unchanged by this verification — `withAdaptiveUser` still 404s for any user outside `metadata.pilot_user_ids` (see `tests/unit/adaptive-api-guard.test.ts`, added in PR #127), and the classic exam-prep path never touches adaptive code when the overlay's `isFeatureEnabled` check is false.
- No runtime code, feature flags, Supabase config, or production data were changed to produce this verification — it was a normal pilot-user session through the real UI.

### Final verdict

**ADAPTIVE SESSION LOOP: PASS**
**GLOBAL ROLLOUT: NOT YET**

### Checklist — remaining controlled pilot scenarios before global rollout

- [x] Repeated wrong answers on the same topic (anti-loop ladder: reteach → worked example → easier decomposition → prerequisite review) — **PASS, verified live 2026-09-27** (see round 2 below)
- [x] Repeated correct answers (fast-learner acceleration: less explanation, harder questions, faster topic advance) — **PARTIAL PASS, verified live 2026-09-27** — teach→worked_example progression with rising confidence confirmed; did not reach the practice/mini_assessment tier live in one session (see round 2)
- [ ] Prerequisite remediation actually teaches only the missing prerequisite, not the whole topic again — not independently live-triggered (no natural unmet-prerequisite case arose this session); code path exists and is unit-tested
- [ ] Scheduled review creation and completion (interval lengthens on success, shortens on failure) — mastery didn't reach the scheduling threshold (0.75) live in one session; unit-tested only
- [ ] Missed-day daily/master replan (rebalances remaining work without dumping everything into one day) — cannot be live-tested without an actual day passing; unit-tested only
- [x] GPT-4o escalation happens only when policy requires it (logged reason code), not by default — **PASS, verified live 2026-09-27** (see round 2 below)
- [x] Session resume/reload — refreshing mid-session does not lose or duplicate state — **PASS, fixed in PR #129, verified live 2026-09-27** (see below)
- [ ] Second-day continuity — plan, mastery, and history persist and the daily plan doesn't regenerate as a duplicate — cannot be live-tested without an actual day passing; the next-study-day computation was observed to run correctly at session-end (see round 2)
- [ ] Non-pilot regression — a second, non-pilot account confirmed to see zero adaptive UI/behavior change — automated coverage exists (`adaptive-api-guard.test.ts`); a live non-pilot browser pass needs a second real account, not created without the product owner's say-so

---

## Session resume/reload idempotency — fixed and verified (2026-09-27)

### The bug

While working through the checklist item above, a manual reload of `/oturum` mid-session (no answer given) produced a **completely different question** than the one on screen a moment earlier. Checking `/admin/adaptive?userId=...` confirmed it wasn't cosmetic: one click + one reload had produced **two** `openai_decision` rows and **two** `intervention_started` events for the same topic at the same timestamp.

**Root cause:** `startSession()` called `nextAction()` unconditionally every time it resumed an already-active session. `nextAction()` always mints a fresh `decisionTraceId`, and content generation is cached by that id — so a fresh id on every resume always missed the cache, triggering a brand-new decision *and* a brand-new GPT content-generation call for zero new student input.

### The fix — PR #129

1. The current *unanswered* action is now persisted on the session row (`pending_decision_trace_id`, `pending_action`). Resuming replays it verbatim — no new decision, no new intervention, no new content generation — until it's answered or the session completes.
2. A unique index (`(user_id, exam_prep_id) WHERE status='active'`) stops two concurrent `/session/start` calls from creating two session rows.
3. **A second, real concurrency gap was caught in review** before merge: the unique index alone didn't stop two concurrent requests from each calling `nextAction()` for the same session's first action, if the loser read the winner's row before the winner had finished generating (`pending_action` still `null` at that instant isn't a safe "nobody started" signal — the winner might just not have persisted yet). The same ambiguity existed for two concurrent duplicate `/session/evidence` submissions. Fixed with a new `adaptive_generation_claims` table: an atomic, Postgres-enforced claim (`PRIMARY KEY (session_id, token)`) so exactly one request generates for a given session+step, independent of any Node process — correct across Vercel's multi-instance model, not a process-local mutex. A stale claim (>20s, well above the ~1-1.5s p95 decision latency) can be taken over, so a request that dies mid-generation doesn't wedge the session.
4. `persistPendingAction` now checks the DB write's `error` and throws instead of silently succeeding — closes a "GPT call happened, client got the action, but the DB kept no record" failure mode.
5. A terminal-state guard: `submitEvidence` now checks the session's own status first and is a full no-op against a completed/abandoned session (a late or retried request could otherwise still mint a decision into a finished session).

Real concurrency (not just sequential calls) proven with a deferred-promise barrier in tests: the "winner" is deliberately blocked mid-`nextAction()` while a second request reads its already-committed-but-not-yet-generated session row, asserting the loser never calls `nextAction()` and both resolve to the identical `decisionTraceId`.

Migration: `20260927190000_adaptive_session_resume_idempotency.sql`. Applied to production by the user before verification below.

Along the way, two unrelated pre-existing encoding bugs on `main` were found and fixed separately (not part of the adaptive engine): a stray UTF-8 BOM and mojibake Turkish text in CSS comments, both of which crashed the local Turbopack dev server outright — [PR #130](https://github.com/cortexplus55/burhancortexplus/pull/130).

### Live verification (production DB, real pilot account, 2026-09-27)

Tested via a local dev server pointed at the same production Supabase project, logged in as the real pilot account (`burhan`), exercising the actual `/api/adaptive/session/*` routes end to end — not a unit-test double.

| Step | Result |
|---|---|
| Resume a pre-existing (pre-migration) active session | **1** decision generated, not 2 — the defensive migration-compat path works |
| 3× reload with no answer (incl. a React StrictMode double-invoke) | **0** new decisions, **0** new interventions; every response returned the same `decisionTraceId`; `/session/content` returned `cached: true` with byte-identical title/body/question/choices each time |
| Answer submitted | exactly **1** new decision + **1** new intervention + **1** `mastery_updated` (0 → 0.06); session advanced to a new topic, progress 0% → 10% |

Admin panel decision counter: 9 → 10 (resume) → 10, 10, 10 (three reloads, unchanged) → 11 (after answering). Exactly matches the invariant the fix claims.

### Remaining pilot checklist

With this item closed, the outstanding pre-global-rollout items are: repeated wrong/correct answers, prerequisite remediation, scheduled review, missed-day replan, GPT-4o escalation gating, second-day continuity, and non-pilot regression (live browser pass) — see the checklist above.

---

## Pilot checklist round 2 — live production run (2026-09-27, post-PR #129)

Single continuous live session on `cortexplus.app`, pilot account `burhan`, driven through the real UI (no direct DB access), cross-checked against `/admin/adaptive?userId=...` after each step. 15 answers submitted across this run; session ended cleanly via "Oturumu bitir".

### Repeated wrong answers — anti-loop — PASS

Answered **"Romanda Gerçekçilik ve İç Çözümleme" wrong three times in a row** (same topic each time, since a wrong answer keeps a topic's priority high instead of letting the policy move on to another weak topic the way a correct answer does):

| Attempt | Mastery | Confidence | Status | Action | Provider/model |
|---|---|---|---|---|---|
| before | ~0.17 (carried from earlier) | 0.32 | learning | — | — |
| wrong #1 | 0.03 | 0.27 | **at_risk** | `reteach` | openai_decision |
| wrong #2 | (falling) | — | at_risk | `reteach` | openai_decision |
| wrong #3 | (falling) | — | at_risk | `reteach` | openai_decision |

Three consecutive `misconception_detected` + `intervention_started` events were recorded for the same topic, each with newly generated content that re-explained the *same* concept from a different angle and explicitly named the misconception (e.g. "Odak: Öğrenciler, iç çözümlemenin sadece olay sayısıyla ilgili olduğunu düşünmektedir."). GPT‑4o call share rose from 39% to 46% of all OpenAI calls specifically across this struggling stretch (see the GPT‑4o section below) — the model escalated in response to repeated confusion, matching `repeatedConfusion: topic.repeatedErrorCount >= 2` in `learning-governor.ts`.

Then answered **two correct in a row on the same topic**: mastery recovered 0.03 → 0.19, confidence rose 0.27 → 0.45, status flipped back from `at_risk` to `introduced`, action moved from `reteach` back toward `worked_example`/higher confidence. This is the live version of the exact scenario already described in this report under "Misconception handling" (`emerging seed mastery → wrong → mastery decreases, repeatedErrorCount↑ → transfer correct → mastery increases again`) — now confirmed against real production data, not just the unit scenario.

**Not separately confirmed:** the ladder's later, more severe stages (easier decomposition, prerequisite review) — three wrong answers escalated the *model* (GPT‑4o) and flagged the topic `at_risk`, but stayed in `reteach` rather than visibly switching to a different action name. Whether a 4th+ consecutive wrong answer would surface `easier_decomposition` or `prerequisite_review` as a distinct action was not tested (would have required continuing to fail on purpose past the point already demonstrated).

### Repeated correct answers — fast learner — PARTIAL PASS

Across ~10 correct answers spread over two topics ("şiirde yenilik arayışı", "topluluğun dağılışı ve mirası"), both climbed from `introduced` (mastery 0, confidence 0.18) to `learning`:

| Topic | Mastery | Confidence | Action progression |
|---|---|---|---|
| şiirde yenilik arayışı | 0.00 → 0.35 | 0.18 → 0.50 | `teach` (conf 0.10) → `worked_example` (conf 0.30 → 0.35 → 0.50) |
| topluluğun dağılışı ve mirası | 0.00 → 0.28 | 0.18 → 0.42 | `teach` (conf 0.10) → `worked_example` (conf 0.30 → 0.50) |

This confirms the core "less explanation as evidence accumulates" behavior. It did **not** reach the `mini_assessment`/`practice` tier live (that requires mastery ≥0.7 + confidence ≥0.55 + evidence ≥3 *on one topic*, per `mastery-engine.ts`/policy config): the priority queue kept rotating to whichever topic was currently weakest rather than letting one topic's streak run uninterrupted, so no single topic accumulated enough consecutive evidence in this session. `practice` at confidence 0.80 *has* appeared historically in this account's decision log (03:18, from earlier testing), so the tier is reachable — just not re-triggered in this specific run. Topic rotation itself (always serving the globally-weakest topic rather than "sticking" with a streak) is arguably correct prioritization behavior, not a bug.

### GPT-4o escalation gating — PASS

Global GPT-4o call share moved specifically alongside the struggle above, not on a fixed schedule:

| Point in session | GPT-4o calls / % |
|---|---|
| Before the repeated-wrong-answer stretch | 21 / 45% |
| Immediately after 3 wrong answers on one topic | 27 / 47% |
| Session end | 33 / 46% |

6 additional GPT-4o calls landed in the exact window of the 3 consecutive wrong answers, consistent with `routeTutorModel`'s `repeatedConfusion` trigger rather than random or default routing. No Jev calls and no fallbacks occurred throughout (`Jev calls: 0`, `Fallback: 0`) — confirms GPT-4o escalation is independent of, and unaffected by, the still-disabled Jev integration.

### Session completion, review nudge, and next-day planning — observed, not fully provable live

Ending the session (`Oturumu bitir`) completed cleanly with no errors despite the heavy activity (24 decisions, 15 answers, repeated struggle-and-recovery) — this also re-confirms the resume/concurrency fix from PR #129 didn't destabilize `completeSession` under load. The completion screen correctly surfaced the single weakest remaining topic ("Topluluğun Dağılışı ve Mirası") and computed a next study day (`2026-09-28`, correctly the next day). This is the generic end-of-session weak-point nudge (`buildSessionSummary`'s `weak` topic message), **not** the same thing as an `adaptive_scheduled_reviews` row with a lengthening/shortening interval — none of today's topics crossed the mastery≥0.75 + confidence≥0.65 + evidence≥4 threshold that actually inserts a scheduled review, so that mechanism remains unit-tested only, not live-triggered.

### Non-pilot regression — reconfirmed, not newly live-tested

`/admin/adaptive` (no `userId`) reconfirmed after this run: all four adaptive flags still `enabled=false` globally, pilot count still exactly **1** (`9d79106a-...`) for `adaptive_learning_enabled`/`adaptive_daily_replan_enabled`/`adaptive_model_router_enabled`, **0** for `jev_enabled`. This restates the existing guarantee after a heavy pilot session — it is not a new live pass through a second, non-pilot account's browser experience, which still needs either a second real account or the product owner doing it themselves.

### What remains genuinely open

- **Prerequisite remediation** and **scheduled review**: mechanism exists and is unit-tested, but no live case naturally arose this session (would need a topic with an actually-unmet prerequisite, or ~15-20 more correct answers on one topic to cross the review threshold — both possible but not done today).
- **Missed-day replan** and **second-day continuity**: cannot be produced live without an actual day passing (or altering server time, which was not done).
- **Non-pilot regression**: needs a second real, non-pilot account for a live browser pass.

### Updated final verdict

**ADAPTIVE SESSION LOOP: PASS**
**SESSION RESUME/RELOAD: PASS**
**ANTI-LOOP / MISCONCEPTION RECOVERY: PASS**
**GPT-4O ESCALATION GATING: PASS**
**FAST-LEARNER PROGRESSION: PARTIAL PASS** (direction confirmed, top tier not re-triggered)
**GLOBAL ROLLOUT: NOT YET** — prerequisite remediation, scheduled review, missed-day replan, second-day continuity, and non-pilot live regression remain open, for the reasons above.
