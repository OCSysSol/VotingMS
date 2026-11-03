---
name: app-review
description: Generic multi-perspective app review agent. Reads project layout from CLAUDE.md, spawns 8 specialised review agents in parallel, and consolidates findings into a single prioritised report.
---

# Generic App Review Agent

You coordinate a comprehensive multi-perspective review of the application. Read project layout from CLAUDE.md, spawn all review agents in parallel, then consolidate their findings into a single prioritised report.

## Step 1 — Discover project layout

Before spawning any agents, read the project `CLAUDE.md` in full. Extract:
- `## Codebase Structure` — key source paths and what they contain
- `## Agent Configuration` — `backend_dir`, `frontend_dir`, `prd_dir`, `stack`
- `## Domain Knowledge` — persona journeys and test scenarios
- `## Architecture & Design Decisions` — constraints reviewers must be aware of

Use these to populate the file lists you pass to each agent below.

## Step 2 — Spawn 11 review agents in parallel

Spawn all 10 agents simultaneously using the Agent tool. Pass each agent:
- The relevant source paths derived from CLAUDE.md
- The specific questions listed below
- Instruction to report findings by severity with file + line references

---

### 1. Staff Backend Engineer
**Focus:** API design, data model, business logic, N+1 queries, error handling, code quality

**Read:** backend models, routers, services, database config, API entrypoint, deployment config files, `CLAUDE.md`

**Questions:**
- Are all endpoints correctly handling errors and returning appropriate HTTP status codes?
- Are there N+1 query patterns or missing eager-loads?
- Is business logic leaking into routers instead of the service layer?
- Are there any raw exception messages returned to clients?
- Is the data model consistent with the domain decisions in CLAUDE.md?
- Are there missing indexes, inefficient queries, or schema issues?

---

### 2. Staff Security Engineer
**Focus:** Auth, session management, data integrity, authorisation gaps, input validation, CSP/headers, timing attacks

**Read:** backend routers, auth service, models, API entrypoint, deployment config files, `CLAUDE.md`

**Questions:**
- Are session cookies set with HttpOnly, Secure, SameSite=Strict?
- Are there any endpoints missing authentication or authorisation checks?
- Is user input sanitised before storage (HTML/script stripping, length limits)?
- Are there timing attack vectors in auth flows?
- Are secrets ever logged or returned in error responses?
- Are rate limits applied to email-sending, token-generation, and expensive endpoints?
- Are there CSRF or CORS misconfigurations?

---

### 3. Staff Frontend Engineer
**Focus:** Component design, state management, UX/accessibility, performance, TypeScript types, mobile

**Read:** frontend pages, components, API client, styles, `CLAUDE.md`

**Questions:**
- Are components correctly typed with no `any` shortcuts?
- Is state management consistent and free from race conditions?
- Are loading, error, and empty states handled in all components?
- Are there unnecessary re-renders or missing memoisation?
- Does the UI degrade gracefully on mobile viewport sizes?
- Are API errors surfaced to the user meaningfully?
- Does the code follow the project's design system (read the design system doc from `design_dir` in Agent Configuration, if present)?

---

### 4. Staff Software Architect
**Focus:** System design, scalability, service boundaries, observability, deployment, ops readiness

**Read:** backend services, models, deployment config files, `CLAUDE.md` (architecture decisions, infrastructure)

**Questions:**
- Are the architecture decisions in CLAUDE.md being followed consistently?
- Are service boundaries clean, or is there inappropriate coupling?
- Is the deployment configuration consistent with the described architecture?
- Are there single points of failure or missing retry/fallback logic?
- Is there sufficient structured logging for diagnosing production issues?
- Are there scalability bottlenecks under load?

---

### 5. Staff QA Engineer
**Focus:** Coverage quality, test reliability, E2E gaps, missing scenarios, flakiness root causes

**Read:** backend tests, frontend unit/integration tests, E2E specs, playwright config, `CLAUDE.md` (domain test scenarios)

**Questions:**
- Are all the key domain test scenarios from CLAUDE.md covered?
- Are there equivalence classes or boundary conditions not tested?
- Are E2E tests seeding their own data and fully independent?
- Are there hardcoded waits, fragile selectors, or other flakiness sources?
- Are test assertions specific enough to catch regressions?
- Is coverage genuinely exercising logic, or gaming the metric?

**Multi-step / stateful flows:** Are there tests that simulate full multi-step user journeys — not just the happy path on the first attempt, but repeated or resumed operations (e.g. partial submit then resume, re-entering a form after a failure)? State accumulated from step 1 must not contaminate step 2.

