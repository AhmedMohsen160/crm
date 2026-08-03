# Fast Trans CRM/ERP — Engineering Handover & System Architecture

**Document status:** Authoritative handover, current as of commit `4d11782` (Phase 11).
**Audience:** An incoming Senior Software Architect with zero prior exposure to this codebase.
**Reading time:** ~90 minutes. Read §1–§8 before touching anything; §14–§15 before your first commit.

**Related documents in this repository — read them, do not skim them:**

| File | What it is | Authority |
|---|---|---|
| `docs/SPEC.md` | 713-line Arabic business specification, derived from an audit of the company's real operating data | **Binding.** Every formula and rule is deliberate |
| `docs/FINANCE-SPEC.md` | Accounting specification distilled from the company's actual bookkeeping workbook | **Binding** for anything touching the ledger |
| `docs/ARCHITECTURE.md` | Arabic-language architecture note written for the business owner | Explanatory |
| `COMMISSION-SPEC.md` | Commission tier examples signed off by management | **Binding** — literal numbers |
| `GAP-ANALYSIS.md` / `FIELD-MAPPING.md` | Produced before implementation began; maps spec field names to code field names | Historical + mapping reference |
| `PHASE-1.md` … `PHASE-11.md` | One document per delivered phase: what was built, what was decided, what was deferred | Historical record |
| `CLAUDE.md` | Living project memory: invariants, conventions, gotchas | **Read first, update always** |

> **A note on language.** This handover is in English. Everything else — source comments, the specification, UI strings, commit messages — is in Arabic. That is not an oversight; see §10.1. You do not need to read Arabic to work on this system, but you will be materially slower if you cannot, because the *reasoning* behind each rule lives in the Arabic doc-comments, not in this file.

---

## 1. Executive Summary

### 1.1 What this system is

Fast Trans CRM is a **vertical ERP for a certified-translation office**, not a generic CRM. It runs the full commercial and operational lifecycle of a translation business across six branches (Mokattam, Mohandessin, Alexandria, Nasr City, Riyadh, Buraidah), ~15 internal staff, and a roster of 1,067 external freelance linguists.

It covers, in one system:

- **Sales** — lead capture, phone-first deduplication, conversion, quotations, professional multi-month proposals
- **Operations** — project state machine, work-mode assignment, internal/external/mixed sourcing, step-level execution tracking, delivery with QA
- **Costing** — weighted-page effort model, standard internal cost, freelancer rate resolution, margin freezing at delivery
- **Commissions** — configurable tier schemes, derived accruals, clawback by reversal
- **Finance** — full double-entry general ledger, 249-account chart, cost centres, budgets, fixed-asset depreciation, P&L by branch and by month
- **Analytics** — funnel, seller performance, channel CAC/ROAS, producer capacity absorption, client lifetime value, multi-year trend
- **Notifications** — 8 rule-driven events with per-event cadence and digest batching
- **Email** — IMAP/SMTP integration with automatic record linking, AI classification and reply drafting
- **AI assistant** — permission-scoped natural-language access to system figures

### 1.2 Vital statistics

| Dimension | Value |
|---|---|
| Language / runtime | TypeScript 5.7, Node 22, Next.js 15.5.22 (App Router), React 19 |
| Database | PostgreSQL (Neon) in production; SQLite for local development |
| ORM | Prisma 6.19.3 |
| Styling | Tailwind CSS 3.4, RTL-first, no component library |
| Data models | **46** |
| Indexes / unique constraints | **84** / **24** |
| Application pages | **83** |
| HTTP API routes | **8** |
| Permissions | **21** boolean columns on `Role` |
| Mutation entry points | **56** save entities + **18** mutate ops |
| Unit tests | **605** across 10 suites, all pure — no DB, no network |
| End-to-end tests | **168** in real Chromium |
| Lines in `src/lib` | ~10,400 |
| Lines in `src/lib/mutations` | ~4,100 across 15 files |
| Commits | 20 (11 numbered delivery phases) |
| Production data | 3,448 clients · 2,154 leads · 3,105 projects · EGP 3,115,041 migrated from legacy spreadsheets |

### 1.3 The five invariants

If you remember nothing else from this document, remember these. Each is enforced in code, tested, and derived from `docs/SPEC.md` §0 and §3, which is **binding**.

1. **Check the permission, never the role name.** `can(user, 'canViewSellPrice')` — never `user.roleName === 'sales_admin'`. Roles are user-editable data created from a settings screen with no deploy. Any condition keyed on a role name breaks the first time management creates a new role.
2. **Server-side filtering, always.** A field the user may not see is **never sent to the browser**. Not sent-then-hidden by CSS, not sent-then-filtered by JS. §3 item 2 of the spec, and it has a dedicated e2e test that greps the HTTP response payload for `costInternal`, `marginPct`, `staffSalary`.
3. **Nothing is ever deleted.** Deletion is logical; every mutation writes to a permanent `AuditLog`. A wrong ledger entry is corrected by a **reversing entry**, never by an update or delete. Cancelled projects keep their row and lose their `revenueMonth`.
4. **Revenue is recognised by state.** No revenue and no cost enters any financial report unless the project's status is `delivered` or `collected`. This is a single exported constant (`REVENUE_FILTER`) used by every financial query.
5. **Never invent business logic.** Every formula in `docs/SPEC.md` §8 came from auditing real data. If the spec is silent or contradictory on something you need, **stop and ask the business owner**. Do not "reason it out."

### 1.4 The single most surprising design decision

**This application does not use React Server Actions, and it does not use `next/link`.**

Both were removed after measurement, not on principle:

- Server Actions hung roughly **50%** of the time in the field: the record saved server-side within milliseconds, but the browser never navigated and the button stayed on "saving…". Replaced with classic `<form method="post">` → `303 See Other` redirect.
- Client-side routing via `<Link>` failed to navigate roughly **1 in 3** clicks. Replaced by `src/components/link.tsx`, a plain `<a>` tag wrapper.

The consequence is that **the entire system works with JavaScript disabled**, which turned out to be a durable asset rather than a compromise. Do not "modernise" this without reproducing the original failure and proving it is gone. See §9 ADR-002 and ADR-003.

---

## 2. Business Domains

The system is organised around eight domains. This is not a microservice boundary — it is a single deployable — but it *is* the module boundary in `src/lib/mutations/` and the mental model you should carry.

### 2.1 Identity & Authorization
Users, roles, branches, reporting hierarchy. Permissions are 21 boolean columns on `Role`. Visibility scope is derived: `all` / `team` / `self`.

### 2.2 Sales
`Lead` → `Client` → `Project`. Two distinct commercial motions share one set of screens:

- **(a) Certified translation of personal documents** — the volume business. Individuals walking into a branch. Small, repeat orders (birth certificates, ID cards, commercial registry extracts, criminal-record certificates). Median order ≈ EGP 500. This is *counter work*, not project work.
- **(b) Specialised translation & localisation for corporates** — legal, medical, financial, technical. Larger and longer-running.

**The system must serve both from the same screens without letting (b)'s requirements slow down (a)'s throughput.** This tension explains many UI decisions — e.g. the "فوري" (express) button that sets the deadline to end-of-day in one tap rather than opening a date picker.

### 2.3 Operations / Production
The `Project` state machine, work modes, sourcing model, execution steps, assignment to internal producers or external freelancers, delivery with QA issue count.

### 2.4 Costing & Margin
The weighted-page model. Everything in `docs/SPEC.md` §8, implemented literally in `src/lib/costing.ts` and verified number-by-number by 47 unit tests.

### 2.5 Freelancer Network
1,067 linguists with multi-dimensional rate cards (per source word / target word / page / hour / minute / flat), rate resolution by specificity, ranking, payment ledger and ageing.

### 2.6 Commissions
Configurable tier schemes (`progressive` or `whole` mode), accrual on collection, clawback by reversal on cancellation or rework.

### 2.7 Finance
A real double-entry general ledger — not an expense log. 249 seeded accounts in a four-level tree, three mandatory expense buckets (G&A / Selling & Marketing / Production & Operating), 8 dimensions per journal line, cost centres, annual budgets with variance, fixed assets with category depreciation rates, period closing.

### 2.8 Communications & Intelligence
Mailboxes (shared or per-admin), inbound message storage and record linking, AI classification/summarisation/reply-drafting, and a permission-scoped AI assistant.

---

## 3. Complete Feature Inventory

### 3.1 Sales

| Feature | Route(s) | Notes |
|---|---|---|
| Lead list with filters | `/leads` | Native GET form filters — no client state |
| Lead create | `/leads/new` | **Phone field first.** Acceptance criterion: ≤ 15 seconds |
| Live phone lookup | `/api/clients/lookup` | Normalises client-side before the request; ≤ 300 ms budget |
| Lead detail / edit | `/leads/[id]`, `/leads/[id]/edit` | Loss reason mandatory when marking lost |
| Lead → project conversion | `/leads/[id]/convert` | Acceptance criterion: ≤ 20 seconds |
| Client list / detail / edit / create | `/clients/*` | Client is the durable entity; project is per-order |
| Company (corporate) records | `/companies/*` | Tax ID, payment terms |
| Contacts within companies | `/contacts/*` | |
| Quotations | `/quotes/*` | Line items, discount, VAT, print view |
| **Professional proposals** | `/proposals/*` | Multi-month commercial framework; see §3.7 |
| Pipeline board | component `pipeline-board.tsx` | |

### 3.2 Operations

| Feature | Route(s) | Notes |
|---|---|---|
| Project list | `/projects` | Filter by status, branch, owner, overdue |
| Project create / edit | `/projects/new`, `/projects/[id]/edit` | |
| Project detail | `/projects/[id]` | Status transitions rendered from the transition table |
| **Assignment queue** | `/production` | Gated on `canAssignProduction` |
| **Assign screen** | `/projects/[id]/assign` | Project manager + performer + reviewer, labelled by work mode |
| Freelancer picker | component `freelancer-picker.tsx` | Live-filtered by language pair and service line |
| Execution steps | component `project-steps.tsx` | Per-step type, performer, pages, cost |
| Delivery | `/projects/[id]/deliver` | Captures QA issues; **freezes cost**. ≤ 10 seconds |
| Cost indicator | `/api/cost-indicator` | Abstract cost band for PMs who may not see money |
| Discount approval | component `approval-panel.tsx` | Blocks all transitions while pending |

