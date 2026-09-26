# Adaptive Learning Engine — mevcut yığın haritası

Bu belge Adaptive Engine’in **ne yeniden yazdığını** değil, **neye bağlandığını** kaydeder.

| Adaptive rol | Mevcut kaynak |
|---|---|
| Exam kimliği | `exam_preps` |
| Exam Graph | `document_topic_nodes`, `document_topic_page_links`, `exam_prep_topics` |
| Source chunks | `document_chunks`, `document_pages` |
| Diagnostic | `exam_prep_intro_attempts`, `exam_prep_diagnostic_summaries` |
| Discrete mastery (geri uyum) | `exam_prep_topic_mastery.measured_level` |
| Continuous mastery | `exam_prep_topic_mastery.mastery` + `mastery_confidence` |
| Evidence | `exam_prep_answer_evidence` + `adaptive_learning_events` |
| Master plan | `exam_preps.schedule_v2` + `adaptive_master_plans` |
| Daily plan | `study_plan_tasks` + `adaptive_daily_plans` |
| Content generation | `src/lib/adaptive/action-content/` + mevcut lesson/quiz kaynakları |
| Model routing | `TutorModelRouter` (`src/lib/adaptive/tutor-model-router.ts`) |
| Credits | Değişmez; orchestration 0 kredi |
| Usage | `ai_usage_events` + `adaptive_jev_decisions` |
| Flags | `adaptive_learning_enabled`, `jev_enabled`, … (+ pilot `metadata.pilot_user_ids`) |

Kod kökü: `src/lib/adaptive/`.

Policy version: `adaptive-v1`.

---

## Phase 2 audit snapshot (2026-09-26)

### Working

- Decision stack: PolicyEngine, MasteryEngine, LearningGovernor, Jev + OpenAI fallback + circuit breaker
- Session APIs (start/next/evidence/complete), `/today`, `/replan`, `/readiness`
- Flag-gated dashboard CTA + `/oturum` page
- Diagnostic → continuous mastery seed
- Migration tables + SELECT RLS; flags default OFF
- Unit tests for mastery/policy/normalize/replan/router

### Was stub / incomplete (Phase 2 targets)

| Area | Was | Phase 2 |
|---|---|---|
| Learning action UI | Blurbs + link to prep | Real action-content renderers |
| Answer grading | Client self-report `correct` | `evaluate-answer` deterministic → LLM |
| Worked example | Placeholder copy | Source-grounded steps + transfer Q |
| Master plan versions | Helpers only; not on create | Snapshot on schedule create/replan |
| Daily plan | Insert-once; hub `reviewItems: []` | `ensureCurrentDailyPlan` + due reviews |
| Missed days | Legacy reschedule only | Adaptive version + student copy |
| Content model escalation | Decision router only | mini → repair → 4o for content |
| Cost telemetry | Empty usage / no admin costs | `recordUsage` + admin summary |
| Pilot | Global flags only | `pilot_user_ids` in flag metadata |
| E2E / live Jev / RLS tests | Missing | Added under `tests/` |

---

## Phase 2 final report (2026-09-26)

1. **Working before audit:** Decision stack (Governor/Policy/Mastery/Jev+fallback), session APIs, flag-gated CTA + `/oturum`, diagnostic seed, migration+RLS SELECT, unit smoke tests.

2. **Incomplete before:** Session UI was blurbs + prep link; self-report grading; no action content generators; master plan versions not snapshotted on create; hub skipped due reviews; no content escalation/telemetry/pilot.

3. **Changed:** Action content layer + `/api/adaptive/session/content`; evaluate-answer; real session UI; `ensureCurrentDailyPlan`; master plan snapshot on create + missed-day versioning; tutor reason codes + mini→repair→4o; usage codes + admin cost summary; pilot `metadata.pilot_user_ids`; session completion summary; tests.

4. **Learning action renderers:** teach, worked_example, easier_example, practice, retrieval_practice, prerequisite_review, reteach, mini_assessment, advance, scheduled_review — all generate structured content (LLM with graceful fallback).

5. **Master Plan:** Versioned via `adaptive_master_plans`; initial snapshot on prep create when flag/pilot ON; missed-day / replan commits N+1; one wrong answer does not replan (policy + tests).

6. **Daily Plan triggers:** Dashboard hub, `/api/adaptive/today`, session complete (`forceRefresh`), missed-day detection inside `ensureCurrentDailyPlan` (no cron).