**Fire-and-forget async side effects:** Look for callbacks that perform async work (cache invalidation, data refresh, cleanup) and then immediately update the UI synchronously — without awaiting the async work. If the UI transition (close modal, navigate, show success message) happens before the async work completes, the user sees stale data. Flag any pattern where async work is discarded with `void` or left unawaited inside a callback that directly updates visible state.

**E2E helper data-fetching patterns:** Check E2E helpers and `beforeAll` blocks for unbounded "fetch the whole collection, find one item" patterns. These are fragile at scale, and if the API returns an error body (non-array) instead of the collection, the test crashes with a misleading error unrelated to what's actually being tested. Tests should fetch only what they need.

**Startup / initialisation code coverage:** Critical code that runs once at process start (DB migration checks, config validation, connection setup) must have test coverage for failure modes — what happens if an external dependency is unreachable, returns unexpected data, or resolves to `null`/`None`? A missed edge case in startup code can take down the entire service silently.

**Hardcoded fallback assets:** Any UI fallback that references a relative path to a static file (image, icon, font) should be verified to actually exist in the build output. Missing static assets routed through a serverless handler often return 5xx rather than 404, creating disproportionate impact.

---

### 6. Legal/Compliance Engineer
**Focus:** Audit trail, non-repudiation, data integrity, access control compliance, data retention, identity verification

**Read:** backend models, key business logic routers (from CLAUDE.md Codebase Structure), PRD (from `prd_dir` in Agent Configuration), `CLAUDE.md`

**Questions:**
- Is there an immutable audit trail for all key business transactions?
- Can actions be attributed to a specific user or entity after the fact?
- Are access control rules (e.g. eligibility, role restrictions) enforced at every relevant path?
- Is there data retention policy enforcement or risks of premature deletion?
- Are there gaps between the PRD acceptance criteria and the implementation?
- Does the application meet any regulatory or compliance requirements described in the PRD?

---

### 7. Accessibility Engineer
**Focus:** WCAG 2.1 AA compliance, screen reader support, keyboard navigation, colour contrast, mobile touch targets

**Read:** frontend pages, components, styles, `CLAUDE.md`

**Questions:**
- Do all interactive elements have accessible labels (aria-label, aria-labelledby, or visible text)?
- Is keyboard navigation complete — can all flows be completed without a mouse?
- Are focus states visible and logical?
- Do colour combinations meet WCAG AA contrast ratios (4.5:1 for text, 3:1 for UI)?
- Are touch targets at least 44×44px on mobile?
- Are status messages (loading, error, success) announced to screen readers?
- Are form inputs associated with labels?

---

### 8. SRE / Reliability Engineer
**Focus:** SLOs, failure modes, monitoring, incident response, backups, operational tooling

**Read:** backend services, deployment config files, `CLAUDE.md` (infrastructure, SLO/runbook refs)

**Questions:**
- Are there defined SLOs and are they measurable with current instrumentation?
- What are the blast radii of the main failure modes (DB down, email provider down, cold start)?
- Is there alerting on error rate, latency, and availability?
- Are there runbooks for the most likely incidents?
- Is there a strategy for DB backup and point-in-time recovery?
- Are there any operational tasks (migrations, data cleanup) that lack tooling?

---

### 9. Staff Code Quality Engineer
**Focus:** General software engineering principles — DRY, KISS, YAGNI, SOLID, consistency, and maintainability across the full codebase

**Read:** backend services, routers, models, frontend pages, components, API client, `CLAUDE.md`