### 3.3 Freelancers

| Feature | Route |
|---|---|
| Roster with 5-key ranking | `/freelancers` |
| Detail / edit / create | `/freelancers/[id]`, `/freelancers/[id]/edit`, `/freelancers/new` |
| Bulk spreadsheet import | `/freelancers/import` |
| Payment ledger with ageing buckets | `/freelancers/payments` |

### 3.4 Commissions

| Feature | Route |
|---|---|
| My commission statement | `/commissions` — **no permission gate**; every employee sees their own, server-filtered |
| Scheme & tier management | `/settings/commissions` |
| Period close | `saveCommissionScheme` … `closeCommissionPeriod` |

### 3.5 Finance

| Feature | Route |
|---|---|
| Finance hub | `/finance` |
| Chart of accounts | `/finance/accounts` |
| Journal list / detail / edit / create | `/finance/journal/*` |
| Budget & variance | `/finance/budget` |
| Fixed assets & depreciation | `/finance/assets` |
| Period closing | `/finance/periods` |
| Trial balance | `/finance/reports/trial` |
| P&L | `/finance/reports/pl` |
| P&L by branch (F-Report 1) | `/finance/reports/branches` |

### 3.6 Analytics

`/analytics` — six reports, each permission-scoped: work-mode margins, seller performance, channel performance (CAC & ROAS, ad spend read from the ledger), funnel, client value, producer performance, yearly trend.

Two deliberate honesty rules, both tested:
- A channel with zero customers shows **"no data"**, never `CAC = 0`. Zero is a lie.
- 2024 is flagged **"incomplete"** (90 rows for the whole year versus 961 in 2025), and any growth figure computed against it is labelled **"unreliable"**.

### 3.7 Proposals (professional, print-ready)

A `Proposal` is a **document that gets sent**, not a row in a table. It carries a reference code, a revision number, a validity window, and a signatory. It prints as a 7-section branded document mirroring the company's real proposal PDF.

**The single most dangerous rule in this module:** quantity tiers are **retroactive over the entire month's volume** — the exact opposite of the commission tiers in §6 of the spec. 200,000 words bills at **SAR 14,400** (one tier applied to everything), not SAR 15,200 (progressive across slices). A unit test asserts both numbers side by side so the two models can never be conflated.

Revising a proposal **copies** it with an incremented revision; the original is never replaced — the client may have read it, and erasing it erases what they based their decision on.

Accepting a proposal **does not** create a project. That is deliberate: a proposal is a pricing framework for months, whereas a project is opened by an actual delivery of files.

### 3.8 Notifications

8 events, each with its own recipient rule and cadence:

| Event | Recipient | Cadence | Severity |
|---|---|---|---|
| `project_awaiting_assignment` | permission `canAssignProduction` | immediate | warn |
| `project_delivered` | record owner | immediate | info |
| `discount_needs_approval` | permission `canApproveDiscount` | immediate | urgent |
| `due_tomorrow` | permission `canAssignProduction` | daily 18:00 | warn |
| `overdue` | permission `canAssignProduction` | daily 09:00 | urgent |
| `delivered_uncollected` | permission `canRecordCollection` | weekly Sun 09:00 | warn |
| `lead_no_reply` | owner **and** manager | every 3 hours | urgent |
| `freelancer_payment_late` | permission `canPayFreelancers` | weekly Sun 09:00 | warn |

**Digest batching is the important part.** One card per person per event, updated in place — not one card per record. An early build produced 46 cards for 2 events; the current build produces one message aggregating 57 records into 11 lines.

### 3.9 Email

| Feature | Route |
|---|---|
| Inbox (defaults to *awaiting reply*) | `/email` |
| Message detail: body, AI reading, record linking, reply composer | `/email/[id]` |
| Compose new | `/email/new` |
| Mailbox configuration | `/settings/mailboxes/*` |
| Scheduled sync | `GET /api/cron?job=email` |

### 3.10 AI Assistant

`/assistant`, `/assistant/[id]` — threaded Q&A over system figures, scoped to the asker's permissions.

### 3.11 Administration

| Feature | Route |
|---|---|
| Users | `/settings/users/*` |
| Roles & permission grid | `/settings/roles/*` |
| Reference lists (10 lists) | `/settings/lists` |
| Price list with effective dates | `/settings/prices` |
| Staff cost inputs | `/settings/staff-costs` |
| System settings (22 keys) | `/settings/system` |
| Branch targets | `/settings/targets` |
| Audit log viewer | `/settings/audit` |
| Legacy spreadsheet import + manual review queue | `/settings/import`, `/settings/import/review` |
| Change own password | `/settings/password` |

---

## 4. User Roles

### 4.1 The permission model

Permissions are **data, not code**. 21 boolean columns on the `Role` table. The single source of truth for their names and Arabic labels is `src/lib/permissions.ts`:

```ts
export const PERMISSIONS = {
  canCreateLead, canViewAllLeads, canViewTeamLeads, canConvertProject,
  canViewSellPrice, canDiscount, canApproveDiscount, canAssignProduction,
  canViewFreelancerCost, canViewStaffSalary, canViewCostIndicator,
  canRecordCollection, canManageFreelancers, canPayFreelancers,
  canManageAccounting, canManageUsers, canManageSettings,
  canViewCompanyAnalytics, canViewTeamAnalytics, canUseEmail, canUseAi,
} as const;
```

**Adding a permission is a three-line change:** one entry in `PERMISSIONS`, one hint in `PERMISSION_HINTS`, one nullable boolean column in `schema.prisma`. The roles screen, the permission grid component, and `saveRole` are all built from `PERMISSION_KEYS` and pick it up with no further edits. Then run `npm run bootstrap` to propagate defaults to system roles.

### 4.2 The seven default roles

These are **seed data only**. Management can edit them and create new ones from the UI.

| Role (`name`) | Arabic label | Discount limit | Permissions |
|---|---|---|---|
| `system_admin` | مدير النظام | 100% | All 21 |
| `executive` | الإدارة | 100% | ViewAllLeads, ViewSellPrice, ApproveDiscount, ViewFreelancerCost, **ViewStaffSalary**, ViewCostIndicator, CompanyAnalytics, TeamAnalytics, UseAi |
| `sales_manager` | مدير مبيعات | 20% | CreateLead, **ViewTeamLeads**, ConvertProject, ViewSellPrice, Discount, ApproveDiscount, RecordCollection, TeamAnalytics, UseEmail, UseAi |
| `sales_admin` | أدمن مبيعات | 10% | CreateLead, ConvertProject, ViewSellPrice, Discount, RecordCollection, UseEmail, UseAi |
| `project_manager` | مدير مشاريع | — | ViewAllLeads, AssignProduction, ViewFreelancerCost, ViewCostIndicator, ManageFreelancers, TeamAnalytics, UseEmail, UseAi |
| `finance` | ماليات | — | ViewSellPrice, ViewFreelancerCost, RecordCollection, PayFreelancers, ManageAccounting, CompanyAnalytics |
| `coordinator` | منسق | — | ViewAllLeads |

**Two deliberate omissions you must not "fix":**

- **The project manager cannot see `canViewSellPrice`.** This is intentional and stated in the spec: assignment decisions must not be influenced by how much the order is worth. The PM gets `canViewCostIndicator` instead — an abstract cost band with no currency figure.
- **The sales admin cannot see `canViewFreelancerCost` or `canViewStaffSalary`.** Sales must not learn the cost base.

### 4.3 Visibility scope

Derived from permissions in `scopeOf()`:

```
canViewAllLeads  → 'all'   (no owner filter)
canViewTeamLeads → 'team'  (self + all transitive reports via reportsToId)
neither          → 'self'  (own records only)
```

`visibleUserIds()` walks the management tree breadth-first to arbitrary depth. `ownerFilter()` returns a ready Prisma `where` fragment.

**Branch restriction** layers on top: `branchFilter()` adds `{ branch: user.branch }` unless the user has `canViewAllLeads`. Governed by the `restrict_by_branch` setting, which **defaults to enabled** — and note the subtlety in the code: an *absent* setting row means "not yet seeded", not "disabled".

### 4.4 Two things that are not roles

- `User.isProducer` — a boolean independent of role. Someone can be a sales admin who also translates. The assignment dropdown reads this flag, not the role.
- `User.reportsToId` — the management tree. It drives team visibility **and** commission manager share. A user with no manager takes both shares (see §5.5).

---

## 5. Business Workflows

### 5.1 Lead intake

```
Phone entered → normalizePhone() → lookup existing client
   ├─ match found  → show existing client, offer "new order for this client"
   └─ no match     → create Lead (code LD-YYMM-NNNN, monthly counter)
```

**Phone normalisation is the most important function in the system for data quality.** `src/lib/phone.ts` implements the seven-step rule from spec §14 literally:

1. Strip everything that is not a digit
2. **Strip invisible direction marks** (`U+2066`–`U+2069`, `U+202A`–`U+202E`, `U+200E`, `U+200F`)
3. Strip leading `00`
4. 11 digits starting `01` → prefix `20`
5. 10 digits starting `1` → prefix `20`
6. 12 digits starting `20` → leave
7. `"0"` or fewer than 8 digits → `NO_PHONE`

Step 2 is not cosmetic: the spec warns that without it **≈10% of matches are lost**, because numbers pasted from WhatsApp carry invisible bidi marks. There is also a specific guard for Excel numeric export (`201117741994.0`) where the decimal must be truncated *before* non-digits are stripped, or a trailing zero glues on and matches nothing.

`Client.phoneNormalized` is `@unique`. The database is the last line of defence against duplicates.

### 5.2 Lead → Project conversion

`convertLead()` creates or reuses the `Client`, creates the `Project` (code `PR-YYMM-NNNN`), stamps `convertedAt`, and sets lead status `WON`. Losing a lead requires a `lossReason` from the reference list — the spec's rationale: *"without a reason we learn nothing."*

### 5.3 The project state machine

Eight states, defined once in `src/lib/projects.ts` and consumed by the UI, the mutation layer, and the tests:

```
pending_assignment ──▶ in_progress ──▶ in_review ──▶ ready ──▶ delivered ──▶ collected
        │                  │  ▲            │  │        │           │              │
        │                  │  └────────────┘  │        │           │              │
        │                  ▼                  ▼        ▼           ▼              ▼
        └──────────────▶ cancelled ◀──────────┴────────┘        rework ◀──────────┘
                                                                   │
                                                                   └──▶ in_progress
```

