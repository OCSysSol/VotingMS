---
name: orchestrate-feature-dev
description: "Orchestrate feature development. Use when starting a new feature, bug fix, or task. Coordinates design → implement → test → cleanup agents across one or more branches. Invoked as /orchestrate-feature-dev."
user-invocable: true
---

# Feature Dev Orchestrator

You are orchestrating feature development. You coordinate sub-agents using the `Agent` tool. All code changes, file reads, test runs, git operations, and CI monitoring must be delegated to sub-agents — never done inline in this session.

**Sub-agent types:** `app-design`, `app-implement`, `app-cleanup`, `app-test`

- `app-design` — updates PRD and produces technical design doc
- `app-implement` — writes code, runs local tests, pushes, monitors CI and E2E
- `app-test` — post-merge monitoring only (Stages 4–5)
- `app-cleanup` — removes worktree, deletes branches, DB branch, deployment-scoped env vars, test data

All project-specific context (commands, paths, secrets, infrastructure IDs) is in `CLAUDE.md`. Pass the worktree path and task description to each agent — they read everything else from `CLAUDE.md` themselves.

**Infrastructure values** (DB provider project ID, deployment platform project ID, worktree root, preview URL pattern, branch names) are in CLAUDE.md `## Agent Configuration`. Pass that table to every sub-agent so they can read the values themselves — do not hardcode them in prompts.

---

## Push slot queue

Only one agent may push to a remote branch at a time (prevents concurrent deployments from interfering with running E2E tests).

Rules:
- **While any agent holds the push slot (from `git push` through E2E completion), NO other agent may push to any branch — not even empty redeploy commits, not even hotfixes. The slot is strictly exclusive. Only one branch may be in the push→E2E phase at any time.**
- Grant FIFO; reprioritise by urgency/risk if needed
- **Branch push slot**: held from `git push` until E2E run completes (pass or fail)
- **PR merge slot**: held from merge until post-merge deployment completes
- An agent with fixes re-joins the BACK of the queue
- If only one agent is active, grant immediately

---

## Workflow for a single feature

### Step 0: Assess the task

**ALL code changes — features, bug fixes, hotfixes, CI fixes, coverage fixes — must go through this workflow. Never edit files directly in the main repo or use general-purpose agents for implementation. Always use a worktree + `app-implement` agent, no exceptions.**

Determine:
- Is a design phase needed? (skip for trivial fixes or if implementing an existing complete design doc)
- Does the task require schema migrations? (flag for testing agent — DB branch needed)
- Can the task be split into parallel vertical slices?
- Is this a **styling-only change**? (CSS class changes, layout tweaks, colour/spacing adjustments with no logic change) — if yes, skip E2E entirely. Run unit + integration tests only, then push and merge directly without spawning the testing agent.

### Step a: Create branch and worktree — ALWAYS FIRST

**This step is mandatory before any design, code, or test work begins.**

Read `worktree_root`, `testing_branch`, and `production_branch` from CLAUDE.md `## Agent Configuration`. Spawn a sub-agent to create a worktree from the correct base branch. PRs always target `testing_branch` (user testing/staging). Only target `production_branch` with explicit user approval. When in doubt, use `testing_branch`.

```bash
cd <main-repo-path>   # read from CLAUDE.md ## Project Infrastructure — "Main repo path"
git fetch origin
git worktree add <worktree_root>/<slug> -b <branch-name> <base-branch>
# Example (feature from production_branch):
git worktree add <worktree_root>/my-feature -b feat/my-feature <production_branch>
# Example (fix from testing_branch):
git worktree add <worktree_root>/my-fix -b fix/my-fix <testing_branch>
```

Worktree lives at: `<worktree_root>/<slug>` (read `worktree_root` from Agent Configuration).

**All subsequent agents — design, implement, test — must work exclusively inside this worktree.** The main repo root may be on a completely different branch. Reading files from the wrong location produces an incorrect design and broken code.

### Step b: Spawn the design agent

Use `subagent_type: "app-design"`. Provide:
- The task description
- The worktree path
- The PRD file path **inside the worktree** (if implementing an existing PRD)
- Explicit instruction: **read all source files from the worktree path, not the main repo root**

Wait for the design agent to report "Design complete" before proceeding.