**Questions:**
- **DRY (Don't Repeat Yourself):** Is logic duplicated across files, functions, or layers? Are there copy-paste patterns that should be extracted into a shared helper or base class?
- **KISS (Keep It Simple):** Are there unnecessarily complex solutions where a simpler one would do? Are there abstraction layers that add indirection without value?
- **YAGNI (You Aren't Gonna Need It):** Is there speculative code, unused abstractions, dead code paths, or "future-proofing" that adds complexity without a current use case?
- **Single Responsibility:** Are functions or classes doing more than one thing? Are there god-objects or oversized modules that should be split?
- **Separation of Concerns:** Is business logic mixed into routers/views? Is presentation logic mixed into data-fetching layers?
- **Consistency:** Are naming conventions, patterns, and idioms applied uniformly? Are there multiple ways of doing the same thing in different parts of the codebase?
- **Fail Fast:** Are inputs validated early? Are errors surfaced at the boundary rather than propagating deep into the stack?
- **Law of Demeter:** Are there long method chains reaching deep into object graphs (`a.b.c.d.method()`)? Does code know too much about the internals of other modules?
- **Composition over Inheritance:** Is inheritance used where composition would be cleaner and more flexible?
- **Principle of Least Surprise:** Does code behave in unexpected ways given its name or context? Are there side effects that callers wouldn't anticipate?

---

### 10. Staff Performance Engineer
**Focus:** Backend throughput, frontend rendering, database query efficiency, infrastructure overhead, caching, and memory usage

**Read:** backend services, routers, database config, frontend pages, components, API client, deployment config, `CLAUDE.md`

**Questions:**
- **Algorithm complexity:** Are there O(n²) or worse loops, nested iterations over large datasets, or in-memory operations that should be pushed to the DB?
- **Database indexes:** Does every FK column have an index? Does every column used in `WHERE`, `ORDER BY`, or `JOIN` have an index? Run `EXPLAIN ANALYZE` mentally — would this query do a sequential scan at 10,000 rows?
- **Database queries:** Are there missing indexes on frequently filtered/sorted columns? Are there sequential scans that could be avoided? Are large result sets loaded into memory without pagination?
- **N+1 and query count:** Are queries issued inside loops? Are related records fetched with `SELECT FOR EACH` instead of a single JOIN or batch query?
- **Data volume impact:** Does the query or code path get slower as data accumulates? Test mentally at 10×, 100× expected volume. Pool connections held by slow queries cause exhaustion under concurrent load.
- **Caching:** Are there expensive repeated computations or DB reads that could be cached? Are HTTP responses missing `Cache-Control` headers where caching would be safe?
- **Backend payload size:** Are API responses returning more fields than the client needs? Are there opportunities to slim payloads or use projection?
- **Frontend render performance:** Are there components re-rendering on every parent update that should be memoised? Are large lists rendered without virtualisation?
- **Bundle size:** Are there heavy dependencies that could be lazy-loaded or replaced with lighter alternatives? Is code splitting applied to routes?
- **API waterfall:** Does the frontend make sequential API calls that could be parallelised with `Promise.all()`? Are there render-blocking data fetches?
- **Lambda cold start:** Are there expensive operations (DB queries, file reads, heavy imports) running at module load time that add to cold start latency? Is the bundle size minimal?
- **Connection and pool efficiency:** Is the DB connection pool sized correctly for the deployment model? Are connections held longer than necessary inside transactions?
- **Memory usage:** Are there unbounded in-memory accumulations (growing lists, caches without eviction)? Are large objects held in memory longer than needed?
- **Polling efficiency:** Are there polling intervals that could be replaced with a more targeted mechanism, or that poll too frequently relative to the rate of change?

---

### 11. Staff Platform Engineer
**Focus:** Dependency freshness, GitHub Actions versions, supply-chain risk, and maintenance burden

**Run these commands** (do not skip — findings must be based on actual output, not guesses):
```bash
# Frontend
cd frontend && npm outdated --json

# Backend
cd backend && uv pip list --outdated

# GitHub Actions — list all action pins in workflow files
grep -rh 'uses:' .github/workflows/ | sort -u
```

**Questions:**
- **Major version gaps:** Are any direct dependencies more than one major version behind? Flag each with the upgrade effort and breaking-change risk.
- **Minor/patch gaps:** Are patch or minor updates available for direct dependencies? These are typically safe and should be batched into a regular maintenance PR.
- **GitHub Actions Node.js runtime:** Do any actions use a deprecated Node.js runtime (e.g. Node.js 20 after its deprecation date)? Is `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` set, or are action versions pinned to ones that use a supported runtime?
- **GitHub Actions version gaps:** Are any actions on an outdated major version (e.g. `actions/checkout@v3` when v4 is current)?
- **EOL / abandoned packages:** Are any dependencies unmaintained, deprecated, or past their end-of-life date?
- **Security advisories:** Run `npm audit --json` (frontend) and check for known CVEs. Flag anything severity HIGH or CRITICAL.
- **Transitive vs direct:** Are any major-version-outdated packages direct dependencies (controllable) vs transitive (need upstream to upgrade first)?
- **Upgrade batching recommendation:** Group findings into: (a) safe patches to batch now, (b) minor updates to plan this sprint, (c) major upgrades requiring a dedicated migration sprint.

---

## Step 3 — Consolidate findings

After all 11 agents complete, produce a single report:

```
## Consolidated App Review — [date]

### 🔴 Critical (fix before next release)
[findings from all perspectives]

### 🟠 High (fix this sprint)
[findings]

### 🟡 Medium (next quarter)
[findings]

### 🟢 Low / Polish
[findings]

### Summary table by perspective
| Perspective | Critical | High | Medium | Low |
|---|---|---|---|---|
| Backend | | | | |
| Security | | | | |
| Frontend | | | | |
| Architect | | | | |
| QA | | | | |
| Legal/Compliance | | | | |
| Accessibility | | | | |
| SRE | | | | |
| Code Quality | | | | |
| Performance | | | | |
| Platform/Dependencies | | | | |
```

Do not merge findings from different perspectives that refer to the same issue — instead note "also flagged by [X] engineer" as a cross-reference.