Encoded as `TRANSITIONS: Record<ProjectStatus, TransitionRule[]>`. Each rule carries an optional required permission and optional required fields. The `anyOf` construct exists because a project's performer may be an internal employee, a registered freelancer, **or** a free-text external name — what matters is that *someone* is assigned:

```ts
{ field: 'primaryProducerId',
  label: 'المنفِّذ (موظف داخلي أو فريلانسر)',
  anyOf: ['primaryProducerId', 'primaryFreelancerId', 'externalName'] }
```

Enforced centrally in `moveProject()` (`src/lib/mutations/projects.ts:178`). Nothing bypasses it.

**Side effects triggered by transitions:**

| Transition | Side effect |
|---|---|
| → `in_progress` | Stamps `assignedAt` (once); defaults `projectManagerId` to the actor |
| → `delivered` | Stamps `deliveredAt`; **stamps `revenueMonth`** (revenue recognition); generates a **draft** revenue journal entry |
| → `collected` | Stamps `collectedAt`, `closedAt`; **rebuilds the commission period**; generates a draft collection journal entry |
| → `cancelled` | Requires `cancelReason`; **clears `revenueMonth`** so it leaves all financial reports; if it was `collected`, writes a **reversing** commission entry |
| → `rework` | Sets `isRework`; if it was `collected`, writes a reversing commission entry |

Note that the ledger receives **drafts**, never posted entries. The accountant reviews and posts. The books are never written behind the accountant's back.

**The discount freeze:** if `approvalState === 'pending'`, *no* transition is permitted except `cancelled`. Cancellation stays open deliberately — otherwise a project whose discount everyone refuses would be stuck with no exit.

### 5.4 Costing and margin

The unit of account is the **weighted page**:

```
weighted_pages = MAX(min_weighted_unit, pages × mode_factor × line_factor)
```

`min_weighted_unit` (default 1.0) exists because someone processing 12 birth certificates in a day expends administrative switching effort that someone processing one file of the same word count does not.

```
standard_cost_per_weighted_page = (monthly_salary ÷ working_days × productive_ratio) ÷ daily_capacity
step_cost_internal              = step.weighted_pages × standard_cost_per_weighted_page
step_cost_external              = step.pages × resolved_rate      ← RAW pages, not weighted
```

The raw-vs-weighted distinction is deliberate: the freelancer is paid per page as agreed with them; the effort factor measures *internal* capacity consumption and has nothing to do with what we owe them.

**Reviewer cost is zero in three cases**, all of them double-counting guards:
1. No named reviewer
2. The reviewer is the same person as the producer
3. The work mode *is itself* review or proofreading (`review_human`, `proofread`) — the review is already priced into the mode factor

Missing data returns **zero, not a division-by-zero and not a guess**. Zero then trips an open alert via `projectAlert()`, so it surfaces loudly rather than passing silently as a 100% margin.

**Cost is frozen at delivery** (`freezeProjectCost`). `costInternal`, `costExternal`, `costTotal`, `margin`, `marginPct` and `weightedPages` are snapshots. A salary change next month must not rewrite last month's margins.

### 5.5 Commissions

```
period total (collected)  →  computeCommission({ total, tiers, mode, hasManager })
                          →  splitByProject(amount, projects)     // exact, remainder to last row
                          →  CommissionEntry rows (admin + manager)
```

- Tier mode is configurable: `progressive` (each tier applies to its own slice — the default) or `whole` (the achieved tier applies to the entire amount).
- **"No manager takes both shares"** — when a seller has no `reportsToId`, they receive the admin share *plus* the manager share, because all the work was theirs.
- Amounts are **split per project** so a clawback can be traced exactly. The split sums to the total **exactly**; rounding drift goes to the last row.
- Clawback is a **reversal entry with a negative amount**, never a delete.

> **A bug that was found and fixed here — do not reintroduce it.** `rebuildPeriod` recomputes a period from scratch. An early version left orphaned reversal entries behind, so a cancelled project was deducted twice: once because it vanished from the recomputation, and again by its stale reversal. The fix clears reversals whose `projectId` is no longer live before recomputing.

### 5.6 Freelancer rate resolution

Rates are stored per (freelancer, service line, source lang, target lang, unit). `resolveRate()` picks the **most specific match**, and treats a stored `0` as *"not agreed"* → `null`, never as "free". Six rate units are supported: source word, target word, page, hour, minute, flat.

### 5.7 Finance posting

```
Business event → draft*() generator → JournalEntry(status: draft)
                                    → accountant reviews in /finance/journal
                                    → postEntry() validates balance + open period
                                    → status: posted
```

`checkBalance()` rejects: negative amounts, a line with both debit and credit, an empty line set, and a single-line entry. `postEntry()` additionally refuses if the fiscal period is closed. Correction is via `voidEntry()`, which writes a mirror-image reversing entry.

Draft generators exist for: revenue on delivery, collection, freelancer payment, commission accrual, and monthly depreciation.

### 5.8 Email lifecycle

```
IMAP fetch (UID > lastUid, max 50/sync)
  → parse (mailparser)
  → dedupe by Message-ID
  → skip own outbound echo
  → stripQuoted() + signature removal
  → matchRecords():  email address → phone in body → corporate domain
  → keyword classification (works with no AI key)
  → AI analysis: intent, urgency, sentiment, summary, suggested reply
  → stored; appears in "awaiting reply"
  → human reads, edits, sends
```

**No reply is ever sent autonomously.** The model drafts; a person reads, edits and presses send. An outbound message under the office's name is a commitment by the office, and the office must not be committed by something no human read.

Public domains (`gmail.com`, `hotmail.com`, …) are excluded from company matching — otherwise every Gmail customer collapses into one company.

---

## 6. Database Documentation

### 6.1 Physical setup

| | Development | Production |
|---|---|---|
| Engine | SQLite (file) | PostgreSQL 16 (Neon) |
| Provider selection | `scripts/db-provider.mjs` rewrites `schema.prisma` based on the `DATABASE_URL` scheme | same |
| Schema application | `prisma db push` | `prisma db push --accept-data-loss` inside `vercel-build` |
| Concurrency tuning | `PRAGMA journal_mode=WAL; busy_timeout=5000; synchronous=NORMAL` | n/a |

> **On `--accept-data-loss`:** the flag is there because Prisma requires it for any non-additive diff. The discipline that makes it safe is a **convention, not a guarantee**: every new column is added nullable or with a default, so the computed diff is additive only. See §14.2 — this is the highest-severity risk in the current setup.

The SQLite WAL tuning is not incidental. Without it, SQLite's single-writer lock caused saves to hang behind page reads: the first record saved, then the request froze and the button sat on "saving…" forever.

### 6.2 Naming and mapping

Several tables carry `@map` directives because the schema predates the specification and renaming would have required a data migration on live data:

| Prisma model / field | Physical name | Why |
|---|---|---|
| `Project` | table `Deal` | The pre-spec system modelled sales deals |
| `Project.status` | `stage` | Same |
| `Project.netTotal` | `amount` | Same |
| `Project.pages` | `pageCount` | Same |
| `Project.deadline` | `deliveryDate` | Same |
| `Project.serviceLine` | `serviceType` | Same |
| `Project.cancelReason` | `lostReason` | Same |

The mapping is documented in `FIELD-MAPPING.md`, as spec §0 requires. **Do not "clean this up."** The physical names are load-bearing for the migrated production data.

### 6.3 The 46 models by domain

#### Identity & Authorization

| Model | Fields | Key points |
|---|---|---|
| `User` | 52 | `roleId`, `branch`, `reportsToId` (self-relation), `isProducer`; ~30 back-relations |
| `Role` | 30 | 21 permission booleans + `discountLimit` + `isSystem` |
| `ListItem` | 8 | Reference lists; `@@unique([listName, value])`; `extra` holds numeric factors |
| `AuditLog` | 10 | `userId, action, tableName, recordId, field, oldValue, newValue`. **Append-only** |
| `Setting` | 4 | 22 keys, string-valued, typed by `SETTING_DEFINITIONS` |
| `Counter` | 2 | Atomic sequence counters — see §6.5 |

#### Sales

| Model | Fields | Key points |
|---|---|---|
| `Lead` | 35 | `code` `LD-YYMM-NNNN`; `channel`, `contactMethod`, `firstReplyAt`, `lossReason`, `legacyKey @unique` |
| `Client` | 28 | `code` `CL-NNNNN`; **`phoneNormalized @unique`**, plus `phoneAltNormalized` |
| `Company` | 26 | Corporate entity: tax ID, payment terms, website |
| `Contact` | 20 | Person inside a company |
| `Quote` / `QuoteItem` | 25 / 12 | Quick per-order quotation |
| `Proposal` / `ProposalTierRow` | 36 / 9 | Multi-month commercial framework; `revision`, `validityDays`, `contractingEntity` |
| `PriceListItem` | 12 | **`effectiveFrom` is mandatory** — price history is preserved |

#### Operations

| Model | Fields | Key points |
|---|---|---|
| `Project` | **83** | The central object. See §6.4 |
| `ProjectStep` | 21 | Type, performer (user or freelancer), pages, weighted pages, cost |
| `Freelancer` | 31 | `code` `FL-NNNN`, tier, languages, service lines, rating |
| `FreelancerRate` | 14 | (service line × lang pair × unit) → rate |
| `FreelancerPayment` | 19 | Due / paid, method, reference, ageing |
| `StaffCost` | 9 | Salary, productive ratio, daily capacity — the internal cost inputs |

#### Commissions

`CommissionScheme` (13) · `CommissionTier` (8) · `CommissionAssignment` (7) · `CommissionEntry` (17, with `isReversal`) · `CommissionPeriod` (6) · `BranchTarget` (6)

#### Finance

| Model | Fields | Key points |
|---|---|---|
| `Account` | 20 | 4-level tree, `type`, `group`, `systemKey` for event binding |
| `JournalEntry` | 21 | `draft` / `posted` / `void`; author and poster tracked separately |
| `JournalLine` | 20 | **8 dimensions**: account, cost centre, branch, project, client, sales admin, currency, FX rate |
| `CostCenter` | 7 | Seeded with the office's real cost centres |
| `FiscalPeriod` | 6 | Closing freezes the month |
| `Budget` / `BudgetLine` | 11 / 8 | Annual plan with monthly spread |
| `FixedAsset` | 18 | Category-driven depreciation rates (25%–50%) |

