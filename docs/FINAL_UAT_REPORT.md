# Cortex Plus — Final UAT Report

**Date:** 2026-09-23  
**Scope:** Release gate (static + unit + e2e + live smoke + DB migrations)  
**Branch / tree:** `main` + uncommitted UAT hardening WIP  
**Live:** `https://cortexplus.app` · health OK · Supabase `dgjfyewgrukglsehyntc`

---

## Summary counts

| Metric | Value |
|---|---|
| Issues found (this gate) | 17 |
| Auto-fixed | 14 |
| Remaining P0 | 0 |
| Remaining P1 | 3 |
| Remaining P2 | 3 |
| Remaining P3 | 1 |
| Unit tests | 1115 passed / 0 failed (110 files) |
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
| Deploy UAT RC | Production = RC | `c3fde16` → `1f0ffa2` READY on cortexplus.app | **Pass** | Root cause of 4 silent non-deploys: 3rd hourly cron over Hobby quota |
| PDF viewer live | Canvas renders page N | `?page=5#belge-onizleme` → s.5/12 canvas 744×1053 on cortexplus.app | Pass | Needed worker in public/ + no `withCredentials` |
| Mobile composer vs bottom nav | Gönder clickable ≤899px | Was hidden under nav at 558px (composer bottom 678 > nav top 629); now 620 < 629 | Fixed | CSS `parity-shell.css` |
| Live chat completion | 200 + answer | Was **503** (OpenAI `429 no credits`); after top-up: only-document answer with `s.3` and `s.9` citations | **Pass** | While down, reservations → `refunded`, wallet unchanged; after: `committed`, daily free allowance 6→2, paid balance 201 untouched |
| Strict document gate false negative | Supported answer accepted | “dil eleştirisi” (p.9) rejected twice with `quote_not_in_source:9` — typographic quotes / hyphenation mismatch | Fixed | `normalizeForMatch` (NFKC, quotes, dashes, soft hyphen, line-break hyphenation, `tr` lowercase); same question now passes live |
| Citation links clickable | `Kaynaklar` anchor → viewer page N | Rendered as raw `[…](/dokumanlar/…)` text | Fixed | Same-origin-only link rule in `renderMarkdownToHtml`; `https://`, `//`, `javascript:`, `mailto:` never become `<a>` |
| Citation → PDF page (live, e2e chain) | Click `s.9` → viewer at s.9 | `/dokumanlar/9a07…?page=9#belge-onizleme` → “s.9 / 12”, canvas 744×1053, section in view | **Pass** | Screenshot shows “4. Dil ve Üslup Tartışmaları / 4.2 Dekadanlar Tartışması” |
| Chat `text_content` attach | Parsed pages in chat | Fixed | Pass | |
| Quiz credit idempotency | reserve+claim | Fixed | Pass | |
| PayTR tier-only subscription | No name LIKE trap | Migration added | Pass (apply live) | |

---

## Remaining issues

### P0 BLOCKER

None open.

~~OpenAI account has no credits~~ — **closed 2026-09-23 20:03 UTC**: billing topped up by the product owner; `/api/ai/chat` returns 200 on production, only-document question answered with page citations, credits committed against the daily allowance. While it was down, every reservation was refunded and the wallet stayed at 201, so no student was charged for a failed answer. `generation_failed` log now carries `cause:` (name + message) so the next upstream outage is diagnosable from Vercel logs alone.

~~UAT RC not on production~~ — **closed**: `1f0ffa2` is READY on cortexplus.app; the 4 preceding pushes were silently rejected by Vercel because a third, hourly cron exceeded the Hobby plan quota (2 crons, daily). Removed; guard test added.

### P1 HIGH

1. **Live payment proof missing** — create-token/callback code OK; no real/sandbox charge + duplicate webhook observed this gate.  
2. **Cross-user isolation live matrix not re-run** — marker document test with User B.  
3. **Supabase Auth leaked-password protection disabled** (advisor WARN).

### P2 MEDIUM

1. **Stuck document processing rows** on test account (legacy “İşleniyor” / `page_insert_failed`).  
2. Marketing mobile menu aria text encoding glitch (`MenÃ¼yÃ¼ aÃ§`) observed once in a11y tree — verify charset on marketing shell.  
3. **No sweeper for stale `pending` credit reservations.** Test account carries a `QUIZ_GENERATE` reservation from 2026-09-10 (before the atomicity migration) that still holds `reserved=2`. New code paths refund on every failure, so this cannot recur for chat/quiz, but a crash between reserve and complete would leave the same orphan. Suggested: `expire_stale_reservations(interval)` RPC run from the daily `subscription-renewal` cron (not a new cron — Hobby quota), plus a one-off refund of the existing row.

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
- **Deploy blocker root cause:** third hourly cron in `vercel.json` exceeded Vercel Hobby quota (2 crons, daily) → every `main` push since `cb96562` was rejected before a deployment record existed (GitHub status “Deployment failed” → cron pricing doc). Removed; deletion queue folded into daily `subscription-renewal`; guard test enforces quota  
- `requireFeature` gates on speech / podcast audio / oral transcribe; entitlement query filters expired `current_period_end` in SQL; `/api/payments/subscription` reports `expired`  
- Mixed-mode answers render `Belgeden` / `Genel bilgiden — kaynak gösterilmez` headings (`source-sections.ts`); `/dokumanlar` auto-refreshes while a document is processing  
- PDF preview: pdf.js worker copied to `public/` on install/build, `workerSrc` set, `withCredentials` removed (CORS `*`); guard test  
- Mobile composer lifted above bottom nav (≤899px / ≤640px) with safe-area padding  
- `document_answer_rejected` ops event with machine-readable `reasons[]` from `verifyDocumentAnswer`; `generation_failed` carries `cause`  
- `normalizeForMatch` for quote-in-source checks (typographic quotes, dashes, soft hyphen, line-break hyphenation, `tr` case) — fixed live false negative on p.9  
- Same-origin markdown link rule + trailing list split so `Kaynaklar:` citations render as clickable `<ul>` anchors  

---

## Build / automated results

| Command | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm test` | 1115 passed |
| `npm run build` | Pass |
| `npm run test:e2e` | **42 passed** |

---

## Production readiness

**READY FOR UAT — no open P0.**

Production = `f7624f0` (READY on cortexplus.app). Core loop verified live end-to-end on 2026-09-23 20:03 UTC: only-document question on `servet-i-funun-edebiyati.pdf` → answer with `Kaynaklar` link → click `s.9` → PDF viewer renders page 9 → credit committed against daily allowance, paid balance untouched.

Before **marketing launch** the three P1 items must be closed or explicitly accepted: one real/sandbox PayTR charge with duplicate-webhook replay, live dual-user isolation matrix, Supabase leaked-password protection. P2/P3 are hygiene.
