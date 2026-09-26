# Adaptive Learning Engine — Phase 3 Pilot Report

**Date:** 2026-09-26  
**Policy:** `adaptive-v1`  
**Pilot user:** `burhan55600@gmail.com` (`9d79106a-d31e-46e5-9cc5-4a09b519bc34`)  
**Global rollout:** OFF (all adaptive flags `enabled=false`; pilot via `metadata.pilot_user_ids` only)

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
2. **Phase 3 app code not yet on production** → browser product-flow acceptance incomplete until push/deploy  
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
| Pilot user flow | Targeting ON; full browser flow pending deploy |
| Adaptive sessions tested | Scenario/unit matrix (not live browser count) |
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

**Rollout:** leave flags global OFF. Pilot UUID already set.

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