#### Platform

`Task` (22) · `Note` (13) · `Activity` (15) · `Notification` (13) · `NotificationRun` (5) · `MigrationReview` (11)

#### Communications & AI

| Model | Fields | Key points |
|---|---|---|
| `Mailbox` | 23 | `ownerId` null ⇒ **shared**; `secret` is AES-256-GCM ciphertext; `lastUid` for incremental sync |
| `EmailMessage` | 38 | Full body stored locally; `threadKey`; AI fields all nullable; links to lead/client/company/project |
| `AiThread` / `AiMessage` | 7 / 7 | Private to the asking user |
| `AiRun` | 12 | Every model call: purpose, tokens, cost, latency, ok/error |

### 6.4 `Project` — the central object, annotated

83 fields grouped by lifecycle stage. The grouping is meaningful: fields are populated at different moments by different roles.

```
Identity      id · code (PR-YYMM-NNNN) · title · description · legacyKey
State         status (@map "stage") · probability
Pricing       netTotal (@map "amount") · currency · unitPrice · gross · isRush
              · discountType · discountValue
Collection    deposit · collectedAmount · collectedAt
Service       serviceLine · sourceLang · targetLang · wordCount · pages
              · deadline · isExpress
Approval      approvalState · approvedAt · approvalNote · approvedById
Production    projectManagerId · workMode · sourcing · primaryProducerId
              · reviewerId · qaIssues · isRework · folderUrl
External      externalRate · externalName · primaryFreelancerId
              · reviewerFreelancerId · reviewerRate
Cost (frozen) weightedPages · costInternal · costExternal · costTotal
              · margin · marginPct · costedAt
Timestamps    createdAt · convertedAt · assignedAt · deliveredAt · closedAt · updatedAt
Reporting     revenueMonth · cancelReason (@map "lostReason") · branch
Relations     leadId · companyId · contactId · clientId · ownerId
```

Eight indexes: `status`, `ownerId`, `companyId`, `clientId`, `branch`, `revenueMonth`, `deadline`, `primaryProducerId`.

### 6.5 Sequences

Counters live in the `Counter` table and are incremented atomically via `upsert` + `increment`.

```
CL-00001            clients        never resets
FL-0001             freelancers    never resets
LD-2608-0001        leads          monthly counter
PR-2608-0042        projects       monthly counter
JV-2608-0001        journal        monthly counter
FT-KSA-2608-021     proposals      monthly counter
```

**Why a counter table and not `COUNT(*) + 1`:** counting gives two people saving in the same instant the same number, and it recycles numbers of deleted rows. Atomic increment inside a transaction prevents both.

### 6.6 Referential integrity policy

Almost every foreign key uses `onDelete: SetNull`. Cascade is used only where the child has no independent meaning (`AiMessage` → `AiThread`, `EmailMessage` → `Mailbox`, `CommissionEntry` → `User`).

The reason is invariant #3: a record must not disappear because something it referenced was removed. A project whose owner was deactivated keeps its history and simply shows no owner.

### 6.7 Data volumes

Production, post-migration:

| | Rows |
|---|---|
| Clients | 3,448 |
| Leads | 2,154 |
| Projects | 3,105 |
| Freelancers | 1,067 |
| Accounts | 249 |
| Migrated revenue | EGP 3,115,041 |
| Rows sent to manual review | 258 (each with a written reason) |

---

## 7. APIs

There is **no REST or GraphQL API for third parties.** The HTTP surface exists to serve this application's own HTML forms. That is a deliberate constraint (see §12.1 and §17.3).

### 7.1 `POST /api/save` — the universal save endpoint

The single write path for all form-based mutations.

**Contract:**

| Field | Meaning |
|---|---|
| `entity` | Discriminator, e.g. `lead`, `project.assign`, `email.reply` |
| `id` | Empty on create, present on update |
| `back` | Path to return to when validation fails |
| *(rest)* | Domain fields |

**Response:** always `303 See Other` with a **relative** `Location`. On `MutationError`, redirects to `back` with `?error=<Arabic message>`.

The `Location` header is relative because in production the app sits behind a proxy and sees itself as `http://0.0.0.0:3000`; an absolute URL would send the user to an internal address. `redirectTo()` also validates the path starts with a single `/` — an open-redirect guard.

**56 entities:**

```
Sales        lead · lead.convert · client · company · contact · quote
Projects     project · project.move · project.assign · project.deliver
             · project.approval · step
Pricing      priceItem · staffCost
Freelancers  freelancer · freelancerRate · freelancerPayment · freelancer.import
Proposals    proposal · proposalTier · proposal.decide · proposal.revise
Email        mailbox · mailbox.check · email.sync · email.analyze
             · email.suggest · email.reply · email.compose · email.link
AI           assistant.start · assistant.ask · assistant.delete
Notifications notifications.read · notifications.run
Migration    legacy.import · migrationReview
Finance      account · costCenter · journalEntry · journalEntry.decide
             · fiscalPeriod · budget · budgetLines · fixedAsset · journal.generate
Commissions  commissionScheme · commissionTier · commissionAssignment
             · commissionPeriod.close
Platform     task · user · role · listItem · settings · targets · password
```

> **Naming trap.** The field name `entity` is the *router discriminator*. A domain field of the same name will silently hijack routing. This happened once: the proposal's "contracting entity" field was named `entity` and broke proposal saves. It is now `contractingEntity`. **Never name a domain field `entity`, `id`, or `back`.**

### 7.2 `POST /api/mutate` — small in-page state changes

For toggles and logical deletes that return to the current page.

**Contract:** `op`, `id`, optional `value`, `redirectTo`.

**18 ops:** `task.toggle`, `task.delete`, `project.status`, `lead.status`, `quote.status`, `commissionTier.delete`, `proposalTier.delete`, `freelancerRate.delete`, `freelancer.deactivate`, `note.delete`, `lead.delete`, `project.delete`, `deal.delete`, `company.delete`, `contact.delete`, `quote.delete`, `user.deactivate`, `user.delete`.

All "delete" ops are **logical** — they deactivate or soft-remove and write an audit row.

### 7.3 `POST /api/auth`

`mode=login` (email + password → bcrypt compare → JWT session cookie) or `mode=logout`.

### 7.4 `GET /api/clients/lookup?phone=…`

Live phone lookup for the lead form. Normalises server-side; returns a minimal client shape. Budget: ≤ 300 ms.

### 7.5 `GET /api/cost-indicator?...`

Returns an **abstract cost band** — no currency figure — for users holding `canViewCostIndicator` but not `canViewFreelancerCost`. Returns 403 otherwise, and there is an e2e test asserting the 403.

### 7.6 `POST /api/notes`

Adds a note to a record.

### 7.7 `GET /api/cron?job=all|email|notifications`

Scheduled work: mailbox sync and notification generation.

**Authentication:** `Authorization: Bearer <CRON_SECRET>` or `?key=<CRON_SECRET>`.
**If `CRON_SECRET` is unset the route returns 503 and does nothing.** Closed by default is the safe default for a route that opens the company's mailboxes.

### 7.8 `GET /api/health`

Liveness probe.

### 7.9 Authentication & session

- JWT (HS256, `jose`), subject = user id, 7-day expiry
- Cookie `crm_session`: `httpOnly`, `sameSite=lax`, `secure` in production
- `middleware.ts` performs a cheap cookie-presence check and redirects to `/login`; **real verification happens in `requireUser()` inside each page/route**, which re-reads the user and their role from the database on every request
- Reading permissions from the database each request (rather than embedding them in the token) means **a permission change takes effect immediately** — no re-login, no token rotation. This is why the e2e suite can assert "a new role created in the UI takes effect at once."

---

## 8. Source Code Architecture

### 8.1 Layering

```
┌───────────────────────────────────────────────────────────────┐
│ PRESENTATION   src/app/(app)/**/page.tsx        83 pages       │
│                src/components/**                29 components  │
│                Server Components by default. Display + forms.  │
│                Contains no business calculation.               │
├───────────────────────────────────────────────────────────────┤
│ GATEWAY        src/app/api/{save,mutate,auth,cron,...}/route.ts│
│                Authenticate → dispatch → 303. No logic.        │
├───────────────────────────────────────────────────────────────┤
│ MUTATION       src/lib/mutations/*.ts           15 modules     │
│                Permission check, validation, orchestration,    │
│                audit. Returns the redirect path.               │
├───────────────────────────────────────────────────────────────┤
│ ENGINE         *-engine.ts · ledger.ts · analytics.ts          │
│                · assistant.ts · pricing.ts · import-legacy.ts  │
│                `server-only`. Touches DB and network.          │
├───────────────────────────────────────────────────────────────┤
│ PURE RULES     costing · commission · accounting · projects    │
│                · freelancers · notifications · proposals       │
│                · email · ai · phone · migration                │
│                No DB, no network, no clock beyond injection.   │
│                ★ ALL BUSINESS LOGIC LIVES HERE ★               │
└───────────────────────────────────────────────────────────────┘
```

**The pure/engine split is the most important structural decision in the codebase.** Every rule that a businessperson would recognise as a rule lives in a side-effect-free module that can be unit-tested with no server, no database and no browser. That is why there are 605 unit tests running in under a second, and why three genuine bugs in the email module were caught before anyone saw them.

The test for whether new code is in the right place: **if you cannot test it without a database, it is in the wrong layer.**

### 8.2 `src/lib/` — pure modules

| Module | LOC | Responsibility |
|---|---|---|
| `phone.ts` | 130 | Seven-step normalisation |
| `costing.ts` | 352 | Spec §8 formulas, literally |
| `commission.ts` | 213 | Tier computation, per-project split |
| `projects.ts` | 283 | States, transition table, alert guard, derived values |
| `accounting.ts` | 488 | Balance check, trial balance, P&L, variance, depreciation |
| `freelancers.ts` | 510 | Name cleaning, rate resolution, ranking, sheet parsing |
| `notifications.ts` | 309 | Event catalogue, due-time logic, digest building |
| `proposals.ts` | 256 | Retroactive tiers, volume table, commercial terms |
| `email.ts` | 341 | Subject/address normalisation, quote & signature stripping, threading, keyword classification |
| `ai.ts` | 244 | Prompt construction, PII redaction, response parsing, cost table |
| `migration.ts` | 359 | Legacy date/amount parsing, admin matching, row classification |
| `permissions.ts` | 210 | Permission catalogue, default roles |
| `lists.ts` | 210 | 10 reference lists with factors |
| `settings-defs.ts` | 210 | 22 typed settings |
| `chart-of-accounts.ts` | 691 | 122 seed accounts, cost centres, depreciation rates |
| `constants.ts` | 216 | Shared constants |
| `utils.ts` | — | `str`/`num`/`date` FormData readers, formatters |
| `sequence-keys.ts` | — | Pure part of the sequence generator |

