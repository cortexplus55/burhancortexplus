# Cortex Plus — Final UAT Report

**Date:** 2026-09-23  
**Scope:** Release gate (static + unit + e2e + live smoke + DB migrations)  
**Branch / tree:** `main` + uncommitted UAT hardening WIP  
**Live:** `https://cortexplus.app` · health OK · Supabase `dgjfyewgrukglsehyntc`

---

## Summary counts

| Metric | Value |
|---|---|
| Issues found (this gate) | 14 |
| Auto-fixed | 11 |
| Remaining P0 | 1 |
| Remaining P1 | 3 |
| Remaining P2 | 2 |
| Remaining P3 | 1 |
| Unit tests | 1091 passed / 0 failed (109 files) |
| E2E | 42 passed / 0 failed |
| Build | `npm run build` **pass** |
| Typecheck | **pass** |

---

## Test matrix

| Test | Expected | Actual | Status | Notes |
|---|---|---|---|---|
| Static TODO/FIXME in src | No production blockers | No actionable TODO/FIXME/HACK | Pass | Input placeholders ignored |
| Service role in client bundle | Not present | `createServiceClient` server-only; `SUPABASE_SECRET_KEY` | Pass | |
| Live `/api/health` | Correct project ref | `dgjfyewgrukglsehyntc` | Pass | |
| Public legal routes HTTP | 200 | All listed legal routes 200 | Pass | mesafeli-satis, iptal-iade, teslimat, kunye, … |
| Logged-out `/ogretmen` | Redirect `/giris?next=/ogretmen` | Confirmed browser | Pass | |
| Free user login | `/ogretmen`, Satın al visible | Confirmed | Pass | |
| Free plan settings | Ücretsiz + delete request | Confirmed | Pass | |
| Auth `next` open redirect | Reject `//evil` | Fixed via `safeNextPath` | Fixed (local) | **Not on production until deploy** |
| Parent buy for unrelated student | 403 | Link check in create-token | Pass | Unit + code |
| Student buy for other | forbidden | beneficiary tests | Pass | |
| PayTR callback idempotency | OK / finalize RPC | Code review + existing tests | Pass | Live card not charged this gate |
| Credit balance ≥ 0 | RPC enforces | Migration + unit | Pass | |
| Settlement RPC failure | Throws, no silent | `credit-settlement` | Pass | |
| `parent_coach_spend` anon | Not executable | Revoked live | Fixed | Advisor had WARN |
| Only-document no-source refund | charge=false → refund | Route + unit updated | Pass | |
| Controlled doc citations | page 7/14 + foreign deny | `controlled-document-fixture` | Pass | |
| Document deletion queue | Live table + soft_delete fn | Migration applied | Pass | |
| Chat operations table | Live + complete_chat_operation | Migration applied | Pass | App WIP must deploy to use |
| Support form | Real API, no fake success | `/api/support` | Pass | |
| Oral mic denied | Toast, no crash | oral-studio onerror | Fixed | |
| E2E homepage h1 | Match live copy | Was stale “Nerede…” → “Bilgiye hükmet.” | Fixed | |
| E2E pricing mobile | Page usable without live plans | Assert h1 + overflow | Fixed | E2E uses placeholder Supabase key |
| Stuck docs “İşleniyor” | Eventually resolve/fail | Observed old stuck rows on live | Fail (P2) | Reprocess UI exists |
| Live dual-user isolation | Marker not leak | Not re-run live | Open (P1) | RLS + ownership code present |
| Real PayTR charge | Success + webhook | Not executed | Open (P1) | Buttons live; no card this gate |
| Deploy UAT RC | Production = RC | RC built locally; push pending | Open (P0) | Blocks READY until Vercel prod |
| Chat `text_content` attach | Parsed pages in chat | Fixed | Pass | |
| Quiz credit idempotency | reserve+claim | Fixed | Pass | |
| PayTR tier-only subscription | No name LIKE trap | Migration added | Pass (apply live) | |

---

## Remaining issues

### P0 BLOCKER

1. **UAT RC not on production** — local RC passes typecheck/tests/build/e2e; ship via `git push origin main` + post-deploy smoke (login, only-document chat, belge PDF citation jump).

### P1 HIGH

1. **Live payment proof missing** — create-token/callback code OK; no real/sandbox charge + duplicate webhook observed this gate.  
2. **Cross-user isolation live matrix not re-run** — marker document test with User B.  
3. **Supabase Auth leaked-password protection disabled** (advisor WARN).

### P2 MEDIUM

1. **Stuck document processing rows** on test account (legacy “İşleniyor” / `page_insert_failed`).  
2. Marketing mobile menu aria text encoding glitch (`MenÃ¼yÃ¼ aÃ§`) observed once in a11y tree — verify charset on marketing shell.

### P3 LOW

1. Legacy SECURITY DEFINER functions (puzzle/lab/referral) still executable by roles — retired UI but revoke hygiene recommended.

---

## Fixes applied this gate

- `safeNextPath` + auth callback/confirm open-redirect hardening + unit tests  
- `chatSourceBlock` `maxCharsPerChunk` typecheck fix + “soruda geçen terim” prompt restore  
- no-source guarantee tests aligned to `complete_chat_operation` / `p_charge`  
- Controlled document citation fixture tests  
- Oral studio mic permission / no-speech toasts  
- Live migrations: `uat_document_deletion_queue`, `uat_chat_operation_results`  
- Live revoke: `parent_coach_spend` / `parent_coach_refund` from anon+authenticated  
- E2E public homepage heading + mobile pricing assertions  
- `LAUNCH_READINESS.md` + this report  
- Chat `operationId` client idempotency; quiz generate `reserveCredits` parity  
- `formatTry` on subscription checkout cards; encrypted PDF user message  
- Document PDF preview + `#belge-onizleme`; onboarding exam date + belge adımı  
- PayTR `finalize_paytr_payment` tier-only subscription migration  
- `logOpsEvent` structured server logging helper  

---

## Build / automated results

| Command | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm test` | 1091 passed |
| `npm run build` | Pass |
| `npm run test:e2e` | **42 passed** |

---

## Production readiness

**NOT READY**

**Blocker:** Release-candidate UAT code (especially auth open-redirect fix and chat settlement client path) is not on production. Deploy + post-deploy smoke (login, one document chat only-document question, one PayTR sandbox/live charge) required before opening paid/free students broadly.

After deploy clears P0, remaining P1 items (payment proof, dual-user isolation live, HIBP) should be closed or explicitly accepted before marketing launch.