7. **Jev live:** `tests/unit/adaptive-jev-live.test.ts` runs only when `TYPESAFE_API_KEY` present (skipped in CI without key).

8. **Jev fallback:** Circuit → OpenAI structured → deterministic; audited; usage recorded.

9. **GPT routing:** Default mini; escalate with COMPLEX_* reason codes; content path mini → repair → 4o.

10. **Mastery:** Bounded delta; status needs mastery+confidence; advance gates; boundary tests pass.

11. **Spaced review:** Scheduled on mastery/retrieval success with interval progression; due reviews feed daily plan.

12. **E2E scenarios:** Good / struggling / absent / Jev-down / scope-change unit scenarios pass.

13. **Security:** SELECT-own RLS in migration; ownership guard + policy name contract tests.

14. **Cost telemetry:** `ADAPTIVE_*` usage codes; admin `/admin/adaptive?userId=` cost summary.

15. **Performance:** Single governor decision per step; content idempotent by decisionTraceId; chunk-limited source context.

16. **Build/test:** `tsc --noEmit` clean; adaptive unit tests 55 pass / 1 skipped; `npm run build` green.

17. **Remaining limitations:** Live browser student journey not manually exercised in this pass; Exam Graph importance still defaults to medium when source metadata lacks weight; OpenAI/Jev live costs depend on env keys; migration `feature_flags.metadata` must be applied to production Supabase before pilot targeting works.

---

## Phase 3 status (2026-09-26)

### Applied / verified

- Migrations on production `dgjfyewgrukglsehyntc`: `adaptive_learning_engine` + `feature_flag_pilot_metadata`
- Pilot targeting: `burhan55600@gmail.com` → `9d79106a-d31e-46e5-9cc5-4a09b519bc34` in all four adaptive flags (`enabled=false`, pilot only)
- Code: anti-loop, teaching-mode escalate, exam-phase 20/7/2, readiness deadband, JEV_MODEL validation, replan `userId`, student payload hygiene, trust copy, chat mastery context, analytics metrics defs + server events, admin pilot health, question fingerprint soft-guard
- Tests: adaptive suite **72 pass / 1 skipped** (live Jev skipped — `TYPESAFE_API_KEY` absent in env)

### Pilot metrics (definitions)

See `ADAPTIVE_PILOT_METRICS` in `src/lib/adaptive/analytics.ts`:

| Key | Definition |
|---|---|
| SESSION_COMPLETION_RATE | Completed / started adaptive sessions |
| DAILY_PLAN_COMPLETION_RATE | Done items / scheduled items for plan_date |
| INTERVENTION_SUCCESS_RATE | Independent success within N attempts after remediation / interventions |
| MASTERY_GAIN_PER_SESSION | Sum of mastery deltas in session |
| REPEATED_MISCONCEPTION_RATE | repeatedError / answer_evaluated |
| REVIEW_SUCCESS_RATE | Successful reviews / attempted due reviews |
| JEV_FALLBACK_RATE | Real provider failures only. Intentional `openai_decision` is not a fallback. |
| GPT4O_ESCALATION_RATE | gpt-4o (non-mini) / adaptive OpenAI usage |
| AI_COST_PER_SESSION | Estimated USD / completed sessions |
| NEXT_ACTION_LATENCY | p50/p95 of `adaptive_jev_decisions.latency_ms` |

**Intervention success:** fail concept → intervene → independently correct equivalent concept within `INTERVENTION_SUCCESS_WINDOW` (3) meaningful attempts.

### External blockers

1. **Live Jev:** `TYPESAFE_API_KEY` is not available (TypeSafe early access waitlist). Live contract test stays skipped. This does not block the pilot.
2. **Production browser pilot of this operating mode:** requires deploy before cortexplus.app serves the OpenAI decision provider.

### Operating mode (2026-09-27)

Adaptive Learning Engine: **READY FOR OPENAI-BACKED PILOT**

Jev integration: **IMPLEMENTED, WAITING FOR TYPESAFE EARLY ACCESS**

`DECISION_PROVIDER=auto`. With `JEV_ENABLED=false` or no TypeSafe key, OpenAI (`gpt-4o-mini`, escalate to `gpt-4o`) is the intentional decision provider. Provider name `openai_decision`. `fallback` is reserved for a real provider failure. Jev code, env keys, and `JevDecisionProvider` stay. Global adaptive flags stay OFF. Jev is not marked validated.

Full narrative: [ADAPTIVE-PILOT-REPORT.md](./ADAPTIVE-PILOT-REPORT.md).