### 8.3 `src/lib/` — engines (`server-only`)

| Module | LOC | Responsibility |
|---|---|---|
| `ledger.ts` | 621 | Post/void entries, account totals, P&L, balance sheet, 5 draft generators |
| `analytics.ts` | 479 | 7 analytical reports |
| `notification-engine.ts` | 403 | Per-event collectors, digest writing, unread count |
| `import-legacy.ts` | 389 | Lead sheet and sales sheet importers |
| `email-engine.ts` | 541 | IMAP/SMTP, record matching, AI analysis, sending |
| `commission-engine.ts` | 339 | Period rebuild, reversal, statements |
| `project-costing.ts` | 300 | Reads factors, applies `costing.ts`, freezes at delivery |
| `pricing.ts` | 268 | Price lookup by effective date, discount resolution |
| `freelancer-engine.ts` | 231 | Index, project filter, rate resolution, step payments, ageing |
| `assistant.ts` | 214 | Permission-scoped context construction, threaded Q&A |
| `ai-client.ts` | 190 | The **only** path to the model API: key check, budget check, logging |
| `auth.ts` | 230 | Session, permission check, visibility scope |
| `audit.ts` | 68 | Event and field-diff logging |
| `crypto.ts` | 60 | AES-256-GCM for service secrets |
| `db.ts` | 52 | Prisma singleton + SQLite tuning |
| `http.ts` | 34 | Safe relative redirects |
| `sequence.ts` | 65 | Atomic counters |
| `reference.ts` | — | Reference-list option loading |
| `clients.ts` | — | Client lookup helpers |

### 8.4 `src/lib/mutations/` — the modularity answer

This directory exists because of an explicit business requirement: *"when I ask for a feature or a modification, it must not mean rewriting the system from scratch."*

Before Phase 11 this was **one file of 2,721 lines** containing leads, accounting, freelancers, projects, commissions and settings together. Any change opened that file, and a change to freelancers risked breaking accounting.

```
mutations/
  base.ts          39   MutationError · requireOwn · readDeadline
  index.ts         95   barrel — the only import path anyone uses
  ai.ts            53   assistant threads
  alerts.ts       116   notifications
  pricing.ts      128   price list
  tasks.ts        134   tasks
  migration.ts    157   legacy import + review queue
  proposals.ts    188   professional proposals
  commissions.ts  219   schemes, tiers, assignments, period close
  email.ts        257   mailboxes, sync, analysis, reply
  freelancers.ts  383   roster, rates, payments, import
  admin.ts        477   users, roles, lists, settings, targets, staff cost
  accounting.ts   513   accounts, journal, budgets, assets, periods
  projects.ts     629   save, move, approve, assign, steps, deliver
  sales.ts        636   leads, clients, companies, contacts, quotes
```

`MutationError` is exported from `base.ts` **and only from there**. Two copies of the class would make `instanceof` fail in the save route, silently swallowing the Arabic error message and showing a generic failure instead.

What this buys you, concretely:

| Request | Files opened | Files untouched |
|---|---|---|
| "Add a field to freelancers" | `schema.prisma`, `mutations/freelancers.ts`, its screens | accounting, leads, projects, commissions |
| "Change the commission tiers" | `commission.ts` + its 40 tests | everything else |
| "Add a report" | `analytics.ts` + one page | no write path at all |
| "Add a permission" | `permissions.ts` + one column | all screens pick it up automatically |
| "Add a project state" | the transition table in `projects.ts` | the board renders from the same table |
| "Integrate an external service" | one pure module + one engine module | no other layer |

### 8.5 Components

29 components in `src/components/`. Almost all are Server Components. The only `'use client'` components are those that genuinely need browser state: `shell.tsx` (mobile drawer), `confirm-submit.tsx` (a `window.confirm` wrapper), `phone-lookup.tsx`, `freelancer-picker.tsx`, `pipeline-board.tsx`, `quote-items-editor.tsx`, `express-deadline.tsx`, `print-button.tsx`.

`ui.tsx` holds the design-system primitives: `PageHeader`, `Badge`, `StatCard`, `EmptyState`, `Field`, `FormField`, `SelectField`, `TextAreaField`, `ErrorAlert`, `Avatar`.

### 8.6 Testing

```
tests/
  phone.mjs          20   phone normalisation
  costing.mjs        47   §8 formulas, number by number
  commission.mjs     40   tiers, split, clawback
  freelancers.mjs    87   rate resolution, parsing, ranking
  accounting.mjs     83   balance, trial balance, P&L, variance, depreciation
  migration.mjs      81   legacy dates, amounts, classification
  notifications.mjs  70   due times, digest batching
  proposals.mjs      52   retroactive tiers, turnaround, terms
  email.mjs          76   subjects, addresses, quote stripping, threading
  ai.mjs             49   redaction, JSON extraction, safe parsing, budget
  ────────────────────────
  e2e.mjs           168   real Chromium against a built server
```

Unit tests are plain ESM run via `tsx`, with a tiny hand-rolled assertion helper. There is no test framework and that is intentional: the suites run in about a second total and produce Arabic output that the business owner can read.

The e2e suite drives Playwright against `npm run start`, logs in as different roles, and asserts both behaviour and **absence of leakage** (it greps the raw HTML for sensitive field names).

CI (`.github/workflows/ci.yml`) runs the whole thing against a real PostgreSQL 16 service container on every push.

---

## 9. Architecture Decisions

Recorded here as ADRs. Each one has a measured or specified reason; none is stylistic.

### ADR-001 — Permissions as data, not code
**Decision.** 21 boolean columns on `Role`; checked exclusively via `can(user, permission)`.
**Why.** Management creates and edits roles from a settings screen with no deploy. Any condition keyed on a role name breaks the moment a new role exists.
**Consequence.** Adding a permission is three lines plus a bootstrap run. Screens and the role editor derive from `PERMISSION_KEYS`.

### ADR-002 — Classic form POST → 303, not Server Actions
**Decision.** All writes are `<form method="post">` to `/api/save` or `/api/mutate`, answered with `303 See Other`.
**Why.** Server Actions hung in the browser ~50% of the time: the write succeeded server-side but the UI never navigated.
**Consequence.** The system works without JavaScript. No optimistic UI. Every write is a full page navigation — acceptable because pages render server-side in milliseconds.

### ADR-003 — Plain `<a>`, not `next/link`
**Decision.** `src/components/link.tsx` wraps a plain anchor.
**Why.** Client-side navigation failed to navigate ~1 click in 3.
**Consequence.** Full page loads on navigation; every link works, always.

### ADR-004 — Pure rules separated from engines
**Decision.** Business rules live in side-effect-free modules; anything touching the DB or network is a separate `server-only` module.
**Why.** Testability, and to keep business logic out of screens and queries.
**Consequence.** 605 fast unit tests. Three real email bugs caught pre-release.

### ADR-005 — Nothing is deleted
**Decision.** Logical deletion + permanent `AuditLog`; ledger corrections by reversal; commission clawback by negative reversal entry.
**Why.** Spec §3 item 5, and what a chartered accountant will accept.
**Consequence.** All "delete" operations are soft. `onDelete: SetNull` almost everywhere.

### ADR-006 — Revenue recognised by state
**Decision.** Only `delivered` and `collected` enter financial reports. Cancelling clears `revenueMonth`.
**Why.** Spec §3 item 4.
**Consequence.** One exported `REVENUE_FILTER` used by every financial query. Operational dashboards use a different filter (`ACTIVE_STATUSES`).

### ADR-007 — Cost frozen at delivery
**Decision.** `costTotal`, `margin`, `marginPct`, `weightedPages` are snapshots written by `freezeProjectCost()`.
**Why.** A salary or factor change next month must not rewrite last month's margins.
**Consequence.** The one deliberate exception to "derive, don't store."

### ADR-008 — Prices carry effective dates
**Decision.** `PriceListItem.effectiveFrom` is mandatory; lookup orders by `effectiveFrom desc, createdAt desc`.
**Why.** Changing today's price must not change last month's invoice.
**Consequence.** Price edits insert a new row. The `createdAt` tiebreak exists because two prices can share a date.

### ADR-009 — Additive-only schema changes
**Decision.** New columns are nullable or defaulted, so `prisma db push` on a populated production table only adds.
**Why.** Deploys must never drop production data.
**Consequence.** No down-migrations, no renames on live tables (hence the `@map` directives).

### ADR-010 — Arabic-only UI, English-only keys
**Decision.** Every visible string is Arabic; every programmatic key is English.
**Why.** Spec §0. The users are Arabic-speaking staff.
**Consequence.** Renaming a display label never breaks a query.

### ADR-011 — Draft-first accounting
**Decision.** Business events generate **draft** journal entries; only the accountant posts.
**Why.** The books are not written behind the accountant's back.
**Consequence.** Five `draft*()` generators; posting validates balance and open period.

### ADR-012 — AI has no privileges of its own
**Decision.** The assistant's context is built with the *asker's* permissions. Every model call goes through `callAi()`, which checks the key and the daily budget and logs to `AiRun`.
**Why.** Context built with server privileges would make the assistant a back door around every field hidden in §5.
**Consequence.** A project manager asking the assistant about selling prices is told the figures are not available to them.

### ADR-013 — AI drafts, humans send
**Decision.** No outbound email is sent autonomously.
**Why.** An outbound message under the office's name is a commitment by the office.
**Consequence.** The suggested reply is pre-filled into an editable textarea, not queued.

### ADR-014 — Graceful degradation without AI
**Decision.** Email classification falls back to keyword matching; AI buttons disappear when no key is configured.
**Why.** A key can expire or run out of credit; the office must keep working.
**Consequence.** Every AI-derived column is nullable, and `parseAnalysis()` has a safe fallback for every field.

