# Cortex Plus — Launch Readiness Checklist

Date: 2026-09-23  
Target: `cortexplus.app` · Supabase `dgjfyewgrukglsehyntc` · Repo `cortexplus55/burhancortexplus`

Use `[x]` only when verified in the current release candidate (code + live as noted).

## Authentication

- [x] Logged-out users redirected from protected routes to `/giris?next=`
- [x] Free student login reaches `/ogretmen`
- [x] Onboarding incomplete forced to onboarding path (middleware)
- [x] Deleted account blocked at API guard (`profiles.deleted_at`)
- [x] Auth `next` open-redirect hardened (`safeNextPath`)
- [ ] Password reset end-to-end with real mailbox (code path present; live mail not re-run this gate)
- [ ] Multi-tab / expired session matrix fully exercised on live

## Documents

- [x] Upload UI + ownership copy on `/dokumanlar`
- [x] Soft-delete + durable deletion queue migration applied live
- [x] Restricted RLS so authenticated cannot read soft-deleted docs
- [x] Controlled citation fixture unit tests (page 7 / 14 markers)
- [x] Chat attach reads `document_pages.text_content` (not `raw_text`)
- [x] PDF citation deep link viewer on `/dokumanlar/[id]?page=#belge-onizleme`
- [ ] Full PDF suite (scan/password/corrupt) on live with fixtures
- [ ] Cross-user isolation matrix with second live account (code+RLS ready; live dual-user not re-run)

## AI

- [x] Only-document / no-source credit refund contract in unit tests
- [x] Document answer verification + server-side citations
- [x] Atomic chat settlement RPC (`complete_chat_operation`) applied live
- [x] Chat settlement + stable `operationId` in client (RC built locally)
- [ ] Chat settlement path verified on production after deploy
- [ ] Live only-document hallucination probe with controlled PDF on production build

## Quiz

- [x] Generate routes entitlement-aware
- [x] Quiz generate uses `reserveCredits` + stable `operationId` idempotency
- [ ] Live generate → answer → complete smoke this gate
- [x] Mistake notebook consecutive-resolve unit coverage exists

## Exam

- [x] Timer / `expires_at` unit coverage
- [ ] Live mock exam refresh/network matrix this gate

## Credits

- [x] `credit_reserve` / commit / refund service_role only
- [x] Balance cannot go negative (RPC + admin adjust)
- [x] Settlement errors not silent (`credit-settlement` tests)
- [x] Chat no-source → `charge=false` → refund path
- [ ] Parallel double-click stress on live wallet this gate

## Payments

- [x] Create-token requires `legalAccepted: true`
- [x] Parent beneficiary requires active `parent_student_links`
- [x] Student cannot buy for another user (`forbidden`)
- [x] PayTR callback hash + idempotent `finalize_paytr_payment`
- [x] PayTR subscription detection uses `is_premium` / tier only (migration `20260923180000`)
- [x] Auto-renew intentionally off (`AUTO_RENEW_SUPPORTED=false`)
- [ ] Real/sandbox card charge + duplicate webhook proof this gate
- [x] Dangerous `parent_coach_spend/refund` revoked from anon/authenticated (live)

## Mobile

- [x] E2E landing overflow check
- [x] Live pricing + hub usable on mobile viewport (browser)
- [x] Chat composer `visualViewport` keyboard inset (RC)
- [ ] Full 360–932 matrix + keyboard chat input on live device matrix

## Security

- [x] Service role only via `SUPABASE_SECRET_KEY` server client
- [x] Open redirect fix for auth callback/confirm
- [x] Support form posts to real `/api/support` (no fake success)
- [x] Advisors reviewed; credit RPCs not anon-executable
- [ ] HaveIBeenPwned leaked-password protection enable in Supabase Auth (advisor WARN)
- [ ] Production deploy of this RC (`git push main` → Vercel)

## Legal

- [x] `/gizlilik` `/kvkk` `/kullanim-kosullari` `/mesafeli-satis` `/on-bilgilendirme` `/iptal-iade` `/teslimat` `/kunye` → HTTP 200
- [x] Prices on live pricing match catalog (Plus ₺599 / Sigma ₺1.999 monthly observed)
- [x] Seller phone published after PayTR live approval (documented in `seller.ts`)

## Monitoring

- [x] Sentry dependency present
- [x] Credit settlement failures logged without leaking provider bodies
- [ ] Alert routing / on-call verified this gate

## Backup

- [ ] Supabase PITR / backup restore drill dated evidence this gate

## Rollback

- [ ] Documented rollback owner + last known-good deployment SHA for this launch
- [ ] Feature flags for risky AI paths confirmed

## Build gate (local RC)

- [x] `npm run typecheck` pass
- [x] `npm test` — 1105 passed
- [x] `npm run build` pass
- [x] `npm run test:e2e` — 42 passed

## Ship decision

See `docs/FINAL_UAT_REPORT.md` → Production readiness.
