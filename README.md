# Chief of Staff — dub Product Intelligence

An AI-powered operating system for the dub product team. Synthesizes Mixpanel analytics, Linear engineering data, calendar context, and strategic goals into a single daily command center.

Built on Claude Code with MCP integrations. Run skills like `/daily-plan` or `/dub-daily` to orchestrate data across all connected systems.

---

## How It Works

```
┌──────────────────────────────────────────────────┐
│          Chief of Staff (Claude Code CLI)         │
│                                                   │
│  /daily-plan  /dub-daily  /week-plan  /review     │
│                                                   │
│  ┌──────────┐ ┌────────┐ ┌──────────┐ ┌───────┐  │
│  │ Mixpanel │ │ Linear │ │ Calendar │ │ Work  │  │
│  │   MCP    │ │  MCP   │ │   MCP    │ │  MCP  │  │
│  └────┬─────┘ └───┬────┘ └────┬─────┘ └───┬───┘  │
│       └─────┬─────┴─────┬─────┘            │      │
│             ▼           ▼                  ▼      │
│       ┌───────────────────────────────────────┐   │
│       │  /dub-daily synthesizes all sources   │   │
│       │  → maps projects to 3 pillars         │   │
│       │  → writes 1 snapshot row per day      │   │
│       └──────────────┬────────────────────────┘   │
└──────────────────────┼────────────────────────────┘
                       ▼
              ┌────────────────┐
              │   Supabase     │  ← shared backend
              │  cos_daily_    │
              │  snapshot +    │
              │  KPIs, CX,     │
              │  experiments   │
              └────────┬───────┘
                       ▼
              ┌────────────────┐
              │ dub_analysis_  │  ← dashboard
              │ tool (GitHub   │    (reads Supabase,
              │  Pages)        │     renders all tabs)
              └────────────────┘
```

**Chief of Staff** is the orchestration layer — it connects to Mixpanel, Linear, Calendar, and Work via MCP servers, gathers data, and synthesizes it.

**Supabase** is the shared backend — snapshots and analysis results are written here. Edge Functions sync raw platform data (Mixpanel events, AppsFlyer metrics, support tickets).

**Dashboard** is the static frontend (GitHub Pages) — each tab queries its own Supabase tables. The Executive Summary tab reads the daily snapshot from Chief of Staff.

---

## Getting Started

### Prerequisites