### ADR-015 — Service secrets encrypted, not hashed
**Decision.** Mailbox passwords use AES-256-GCM with a key from the environment (`SECRET_KEY`, falling back to `AUTH_SECRET`).
**Why.** Unlike user passwords, the server must recover these to connect. Keeping the key out of the database means a database dump alone does not hand over the company's email.
**Consequence.** `SECRET_KEY` must be present before mailboxes can be saved; the UI refuses otherwise.

### ADR-016 — Cron closed by default
**Decision.** `/api/cron` returns 503 unless `CRON_SECRET` is set, and 401 unless it matches.
**Why.** An unauthenticated route that opens mailboxes is an open door.
**Consequence.** Scheduled sync requires explicit configuration.

---

## 10. Coding Standards

### 10.1 Language

- **All user-visible strings are Arabic.** No English in the UI.
- **All programmatic keys are English.** `status = 'pending_assignment'`, displayed as «قيد الإسناد».
- **All code comments and doc-comments are Arabic**, and they explain **why**, not what.

This last point deserves emphasis, because it is the codebase's chief documentation asset. A representative example from `costing.ts`:

> «**لماذا الحد الأدنى:** من ينجز ١٢ شهادة ميلاد في اليوم يبذل جهدًا إداريًا في التبديل بين المستندات لا يبذله من ينجز ملفًا واحدًا بنفس عدد الكلمات.»
> *(Why the minimum: someone completing 12 birth certificates in a day expends administrative switching effort that someone completing one file of the same word count does not.)*

When you add a rule, add its reason in the same voice. A comment that restates the code is noise; a comment that records the decision is the handover.

### 10.2 Structure

- Business rules go in a pure module. **If it cannot be tested without a database, it is in the wrong layer.**
- A new domain gets a new file in `mutations/`, never an addition to an existing domain's file.
- Everything is imported from the barrel: `@/lib/mutations`. Moving a function between files must not break a caller.
- `server-only` is imported at the top of every module that must not reach the browser.

### 10.3 Data

- New columns are **nullable or defaulted**.
- Anything measurable carries its date: `effectiveFrom`, `period`, `revenueMonth`.
- Indexes go where screens actually filter.
- Money is `Float` in the schema. See §14.3 — this is a known risk with a documented mitigation, not an oversight.

### 10.4 Errors

- `MutationError` carries an **Arabic message intended for the user**, surfaced via `?error=` and `<ErrorAlert>`.
- Unexpected errors are logged and shown as a generic message.
- **Missing data returns zero or null and raises an alert — it never guesses and never divides by zero.**

### 10.5 Naming

| Kind | Convention | Example |
|---|---|---|
| Model | PascalCase singular | `JournalEntry` |
| Field | camelCase | `phoneNormalized` |
| Enum-ish value | snake_case string | `pending_assignment` |
| Permission | `can` + verb + object | `canViewSellPrice` |
| Save entity | `domain` or `domain.action` | `project.assign` |
| Mutate op | `domain.action` | `task.toggle` |
| Pure module | noun | `costing.ts` |
| Engine module | noun + `-engine` | `commission-engine.ts` |

### 10.6 Testing

- Every new business rule ships with its test in the same commit.
- Test **the rule, not the fixture** — capture a value before and after and assert the delta, rather than asserting a literal that another test's data can shift.
- Test names are Arabic sentences that read as specifications.
- Assert the *dangerous* case explicitly. The proposals suite asserts both 14,400 (correct, retroactive) **and** that the answer is not 15,200 (progressive), because that is the mistake a future reader will make.

---

## 11. External Integrations

### 11.1 Email — IMAP/SMTP

**Libraries:** `imapflow` (IMAP), `nodemailer` (SMTP), `mailparser` (MIME).

**Two topologies, supported simultaneously.** The difference is one field:

| Topology | Configuration | Who can read it |
|---|---|---|
| Shared team mailbox | `ownerId` null | Everyone with `canUseEmail` |
| Per-admin mailbox | `ownerId` set | Its owner, plus anyone with `canViewAllLeads` |

**Sync strategy.** Incremental by UID (`lastUid + 1 : *`), capped at 50 messages per run. Note the `if (message.uid <= mailbox.lastUid) continue` guard — the IMAP `n:*` range always returns the last message even when it is older than the bound.

**Record matching**, in order of precision:
1. Sender address vs `Client.email`, then `Lead.email`
2. Any phone number found in the body, normalised, vs `phoneNormalized` / `phoneAltNormalized`
3. Corporate domain vs `Company.email` / `Company.website` — **public domains excluded**

**Text cleaning.** `stripQuoted()` removes reply chains (English `On … wrote:`, Arabic «في … كتب …:», `---- Original Message ----`, `From:`, `>` lines) and trailing signatures. Signature markers are only honoured in the latter 60% of the message, so an opening «تحياتي» is treated as a greeting rather than a signature.

**Security.** Credentials are AES-256-GCM ciphertext. The stored password is never rendered, and is left blank on edit so it survives an update untouched.

### 11.2 AI — Anthropic Messages API

**Endpoint:** `https://api.anthropic.com/v1/messages`, version header `2023-06-01`. No SDK — a single `fetch` in `ai-client.ts`.

**Three purposes with hard output caps:**

| Purpose | Output cap |
|---|---|
| `email.analyze` | 1,200 tokens |
| `email.reply` | 1,500 tokens |
| `assistant` | 2,000 tokens |

**Controls:**
- `ANTHROPIC_API_KEY` absent → `aiEnabled()` false → AI buttons are not rendered at all
- `AI_MODEL` selects the model; `AI_DAILY_BUDGET_USD` (default 5) caps daily spend; `0` means unlimited
- `spentToday()` sums `AiRun.costUsd` since midnight; `withinBudget()` blocks at the cap
- 60-second timeout via `AbortController`
- Every call — success or failure — writes an `AiRun` row with tokens, cost, latency and error

**PII redaction.** `redact()` replaces phone numbers and IBANs before any text leaves the system. Their literal values add nothing to the analysis, and a number that leaves does not come back.

**Prompt hardening.** `SYSTEM_RULES` forbids inventing a price, a deadline or a discount (`[يُملأ من النظام]` is written instead), forbids promising anything on the office's behalf, and forbids explaining its reasoning.

**Response parsing.** `extractJson()` handles fenced blocks, preambles and nested braces with a balanced-brace scanner that respects string literals. `parseAnalysis()` validates every field against an allow-list and falls back to keyword-derived values. A model reply is not a contract.

### 11.3 Deployment

| Target | Mechanism |
|---|---|
| Vercel (current production) | `vercel-build`: provider rewrite → `prisma generate` → `db push` → `bootstrap` → `next build` |
| Docker | `Dockerfile` + `docker-entrypoint.sh`, `BUILD_STANDALONE=1` |
| CI | GitHub Actions with a PostgreSQL 16 service container |

### 11.4 Environment variables

| Variable | Required | Behaviour when absent |
|---|---|---|
| `DATABASE_URL` | Yes | Nothing works |
| `AUTH_SECRET` | Yes (≥16 chars) | Login throws |
| `ADMIN_PASSWORD` | Yes at bootstrap | No initial admin |
| `TEAM_INITIAL_PASSWORD` | Bootstrap | Team seeding skipped |
| `SECRET_KEY` | For email | Derived from `AUTH_SECRET`; mailbox saves refused if neither is usable |
| `ANTHROPIC_API_KEY` | For AI | AI features hidden, everything else works |
| `AI_MODEL` | No | Defaults to a balanced model |
| `AI_DAILY_BUDGET_USD` | No | Defaults to 5 |
| `CRON_SECRET` | For scheduling | `/api/cron` returns 503 |
| `NEXT_PUBLIC_COMPANY_NAME_AR` | No | Falls back to a generic label |
| `DATABASE_PROVIDER` | No | Inferred from the URL scheme |

---

## 12. Current Limitations

### 12.1 Architectural

| # | Limitation | Impact | Deliberate? |
|---|---|---|---|
| 1 | **No public API.** The HTTP surface serves this app's forms only | No mobile app, no partner integration, no BI tool can read the system | Yes — nobody has asked |
| 2 | **No background job queue.** Everything runs in the request or in `/api/cron` | A mailbox sync of 50 messages with AI analysis can approach Vercel's function timeout | Yes for now; see §13 |
| 3 | **No caching layer.** Every page is `force-dynamic` | Every render is fresh DB reads. Fine at current volume | Yes — correctness over latency |
| 4 | **Single tenant.** No `organizationId` anywhere | Cannot serve a second company | Yes — one company |
| 5 | **No optimistic UI.** Every write is a full navigation | Slightly heavier feel than a SPA | Yes — ADR-002/003 |
| 6 | **No real-time.** No websockets; notification counts refresh on navigation | Users see new notifications on next page load | Yes |

### 12.2 Data & correctness

| # | Limitation | Impact | Severity |
|---|---|---|---|
| 7 | **`Float` for money.** Prisma `Float` maps to `double precision` | Accumulation error across thousands of ledger lines. Mitigated by `round2()` at every boundary and by `checkBalance()` refusing unbalanced entries, but not eliminated | **High** |
| 8 | **`--accept-data-loss` in the production build.** Safety rests on the convention that all changes are additive | One non-additive schema edit merged carelessly silently drops a production column | **High** |
| 9 | **Multi-currency conversion uses settings-based FX rates**, not dated rates | Historical reports use today's rate for old transactions | Medium |
| 10 | **Text search is `contains`** on unindexed text | Fine for tens of thousands of rows; will degrade | Low now |
| 11 | **258 migrated rows still in the manual review queue** | Legacy data not fully reconciled | Low — each has a written reason |
| 12 | **2024 legacy data is incomplete** (90 rows vs 961 in 2025) | Year-over-year growth against 2024 is unreliable — and the UI says so | Known and surfaced |

### 12.3 Features not built

| # | Gap |
|---|---|
| 13 | Email attachments are recorded by filename only — not downloaded or stored |
| 14 | No file storage at all: source and delivered documents live outside the system (`folderUrl` is a link) |
| 15 | Accepting a proposal does not open a project (deliberate — see §3.7) |
| 16 | No customer portal, no supplier portal |
| 17 | Internal translators do not log in; production is tracked *about* them, not *by* them |
| 18 | No ETA (Egypt) or ZATCA (Saudi) e-invoicing integration — explicitly out of scope in spec §16 |
| 19 | No payroll |
| 20 | No two-factor authentication |
| 21 | No rate limiting on the login endpoint |

