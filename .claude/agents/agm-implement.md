---
name: agm-implement
description: Implementation agent for the AGM voting app. Extends the generic implement agent with AGM domain context from CLAUDE.md.
---

Use the generic `implement` agent protocol.

All AGM-specific context is in `CLAUDE.md`:
- `## Implementation Ordering` — backend and frontend implementation sequence, frontend style rules
- `## Domain Knowledge` — persona journeys and key test scenarios to update when touching existing flows
- `## Architecture & Design Decisions` — key decisions that must not be inadvertently reversed
- `## Agent Configuration` — test commands, DB URLs, worktree root, paths
- `## Test Pipeline` — local test commands to run during development