### Step c: Spawn the implementation agent

Use `subagent_type: "app-implement"`. Provide:
- The worktree path
- The design doc path
- The PRD path
- Any context from the design agent's report

Wait for the implementation agent to report "Ready for push slot".

### Step d: Grant the push slot

Check if any other agent holds the push slot. If free, grant it. Otherwise, queue this branch.

### Step e: Spawn the push/monitor/merge agent

Use `subagent_type: "app-test"`. Provide:
- The worktree path
- The branch name
- PR title and body
- Whether schema migrations are involved (DB branch needed)
- Whether post-merge E2E is required (only when all slices for a feature are merged)

The agent will:
1. Set up deployment env vars and DB branch (if migrations)
2. Push, create PR, monitor Branch CI and Branch E2E
3. Release the push slot
4. If CI/E2E passed: merge the PR, monitor post-merge CI (and post-merge E2E if requested)
5. Report "Ready for cleanup" with merge SHA and post-merge results

**If branch CI or E2E fail:** the test agent reports failures and stops. Resume the implementation agent with the failure details, fix and re-commit, then re-spawn the test agent (branch re-joins BACK of push slot queue).

**E2E merge gate — no exceptions:** A PR may only be merged after a run where every test either passed or was explicitly skipped. A test that failed on all retries is a failure — even if the root cause appears to be infrastructure flakiness (Neon cold-start 500s, rate limits, etc.). The correct response to persistent flakiness is to re-run the full E2E, not to override and merge. Never instruct a test agent to "ignore" or "skip counting" specific failures when deciding whether to merge. If a run has any test that exhausted all retries and still failed, the agent must stop, report verbatim, and wait for orchestrator direction.

### Step f: After the test agent reports "Ready for cleanup"

The test agent has already merged the PR and confirmed post-merge CI and post-merge E2E are both green. No separate merge step needed.

**If the test agent reports "Cleanup blocked":** the post-merge CI or E2E failed. Resume the implementation agent with the failure details, fix and re-commit, then re-spawn the test agent to re-monitor post-merge results. Cleanup only starts after a clean "Ready for cleanup" signal — never before.

### Step g: Spawn the cleanup agent

Spawn `subagent_type: "app-cleanup"` as soon as the test agent reports "Ready for cleanup". Provide:
- Branch name
- Worktree path
- DB branch name/ID as reported by the test agent in its Step 1 output (or "none" if no migrations)
- Note that deployment-scoped env vars are always set and must always be cleaned up

**Also instruct the cleanup agent to delete any Neon DB branch whose name matches `<testing_branch>/<branch-name>` or `preview/<branch-name>` convention**, even if the test agent didn't create it explicitly. The cleanup agent must look up the branch by naming convention and delete it if found.

Do NOT spawn cleanup until the test agent has explicitly reported "Ready for cleanup" — this guarantees the merge has completed successfully before the worktree and branches are removed.

### Step h: Full testing branch E2E (multi-branch only)

After ALL branches for a PRD are merged to `testing_branch`, spawn the testing agent to run the full E2E suite against the preview URL (derive from `preview_url_pattern` in Agent Configuration, using `testing_branch` as the branch name).

After the testing branch E2E run, spawn the cleanup agent in test-data-only mode to clean up test data entities.

---

## Workflow for parallel branches (backend + frontend split)

When a feature can be split:
1. **Agent 1** — backend branch (`feat/X-backend`): `app-design` → `app-implement` → signal ready
2. **Agent 2** — frontend branch (`feat/X-frontend`): `app-design` (MSW mocks) → `app-implement` → signal ready
3. **Agent 3** — merge/test branch (`feat/X`): created after both signal ready; merges both branches, runs full local tests, signals ready for push slot
4. Run `app-test` agent on `feat/X`; run `app-cleanup` for all three branches after merge

---

## Reporting to the user

Keep the user informed of:
- Which agents are running and what they're doing
- Push slot status (who holds it, queue length)
- E2E results (pass/fail counts)
- When a PR is ready to merge
- Any failures that need attention

**Merges to `testing_branch`**: autonomous (no user approval needed) once E2E passes.
**Merges to `production_branch`**: always require explicit user approval before proceeding.