### 12.4 Operational

| # | Limitation |
|---|---|
| 22 | Backups rely entirely on Neon's automated snapshots; there is no application-level export |
| 23 | No structured logging or error aggregation — errors go to `console.error` |
| 24 | No APM; the spec's performance criteria (lead ≤15s, search ≤300ms) are asserted in e2e but not monitored in production |
| 25 | Bootstrap is idempotent, but there is no formal migration history — `db push` only |

---

## 13. Future Roadmap

Sequenced by dependency and by risk reduction. Items in Horizon 1 protect data already in the system; later horizons add capability.

### Horizon 1 — Correctness and safety (before any new features)

1. **Migrate money columns to `Decimal`.** Prisma supports `@db.Decimal(18,4)` on PostgreSQL. This is a schema change requiring a real migration and a full re-run of the accounting and costing suites. Highest value per unit of risk removed.
2. **Replace `db push --accept-data-loss` with `prisma migrate deploy`.** Generate a baseline migration from the current production schema, then require reviewed migration files. This closes limitation #8.
3. **Application-level backup export.** A scheduled job writing a compressed dump to object storage, independent of the hosting provider.
4. **Rate limiting and lockout on `/api/auth`.**
5. **Structured logging** with request IDs, and an error aggregator.

### Horizon 2 — Operational depth

6. **Dated FX rates.** An `FxRate` table keyed by (currency, date); ledger lines already carry an `fxRate` field to populate.
7. **File storage.** S3-compatible object storage for source and delivered documents, plus email attachments; virus scanning; retention policy.
8. **Background job queue.** Extract mailbox sync, AI analysis, notification generation and ledger draft generation from the request path.
9. **Full-text search.** PostgreSQL `tsvector` over clients, projects and email bodies.
10. **Two-factor authentication** for roles holding `canManageAccounting` or `canManageUsers`.

### Horizon 3 — Reach

11. **Public read API.** A versioned, token-authenticated REST surface reusing `can()` for authorisation, so a mobile app or BI tool can read without duplicating rules.
12. **Customer portal.** Order status, document download, invoice history.
13. **Translator workspace.** Let internal producers log in and update their own steps, replacing PM-mediated status updates.
14. **E-invoicing.** ETA and/or ZATCA — currently out of scope but inevitable as the Riyadh branch grows.

### Horizon 4 — Intelligence

15. **Quote-to-close prediction** from the now-substantial historical dataset.
16. **Freelancer recommendation** ranked by realised margin and on-time delivery rather than declared rate.
17. **Deadline risk scoring** on the production board.
18. **Automatic reply for a whitelisted class of messages** — only after measuring the accept rate of AI drafts over months, and only for message classes with no commercial commitment.

---

## 14. Architecture Review

An honest assessment. I built this system; treat the criticism below as the part of the handover most worth your attention.

### 14.1 What is genuinely strong

- **The pure/engine split.** This is the decision that keeps paying. 605 tests running in a second, and business rules that a domain expert could review as prose.
- **Permissions as data.** Adding a permission costs three lines and the UI absorbs it. The e2e suite proves a role created in the browser takes effect on the next request.
- **The doc-comments.** Nearly every non-obvious rule records *why* it exists. This is unusual and it is the reason a new architect can be productive here quickly.
- **Honest analytics.** Reporting "no data" instead of `CAC = 0`, and labelling growth against a known-incomplete year as unreliable, is a discipline most systems lack.
- **Deliberate degradation.** No AI key, no JavaScript, no cron secret — the system keeps working, just with less.
- **Tests that encode the dangerous case.** Asserting *both* 14,400 and not-15,200 for retroactive tiers is the kind of test that survives a future refactor.

### 14.2 Highest-severity risks

**R1 — `--accept-data-loss` on the production build path. (High)**
`vercel-build` runs `prisma db push --accept-data-loss`. The only thing preventing a dropped production column is the *convention* that schema edits are additive. Conventions do not survive a hurried Friday. **Fix: adopt `prisma migrate deploy` (roadmap item 2).**

**R2 — Money as `Float`. (High)**
Every monetary column is `Float` → `double precision`. `round2()` at boundaries and `checkBalance()` on entries limit the blast radius, but a general ledger on binary floating point will eventually produce a trial balance that is off by cents and an accountant who does not trust the system. **Fix: `Decimal` (roadmap item 1).**

**R3 — No login rate limiting. (Medium)**
`/api/auth` will accept unlimited attempts. bcrypt cost 10 makes brute force slow but not impossible, and there is no lockout or alerting.

**R4 — Cron work runs inline. (Medium)**
`/api/cron?job=all` synchronously syncs every mailbox and analyses every new message with the model. At 50 messages per mailbox with a 60-second AI timeout each, this can exceed a serverless function's limit and leave a partial sync. `lastUid` is only advanced after the loop, so a timeout re-fetches — safe, but wasteful and potentially never-completing under load.

**R5 — `AiRun` budget check has a race. (Low)**
`spentToday()` is read before the call and written after. Concurrent calls can collectively overshoot the daily cap. Bounded by the per-call token caps, so the overshoot is small, but it is not a hard ceiling.

### 14.3 Design smells worth watching

- **`Project` has 83 fields.** It is genuinely the central object and the fields *are* grouped by lifecycle stage, but it is at the limit. If a ninth group appears, extract a satellite table (`ProjectCosting` is the natural first split).
- **`mutations/sales.ts` (636) and `mutations/projects.ts` (629) are approaching the size that motivated the Phase 11 split.** Split them before they reach 800.
- **`chart-of-accounts.ts` is 691 lines of seed data in TypeScript.** It reads well and is type-checked, but it is data, not code. If the accountant ever needs to edit the seed, it should be a JSON or CSV asset.
- **`assistant.ts` `buildContext()` issues ~10 sequential queries per question.** Fine at one question at a time; it would be the first thing to feel slow if the assistant became popular.
- **Only 5 tables have soft-delete columns, but the "nothing is deleted" invariant is system-wide.** The invariant is currently upheld by discipline across 18 mutate ops rather than by a uniform mechanism. A shared `deletedAt` convention plus a Prisma middleware would make it structural.

### 14.4 Documentation drift found during this review

Two real inconsistencies, both cosmetic but both worth fixing:

1. **`README.md` is stale.** It still describes the pre-specification system: "الصفقات" (deals) instead of projects, three roles instead of seven-plus, and a feature table that predates operations, finance, commissions, freelancers, email and AI. Anyone onboarding from the README gets a wrong mental model.
2. **`src/app/layout.tsx` still sets `themeColor: '#1f44f5'`** — the pre-rebrand blue. The Fast Trans navy is `#242E5B`. One line.

Neither is a code defect; both are listed here rather than silently fixed because this task was scoped to documentation. Say the word and both take two minutes.

### 14.5 Scorecard

| Dimension | Score | Comment |
|---|---|---|
| Domain modelling | 9/10 | Faithful to a specification derived from real data audit |
| Separation of concerns | 9/10 | The pure/engine split is exemplary |
| Testability | 9/10 | 605 fast unit tests; the e2e suite tests leakage, not just happy paths |
| Security posture | 6/10 | Strong authorization, encrypted secrets, server-side filtering — but no rate limiting, no 2FA, no audit alerting |
| Data integrity | 6/10 | Excellent invariants and constraints, undermined by `Float` money and `--accept-data-loss` |
| Scalability | 6/10 | Ample for current volume; no queue, no cache, no read replicas |
| Observability | 3/10 | `console.error` and nothing else |
| Documentation | 9/10 | Specification, phase records, Arabic doc-comments, this handover; README stale |
| Deployability | 8/10 | Vercel + Docker + CI on real Postgres; migration story is the weak point |

---

## 15. AI Development Guide

This project has been developed end-to-end with an AI pair. This section is the operating manual for continuing that way.

### 15.1 Before you ask for anything

Have the assistant read, in this order: `CLAUDE.md` → `docs/SPEC.md` → `docs/HANDOVER.md` (this file) → the relevant `PHASE-*.md`. The specification is binding; this document is the map.

### 15.2 The rules to restate in every session

Paste these. They are the ones an AI most reliably violates:

1. Check the permission, never the role name.
2. Filter in the server. A hidden field is never sent.
3. Nothing is deleted — logical deletion plus audit; ledger corrections by reversal.
4. Do not invent business logic. If the spec is silent, **stop and ask**.
5. Arabic UI strings, English keys, Arabic doc-comments explaining *why*.
6. New columns nullable or defaulted.
7. New business rules land with their tests in the same commit.
8. Never write the model identifier into a commit, PR, comment or any repository artifact.

### 15.3 The workflow that has worked

```
1. Read the spec section  →  quote it back before proposing anything
2. Write the pure module  →  no DB, no network
3. Write its tests        →  including the dangerous case
4. Run the tests          →  fix what they catch
5. Write the engine       →  server-only, uses the pure module
6. Write the mutation     →  permission check → validate → orchestrate → audit
7. Wire the route         →  one case in the switch
8. Write the screens      →  display only
9. tsc --noEmit → build → e2e
10. Write PHASE-N.md      →  what was built, decided, deferred
11. Commit in Arabic      →  the reasoning, not the file list
```

Steps 2–4 before 5 is not ceremony. Every one of the three email bugs was caught at step 4, when fixing them cost minutes.

### 15.4 Prompts that produce good results here

**Good:** *"Read §8 of the spec. Implement the reviewer cost formula in `src/lib/costing.ts` as a pure function. Then write tests covering the three zero cases. Do not touch any other file."*

**Bad:** *"Improve the costing."* — invites invention, which invariant #5 forbids.

**Good:** *"`/production` shows an empty producer dropdown. Investigate, find the root cause, fix it, and add an e2e test that would have caught it."*

**Bad:** *"Fix the assign screen."* — no reproduction, no acceptance criterion.

### 15.5 Where an AI reliably goes wrong in this codebase

| Trap | The rule |
|---|---|
| Reaching for `next/link` or Server Actions | ADR-002/003 — both removed after measurement |
| Guessing at a business rule the spec did not state | Stop and ask |
| `user.roleName === '…'` | `can(user, '…')` |
| Filtering sensitive fields in the component | Filter in the query |
| Hard deletes | Logical deletion + audit |
| Naming a form field `entity`, `id` or `back` | Collides with the save router |
| Assuming `_sum`/`_count` shapes without checking the schema | Field names differ from the spec (`netTotal` maps to `amount`) |
| Confusing the two tier models | Commission = progressive; proposals = **retroactive** |
| Adding a non-nullable column | `db push` on production would fail or drop |
| Writing the model identifier into a commit | Chat replies only |