- [Claude Code](https://claude.ai/download) with Pro or Max subscription
- [Node.js 18+](https://nodejs.org/) (LTS)
- [Python 3.10+](https://www.python.org/downloads/)
- Git

### Setup

```bash
git clone https://github.com/Echofi-co/chief-of-staff.git
cd chief-of-staff
./install.sh
```

Then open a Claude Code session in the repo and run `/setup`. Answer the onboarding questions (name, role, focus areas). Takes ~5 minutes.

The onboarding configures your local `System/user-profile.yaml`, `System/pillars.yaml`, and `.mcp.json` — these are gitignored and never pushed.

### MCP Server Access

After onboarding, you'll need API access configured in your local `.mcp.json` for external integrations:

| Integration | Type | Access |
|-------------|------|--------|
| Linear | Remote MCP | OAuth (auto-configured) |
| Mixpanel | Remote MCP | OAuth (auto-configured) |
| Supabase | npm package | Requires `SUPABASE_ACCESS_TOKEN` |

Built-in MCPs (Calendar, Work, Career, etc.) work immediately after `./install.sh`.

---

## Strategic Pillars

All data is organized around dub's three strategic pillars:

| Pillar | What It Covers |
|--------|---------------|
| **Premium Creator Revenue** | Creator earnings, Premium subscription, PDP, discovery |
| **First Copy Conversion** | Activation experiments, onboarding, copy trading optimization |
| **Maximize LTV:CAC** | Subscription lifecycle, Braze, AppsFlyer attribution, deposit/link bank funnels |

Linear projects, Mixpanel funnels, tasks, and goals all map to these pillars automatically.

---

## Key Capabilities

### Executive Summary Dashboard (`/dub-daily`)

Generates a daily snapshot and publishes to the [Executive Summary dashboard](https://effective-dollop-kzkpnp1.pages.github.io/#executive). Runs automatically at the end of `/daily-plan` or standalone.

**Data gathered (in parallel):**
- **Mixpanel** — Funnel conversion rates (copy, deposit, link bank, subscription) with WoW trends
- **Linear** — Engineering velocity (completed/created/blocked), QA pipeline, action items for Zack/Steven/Daniel, upcoming priorities across all teams (dub 3.0, Pod 0, Pod 1)
- **Calendar** — Day shape (stacked/moderate/open), meeting count, free blocks
- **Work MCP** — Week progress, quarterly goals, task summary (P0/P1/overdue), commitments due
- **Supabase** — CX analysis insights, experiment analysis insights

**Output:** One row upserted to `cos_daily_snapshot` per day. Dashboard reads it and renders conditionally — missing sections just don't show.

### Daily Planning (`/daily-plan`)

Context-aware daily plan that combines calendar, tasks, priorities, and meeting intelligence. Includes:
- Calendar shape analysis with scheduling suggestions
- Task priorities aligned to pillars and quarterly goals
- Meeting prep with attendee context
- Commitment tracking (promises made, follow-ups due)
- Automatic dashboard sync via `/dub-daily`

### Weekly & Quarterly Planning

| Skill | What It Does |
|-------|-------------|
| `/week-plan` | Set top 3 weekly priorities based on goals, calendar, and task effort |
| `/week-review` | Review accomplishments, detect patterns, track goal progress |
| `/quarter-plan` | Set 3-5 strategic quarterly goals aligned to pillars |
| `/quarter-review` | Review quarter completion and capture learnings |

### Engineering Visibility (Linear)

Linear integration covers the full dub engineering org:

- **Teams:** dub 3.0 (parent) + dub Pod 0 + dub Pod 1
- **Velocity:** Issues completed/created/blocked in last 7 days
- **QA Pipeline:** Issues in Ready For QA Dev/In QA Dev/Ready for QA Prod/In QA Prod
- **Action Required:** Open issues assigned to Zack, Steven, or Daniel
- **Upcoming Priorities:** Roadmap-labeled issues not yet in the current cycle
- **Project Tracking:** All Zack-led projects mapped to strategic pillars

> **Note:** The Linear API does NOT cascade to sub-teams. All queries run against all 3 teams separately and merge results.

### Meeting Intelligence

| Skill | What It Does |
|-------|-------------|
| `/meeting-prep` | Pull attendee context, recent interactions, open items before any call |
| `/process-meetings` | Process Granola transcripts into structured notes with auto-synced action items |

### Task Management (Work MCP)

- Tasks get unique IDs (`^task-YYYYMMDD-XXX`) and sync across all files
- Priority limits (max 3 P0s) prevent overcommit
- Pillar alignment auto-tags tasks to strategic pillars
- Natural language completion: "I finished the pricing review" finds and marks the task done everywhere

### Career Development

| Skill | What It Does |
|-------|-------------|
| `/career-coach` | Weekly reports, monthly reflections, self-reviews, promotion assessments |
| `/resume-builder` | Guided resume building with career evidence integration |

---

## MCP Servers

### Built-in (included in repo)

| Server | Purpose |
|--------|---------|
| **Work MCP** | Task sync, priority management, pillar alignment, deduplication |
| **Calendar MCP** | Apple Calendar integration via AppleScript |
| **Granola MCP** | Meeting transcript access from local Granola cache |
| **Career MCP** | Evidence scanning, competency mapping, promotion readiness scoring |
| **Resume MCP** | Stateful resume building with metric validation |
| **Onboarding MCP** | New user setup with validation enforcement |
| **Improvements MCP** | System improvement idea capture and ranking |
| **Update Checker** | Version detection and safe updates |
| **Session Memory** | Cross-session context and decision recall |
| **Analytics** | Anonymous feature usage tracking (opt-in) |

### External (configured per-user in `.mcp.json`)

| Server | Purpose |
|--------|---------|
| **Linear** | Issue tracking, project status, engineering velocity |
| **Mixpanel** | Product analytics, funnel queries, segmentation |
| **Supabase** | Database access for dashboard data and analysis results |
| **Figma** | Design context and screenshots |

---

## Skills Reference

### dub-Specific

| Skill | Description |
|-------|-------------|
| `/dub-daily` | Generate daily dashboard snapshot and publish to Executive Summary |
| `/daily-plan` | Morning briefing with calendar, tasks, priorities + auto dashboard sync |

### Planning & Review

| Skill | Description |
|-------|-------------|
| `/week-plan` | Set weekly priorities |
| `/week-review` | Review week's progress |
| `/quarter-plan` | Set quarterly goals |
| `/quarter-review` | Review quarter completion |
| `/daily-review` | End of day review with learning capture |

### Meetings & People

| Skill | Description |
|-------|-------------|
| `/meeting-prep` | Prepare for meetings with attendee context |
| `/process-meetings` | Process Granola transcripts into structured notes |
| `/triage` | Route inbox items and extract scattered tasks |

### Career

| Skill | Description |
|-------|-------------|
| `/career-coach` | Career coaching with 4 modes |
| `/resume-builder` | Guided resume building |

### Projects & Products

| Skill | Description |
|-------|-------------|
| `/project-health` | Scan active projects for status and blockers |
| `/product-brief` | Generate PRD from guided questions |

### System

| Skill | Description |
|-------|-------------|
| `/health-check` | Diagnose and fix MCP server issues |
| `/dex-level-up` | Discover unused features based on usage patterns |
| `/enable-semantic-search` | Enable local AI-powered semantic search |
| `/xray` | Understand what just happened under the hood |

### Framework Skills (25 business strategy frameworks)

Invoke with `/skill-name` for structured analysis using proven frameworks:

`/lean-startup` `/jobs-to-be-done` `/crossing-the-chasm` `/blue-ocean-strategy` `/obviously-awesome` `/cro-methodology` `/hundred-million-offers` `/design-sprint` `/negotiation` `/made-to-stick` `/contagious` `/influence-psychology` `/hooked-ux` `/storybrand-messaging` `/one-page-marketing` `/predictable-revenue` `/scorecard-marketing` `/traction-eos` `/drive-motivation` `/refactoring-ui` `/ux-heuristics` `/top-design` `/ios-hig-design` `/web-typography` `/design-everyday-things`

---

## Repo Structure

```
chief-of-staff/
├── CLAUDE.md                    # Core system prompt
├── .claude/skills/              # All skill definitions
├── .claude/hooks/               # Automatic behaviors (session start, context injection)
├── .claude/reference/           # MCP docs, meeting intel reference
├── core/mcp/                    # Built-in MCP server source code
├── scripts/                     # Installation and utility scripts
├── 06-Resources/Dex_System/     # System documentation
└── System/                      # User config (gitignored)
    ├── user-profile.yaml        # Your profile (local only)
    ├── pillars.yaml             # Strategic pillars (local only)
    └── usage_log.md             # Feature usage tracking
```

User data directories (`00-Inbox/`, `01-Quarter_Goals/`, `02-Week_Priorities/`, `03-Tasks/`, `04-Analytics/`, `05-Areas/`, `07-Archives/`) are created during onboarding and gitignored.

---

## License

MIT
