---
name: site-parity-audit
description: Compare a live target site against an existing local clone and produce an auditable feature/UI delta report. Use when the user asks "what's still different", "parity check", "farklarımız ne", "gap analysis", or wants to audit a clone against its source across authenticated user tiers (guest / free / premium). Takes a target base URL plus optional account tiers as arguments.
argument-hint: "<target-url> [--tiers guest,free,premium]"
user-invocable: true
---

# Site Parity Audit

You are auditing **$ARGUMENTS** against the local clone in this repository and producing a **delta report**: every feature, surface, flow, and visual detail the target has that the clone does not (and vice versa).

This is the sibling of `clone-website`. That skill *builds*; this one *measures what is missing*. It reuses the same extraction rigor, artifact discipline, and spec-file-as-source-of-truth principle, but its output is a prioritized gap list rather than components.

## Non-Negotiables

1. **Evidence or it didn't happen.** Every row in the final delta table must cite a real artifact: a JSON extraction, a screenshot, an interaction log line, or a source file path in this repo. A row whose evidence column says "inferred", "expected", or "typical for this product category" is not an audit finding — it is a guess, and it must be labeled `UNVERIFIED` in a separate section, never mixed into the verified table.
2. **Never claim a tier was tested if it was not.** If login failed, or a flow was blocked, say so in the report with the exact failure, and mark those rows `BLOCKED`. A previous audit in this repo failed precisely by filling a matrix with inferences that read like observations. Do not repeat it.
3. **Read-only on the target.** You are a guest in someone else's account. See Safety Boundaries below.
4. **Compare against code, not memory.** Before marking anything `gap`, grep this repository for the feature. A gap that already exists in `src/` is a false positive and destroys trust in the whole report.

## Safety Boundaries (hard limits on the target site)

The user may supply credentials for accounts they own. Using them to *look* is fine. The following are never done, even if the user pre-authorizes them, because they are irreversible or affect real money/data:

- **Never** submit a payment, start/cancel/change a subscription, or enter card details.
- **Never** delete an account, a conversation, a document, or any user data.
- **Never** change email, password, or other credential/security settings.
- **Never** send a message to another human (support ticket, invite, share link, teacher/parent request to a real person).
- **Never** accept new terms or grant OAuth permissions on the user's behalf.

For each of these, **observe the UI and screenshot it, then stop at the confirm step** and record what the button would have done. Mark the row `observe-only`. If a flow cannot be understood without crossing one of these lines, mark it `BLOCKED — requires user` and describe exactly what the user should click so they can report back.

Credentials handling: use them only to sign in on the target's own login form. Never type them into any other site, never write them into an artifact, a spec file, a log, or a report, and never echo them back in chat.

## Phase 0: Ground Truth of the Local Clone

Before touching the target, inventory what you already have. Auditing the target first biases you toward "everything is a gap."

1. Enumerate routes: every `src/app/**/page.tsx` and `route.ts`, with its URL path.
2. Enumerate features: API routes, server actions, DB tables/migrations, feature flags, entitlement/credit rules, i18n message keys.
3. Enumerate components by surface (marketing / app shell / auth / paywall / admin / etc.).
4. Read any prior audit artifacts in `docs/` and note which of their claims were verified vs. inferred. **Prior inferences are hypotheses to test, not findings to carry forward.**

Write `docs/<audit-name>/LOCAL_INVENTORY.md`. Every later "we don't have X" claim must be checkable against this file.

## Phase 1: Target Surface Map (per tier)

Run the sweep once per tier in `--tiers` (default `guest,free,premium`). Isolate artifacts per tier so a premium-only surface is never confused with a free one.

Artifact root: `docs/<audit-name>/evidence/<tier>/<page-key>/`

For each tier:

1. **Sign in** (skip for guest). Confirm the tier is what you think it is — screenshot the plan badge / account page / entitlement indicator. An audit that silently ran two free sessions is worthless.
2. **Sitemap sweep.** Walk every nav item, footer link, sidebar entry, and in-app menu. Record the full URL list. Check for tier-conditional nav items — an entry that exists for premium and not free is itself a finding.
3. **Screenshots** at 1440px and 390px for every distinct surface.
4. **Interaction sweep** per the `clone-website` skill's method — scroll, click, hover, resize — but here you are cataloguing *what exists and what it does*, not extracting exact pixels. Log every interaction to `interaction.jsonl` with `{url, selector, action, observed_result, timestamp}`.
5. **Gate probe.** For every feature, determine the tier boundary: is it absent, visible-but-locked, or usable-with-a-quota? Record the exact lock UI (copy text, badge, modal) and the exact quota number if shown. Stop before any purchase confirm.

## Phase 2: Tier Diffing

Diff the tiers against each other before diffing against the clone:

- `free` vs `premium` on the target → the real entitlement model. This is the highest-value output of the whole audit, because it cannot be inferred from marketing copy.
- Record it as a table: feature → free behavior → premium behavior → gate mechanism → exact lock copy.

Write `docs/<audit-name>/TIER_MATRIX.md`.

## Phase 3: Delta Against the Clone

For every target surface/feature, produce one row. Grep the repo before assigning status.

| Field | Meaning |
|---|---|
| `id` | stable identifier |
| `tier` | guest / free / premium |
| `target_url` | where it lives on the target |
| `feature` | what it is |
| `target_behavior` | verbatim observed behavior |
| `clone_route` | our equivalent route, or `—` |
| `clone_evidence` | repo path proving presence/absence |
| `status` | `matched` / `partial` / `missing` / `extra` / `observe-only` / `BLOCKED` |
| `severity` | `P0` blocks core loop · `P1` visible feature gap · `P2` polish/copy · `P3` nice-to-have |
| `evidence` | artifact path |

`extra` rows matter: features the clone has that the target does not are part of parity too, and the user should know where they diverged deliberately.

Write `docs/<audit-name>/DELTA.csv` plus `docs/<audit-name>/DELTA.md` (the readable version, grouped by severity).

## Phase 4: Report

`docs/<audit-name>/REPORT.md`, in the user's language, containing:

1. **What was actually tested** — tiers signed into, pages visited, count of logged interactions. Lead with coverage so the reader can weight everything that follows.
2. **What was not tested and why** — blocked flows, safety-boundary stops, login failures. Be specific.
3. **Tier matrix** — the free/premium entitlement model.
4. **Gaps by severity** — P0 first, each with the concrete change needed in this repo (file paths).
5. **Extras** — where the clone diverges ahead of the target.
6. **Unverified hypotheses** — clearly fenced off, never mixed with findings.

## Pre-Report Checklist

- [ ] Every `matched`/`missing` row was checked against the repo, not from memory
- [ ] Every row cites a real artifact path that exists on disk
- [ ] No credential appears in any artifact or in the report
- [ ] Tier of each session was positively confirmed via screenshot, not assumed
- [ ] Blocked and observe-only rows are explicitly listed, not silently dropped
- [ ] Inferences are in the Unverified section only
- [ ] Coverage numbers in the report match the actual interaction log line counts