### 15.6 Verification loop

```bash
npx tsc --noEmit          # must be silent
npm run test:unit         # 605 tests
npm run build             # must succeed
npm run start &           # then, in another shell:
CHROMIUM_PATH=... npm run test:e2e   # 168 tests
```

Never commit with any of these failing. If a test fails and the code is right, the test was testing a fixture rather than a rule — fix the test to assert the rule.

### 15.7 The commit convention

Arabic. Title states what changed at the business level; body explains **why**, with the specific decisions and any bugs the tests caught. Look at `4d11782` for the shape. This log is a design record, not a changelog.

---

## 16. Development History

### 16.1 Two eras

**Era 1 — the generic CRM (commits `499f6eb` … `a415744`).** A Zoho-style sales CRM: leads, companies, contacts, **deals**, quotes, tasks, three roles. This is the origin of the `@map("Deal")` directives and of the stale README.

**Era 2 — the Fast Trans specification (commits `2cd7e8e` … `4d11782`).** The business owner produced a 713-line specification derived from auditing the company's real operating data. Per its §0, the work began with a gap analysis (`GAP-ANALYSIS.md`) and a field mapping (`FIELD-MAPPING.md`), then proceeded phase by phase.

### 16.2 The eleven phases

| Phase | Commit | Delivered |
|---|---|---|
| 1 | `35df147` | Permissions as data, branches, management hierarchy, audit log |
| 2 | `bc4eb70` | Clients, leads, phone normalisation and lookup |
| 3 | `e3cccb7` | Project state machine, revenue recognition |
| 4 | `1f1cf46` | Assignment, cost/margin formulas, revenue attribution |
| 5 | `c86a20e` | Pricing, discounts, discount approval |
| 6 | `3836c0e` | Commission system: dynamic tiers, derived accrual, clawback |
| 7 | `8bdfdfd` | Freelancers: 1,067-name roster, instant selection engine |
| 8 | `569ada3` | Finance: double-entry ledger wired to sales and operations |
| 9 | `857222d` | Legacy migration of both spreadsheets + analytics |
| 10 | `7389f41` | Notifications — completing the specification's ten phases |
| 11 | `4d11782` | Modularity split, email, AI, proposals, brand identity |

### 16.3 Notable defects found and fixed

Kept here because each represents a class of mistake the codebase is prone to.

| Defect | Root cause | Guard now in place |
|---|---|---|
| Commission deducted twice on cancellation | `rebuildPeriod` left orphaned reversals | Reversals cleared before recompute |
| Notification flood — 46 cards for 2 events | Immediate events keyed per record | One card per person per event, updated in place |
| Assign screen unusable | Empty producer dropdown, no freelancer or PM field, and §6 rejected freelancer assignment | `anyOf` in the transition rule; performer labelled by work mode |
| Legacy dates could never be repaired | Future-date rejection ran *before* the March flip fix | Parser returns a `future` flag; the importer judges after the fix |
| Two same-day prices had no deterministic winner | Ordered by `effectiveFrom` only | Tiebreak on `createdAt desc` |
| Arabic reply chains entered AI analysis | Quote pattern expected `كتب:` immediately | Pattern allows a name between verb and colon |
| Arabic signatures survived stripping | `\b` in JavaScript is ASCII-only and does not match after an Arabic letter | `\b` removed from the signature patterns |
| Proposal saves broke | A domain field named `entity` collided with the save router's discriminator | Renamed `contractingEntity`; documented in §7.1 |
| Saves hung forever in development | SQLite single-writer lock blocked behind page reads | WAL + `busy_timeout` + `synchronous=NORMAL` |
| Writes silently never navigated | Server Actions | ADR-002 |
| One click in three did not navigate | `next/link` | ADR-003 |

### 16.4 A resolved security incident

During Phase 9 the production database password was exposed in a screenshot shared for debugging. The database holds 3,448 real client names and phone numbers. The credential has since been rotated. **Recorded here because a future reviewer will find it in the conversation history and should know it was handled.**

---

## 17. Suggestions for Enterprise-Level Improvements

Ordered by return on effort. Each names the concrete first step.

### 17.1 Data integrity — do these first

**S1. `Decimal` for money.** *(High impact · Medium effort)*
Change every monetary column to `@db.Decimal(18,4)`, introduce a `Money` type at the boundaries, and re-run the accounting and costing suites. Nothing else on this list matters if the accountant stops trusting the trial balance.

**S2. Real migrations.** *(High · Medium)*
`prisma migrate diff` a baseline from the current production schema, commit it, switch `vercel-build` to `prisma migrate deploy`, and add a CI step that fails a PR whose schema change has no migration file. Removes the single largest deployment risk.

**S3. Structural soft delete.** *(Medium · Medium)*
A uniform `deletedAt` on every business table plus a Prisma extension that excludes deleted rows by default. Converts the "nothing is deleted" invariant from discipline into mechanism.

### 17.2 Operational maturity

**S4. Observability.** *(High · Low)*
Structured JSON logging with a request ID, an error aggregator (Sentry or equivalent), and metrics on the spec's own performance criteria — lead creation, phone lookup, page render. Right now the system's performance guarantees are asserted in the test suite and unmeasured in production.

**S5. Background job queue.** *(High · Medium)*
Mailbox sync, AI analysis, notification generation and ledger draft generation belong off the request path. With Vercel, that means a queue and a worker; with Docker, a simple in-process scheduler suffices. Fixes R4 and unblocks anything long-running.

**S6. Backup independence.** *(High · Low)*
A nightly `pg_dump` to object storage in a different account, plus a quarterly **tested** restore. Provider snapshots are a single point of failure, and an untested backup is a hypothesis.

**S7. Authentication hardening.** *(Medium · Low)*
Rate limiting and progressive lockout on `/api/auth`; TOTP for `canManageAccounting` and `canManageUsers`; an audit alert on permission changes and on failed-login bursts.

### 17.3 Extensibility

**S8. A versioned read API.** *(High · Medium)*
`/api/v1/*`, token-authenticated, reusing `can()` so authorisation rules are not duplicated. Start read-only over projects, clients and financial summaries. This unlocks mobile, BI and partner integration without touching the core.

**S9. A domain-event bus.** *(Medium · Medium)*
Today, `moveProject()` directly calls `draftRevenueOnDelivery`, `rebuildPeriod`, `draftCollection`, `reverseProjectCommission` and `logActivity`. That is readable at five subscribers and unmaintainable at fifteen. Emitting `project.delivered` and letting finance, commissions and notifications subscribe would let a new domain hook in without editing the project module. **Do this before adding a sixth consumer, not after.**

**S10. Feature flags.** *(Medium · Low)*
A `FeatureFlag` table checked the way permissions are. Lets a phase ship dark and be enabled per branch — valuable given how much of this system was delivered directly to production.

### 17.4 Product

**S11. Translator workspace.** *(High · High)*
Producers updating their own steps would give real cycle-time data instead of PM-mediated estimates, and would make `producerPerformance()` measure reality.

**S12. Customer portal.** *(Medium · High)*
Status, downloads, invoice history. Removes a large share of the inbound email the system now classifies.

**S13. Document storage with retention.** *(High · Medium)*
Certified translations are legal documents. Keeping them outside the system in linked folders is a compliance gap as much as a convenience one.

### 17.5 Organisational

**S14. Make the specification executable.** *(High · Low)*
Every `§N` reference in a doc-comment could be a link, and every acceptance criterion in spec §17 could carry the test id that proves it. The specification is already the source of truth; making the link mechanical keeps it true.

**S15. An architecture decision log going forward.** *(Medium · Low)*
§9 of this document reconstructs sixteen decisions after the fact. Future decisions should be recorded when made, in `docs/adr/NNNN-title.md`, one file per decision.

**S16. Load testing against real volumes.** *(Medium · Low)*
The system holds ~3,100 projects. Seed 100,000 and run the analytics page. That single experiment will tell you whether caching and read replicas are a Horizon 2 concern or a Horizon 4 one — right now it is a guess.

---

## Appendix A — Orientation in thirty minutes

```bash
git clone <repo> && cd crm
npm install
cp .env.example .env          # set AUTH_SECRET to any long random string
npm run setup                 # migrate + bootstrap + seed
npm run dev                   # http://localhost:3000
```

Log in as `admin@fasttrans.local` / `ChangeMe123!`.

Then read, in this order:

1. `src/lib/permissions.ts` — the authorization model in one file
2. `src/lib/projects.ts` — the state machine and the alert guard
3. `src/lib/costing.ts` — the economics
4. `src/lib/mutations/projects.ts::moveProject` — how a transition actually executes
5. `tests/costing.mjs` — the formulas as executable specification

## Appendix B — Command reference

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run start` | Production server |
| `npm run bootstrap` | Seed/refresh roles, lists, settings, admin — **idempotent** |
| `npm run db:seed` | Demo data |
| `npm run db:studio` | Prisma Studio |
| `npm run test:unit` | All 605 unit tests |
| `npm run test:e2e` | 168 browser tests (server must be running) |
| `npm run notify` | Run notification generation manually |
| `npx tsc --noEmit` | Type check |

## Appendix C — Glossary

| Arabic | English | Meaning |
|---|---|---|
| ليد | Lead | A potential customer who has not yet ordered |
| عميل | Client | Someone who has ordered; the durable entity |
| مشروع | Project | One order. `Deal` in the physical schema |
| صفحة موزونة | Weighted page | The unit of effort: `pages × mode × line`, floored at `min_weighted_unit` |
| نمط التشغيل | Work mode | How the job is executed; determines the effort factor |
| خط الخدمة | Service line | Subject domain; determines the specialisation factor |
| المنفِّذ | Performer / producer | Whoever executes — internal, freelance, or external by name |
| المراجع | Reviewer | Second pair of eyes; zero-cost in three defined cases |
| نسبة | Commission | Seller entitlement, accrued on collection |
| قيد | Journal entry | A double-entry ledger transaction |
| مركز التكلفة | Cost centre | A ledger dimension |
| الصفقة | Deal | Legacy term for project — survives in the physical schema only |
