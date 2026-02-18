---
name: dub-daily
description: Generate Chief of Staff daily dashboard snapshot — synthesizes platform metrics, engineering velocity, operational context, strategic pillars, Figma design context, and market data (Alpha Vantage) into the Executive Summary tab on the dub analytics dashboard.
---

## Purpose

Generate a daily snapshot of all Chief of Staff outputs and publish to the dub_analysis_tool's Executive Summary tab via Supabase. This is the "morning briefing" that turns the dashboard into your command center.

## Usage

- `/dub-daily` — Generate today's snapshot and publish to dashboard
- `/dub-daily refresh` — Re-generate (overwrite today's existing snapshot)

---

## Configuration

```yaml
# Supabase target
PROJECT_ID: rnpfeblxapdafrbmomix
TABLE: cos_daily_snapshot

# Mixpanel
MIXPANEL_PROJECT_ID: 2599235

# Linear
LINEAR_PRIMARY_TEAM: "dub 3.0"
LINEAR_TEAM_ID: "268053e9-b3a1-42d8-a01d-0870c5231346"

# Linear project discovery
# Query: list_projects with team "dub 3.0", then filter to projects where lead = Zack
# This dynamically picks up new projects without config changes
ZACK_USER_ID: "04c633dd-c65e-42f5-bb9f-58016fd4fc43"

# Pillar mapping — explicit overrides take priority, then keyword inference
# IMPORTANT: Override check order matters. More specific overrides (ltv_cac, first_copy_conversion)
# are checked BEFORE the broad "Premium" catch-all in premium_creator_revenue.
PILLAR_OVERRIDES:
  ltv_cac:
    - "Plus Subscription"
    - "Subscription Lifecycle Optimization"    # matches any year suffix
    - "Appsflyer integration / attribution"
    - "Braze"                                  # matches any project containing "Braze"
    - "Analytics"                              # matches analytics/measurement projects
    - "Segment"                                # matches Segment implementation
  first_copy_conversion:
    - "Activation Experimentation"
    - "Copy Trading Optimization"
    - "Onboarding"                             # matches any onboarding project
    - "PDP Redesign"                           # PDP drives first copy conversion
    - "Copy Once"                              # matches Copy Once Functionality
    - "Rebalance"                              # portfolio rebalancing after copy
    - "Net Performance"                        # user portfolio performance display
    - "Advanced Metrics"                       # user-facing portfolio/trading metrics
  premium_creator_revenue:
    - "Premium"                                # broad catch-all — checked LAST to avoid stealing from ltv_cac

# Keyword inference (fallback when no override matches)
# Used when no PILLAR_OVERRIDES substring matches. Scores project name + description
# against each pillar's keyword list, assigns to highest-scoring pillar.
PILLAR_KEYWORDS:
  premium_creator_revenue: [premium, creator revenue, creator earnings, creator payout]
  first_copy_conversion: [copy, activation, onboarding, experiment, funnel, conversion, pdp, discovery, rebalance, portfolio, performance, metrics, trade]
  ltv_cac: [subscription, lifecycle, retention, churn, ltv, braze, attribution, appsflyer, deposit, bank, plaid, analytics, segment, tracking, revenue]

# Mixpanel Reports (known)
MIXPANEL_FUNNELS:
  link_bank: {id: "84800603", pillar: "ltv_cac"}
  deposit: {id: "84590385", pillar: "ltv_cac"}
  copy: {id: "85419313", pillar: "first_copy_conversion"}
  subscription: {id: "84782977", pillar: "premium_creator_revenue"}

# Mixpanel Reports (pending — configure after screenshots)
MIXPANEL_PENDING:
  - {id: "88253371", configured: false}
  - {id: "84911332", configured: false}
  - {id: "85024495", configured: false}
  - {id: "84230825", configured: false}
  - {id: "84230769", configured: false}
```

---

## Execution Flow

### Step 1: Gather Data (Parallel)

Run all data gathering in parallel. If any source fails, record as null and continue.

Track timing: `const startTime = Date.now();`

#### 1a. Work MCP Queries

Call these Work MCP tools:

- `get_week_progress()` → week_progress column
  - Returns: day_of_week, days_remaining, priorities with status, completion_rate_pct

- `get_quarterly_goals()` → quarter_goals column
  - Returns: goals with title, milestone_pct, status, pillar alignment

- `list_tasks(status="active")` → task_summary column
  - Count P0, P1, overdue tasks
  - Compute pillar_distribution from task pillar tags
  - List any tasks completed today

- `get_commitments_due(date_range="today")` → commitments column
  - Returns: due_today items, follow_ups_waiting items

- `get_pillar_summary()` → used in task_summary.pillar_distribution

#### 1b. Calendar MCP Queries

- `calendar_get_today()` → calendar_shape column
  - Extract: meeting_count, total meeting hours

- `analyze_calendar_capacity()` → calendar_shape column
  - Extract: day_type (stacked/moderate/open), free_blocks with start/end/minutes

Combine into single calendar_shape object.

#### 1c. Linear MCP Queries

Use the `mcp__linear__*` tools (load via ToolSearch first).

**IDs:**
- Team "dub 3.0": `268053e9-b3a1-42d8-a01d-0870c5231346`
- Sub-team "dub Pod 0": `01a9391b-bbf7-4594-87b0-8061508ef53d`
- Sub-team "dub Pod 1": `c6b967a1-0dc2-4aeb-9561-85bcfe7a7b04`
- Zack's user ID: `04c633dd-c65e-42f5-bb9f-58016fd4fc43`

**IMPORTANT:** The Linear API does NOT cascade queries to sub-teams. Querying "dub 3.0" only returns issues directly in that team, NOT issues in "dub Pod 0" or "dub Pod 1". For full coverage, query ALL 3 teams separately and merge results.

**Team-wide queries (all issues in "dub 3.0", regardless of project):**
- `list_issues` with team "dub 3.0", state_type "completed", updated in last 7 days → velocity.completed_7d
- `list_issues` with team "dub 3.0", created in last 7 days → velocity.created_7d
- `list_issues` with team "dub 3.0", state "Blocked" → blockers array
- `list_cycles` for team "dub 3.0", type "current" → cycle info

**Project-specific queries (dynamic, lead-based):**
- `list_projects` with team "dub 3.0" → returns all projects
- Filter to projects where `lead.id` matches ZACK_USER_ID
- Exclude projects with status "Completed" (only track active/in-progress/backlog)
- For each Zack-led project, assign a pillar:
  1. Check PILLAR_OVERRIDES first — match project name (substring match, case-insensitive)
  2. If no override, use PILLAR_KEYWORDS — score project name + description against keyword lists, assign to highest-scoring pillar
  3. If still no match, tag as "unassigned" (include in snapshot but don't attach to a pillar)
- Extract: name, status, pillar, url
- Store in `linear_snapshot.projects[]`

**Action card queries (stored in `linear_snapshot.action_cards`):**

All action cards query ALL teams ("dub 3.0", "dub Pod 0", "dub Pod 1") separately and merge results. This is required because the Linear API does NOT cascade to sub-teams.

1. **QA Required** — For EACH of the 3 teams, `list_issues` in each of these states:
   - "Ready For QA Dev", "In QA Dev", "Ready for QA Prod", "In QA Prod"
   - That's 12 queries total (3 teams x 4 states). Merge all results, deduplicate by identifier.
   - Extract: identifier, title, status, assignee name, url
   - Store as `action_cards.qa_required[]`

2. **Action Required** — For EACH of the 3 teams, query `list_issues` updated in last 7 days for EACH of these assignees:
   - Zack Babin: `04c633dd-c65e-42f5-bb9f-58016fd4fc43`
   - Steven Wang: `dda1a6c3-3e6d-46c3-b565-6bd742cb5abe`
   - Daniel Choi: `8db5b997-2f22-4de6-ab7c-f96b7dbec372`
   - Filter: exclude "Canceled" and "Done" statuses
   - Merge results, deduplicate by identifier
   - Extract: identifier, title, status, assignee name, reason (e.g. "assigned to you"), url
   - Store as `action_cards.attention_required[]`

3. **Upcoming Priorities** — For EACH of the 3 teams, `list_issues` with label "Roadmap" that are NOT in the current cycle
   - Filter: exclude issues in current cycles (from `list_cycles` — each team may have its own cycle)
   - Filter: exclude "Canceled" and "Done" statuses
   - Merge results, deduplicate by identifier
   - Extract: identifier, title, cycle name, priority level, url
   - Store as `action_cards.upcoming_priorities[]`

Compute:
- velocity.net_change = created_7d - completed_7d
- For each Zack-led project, map to pillar via PILLAR_OVERRIDES → PILLAR_KEYWORDS fallback
- Generate headline: "X completed, Y created, Z blockers this week"

#### 1d. Supabase Queries (Existing Analysis)

Read from already-synced tables to denormalize into snapshot:

```sql
SELECT analysis_date, conversation_count, top_issues, insights
FROM support_analysis_results ORDER BY created_at DESC LIMIT 1;

SELECT analysis_date, total_experiments, insights
FROM experiment_analysis_results ORDER BY analysis_date DESC LIMIT 1;
```

#### 1e. Alpha Vantage — Market Context (Optional)

If `alphavantage` MCP is available, fetch relevant market context:

- Stock data for key competitors (e.g., HOOD for Robinhood, IBKR for Interactive Brokers)
- Crypto prices relevant to copy-trading (BTC, ETH)
- Market sentiment via news API

Store in `market_context` column (JSONB). If unavailable, set to null.

#### 1f. Pillar Metrics — Mixpanel (PLACEHOLDER)

> **Note:** Mixpanel analysis is placeholder until report screenshots are provided.
> For now, set `pillar_metrics` to null or a stub structure.
> Once configured, this step will query `run_segmentation_query`, `run_funnels_query` etc.
> for each pillar's mapped reports.

When ready to implement:
- For each pillar, query its mapped Mixpanel reports (last 14 days)
- Compare current 7d vs prior 7d for WoW change
- Compute status: healthy (positive trend), warning (flat/slight decline), critical (>10% decline)

#### 1g. Project Health

Scan vault `04-Projects/` for active project folders. For each:
- Check for recent activity (files modified in last 7 days)
- Check for blockers mentioned in project notes
- Classify as green/yellow/red

OR use the project data from Linear (Step 1c) as the primary source.

#### 1h. Session Learnings

Read `System/Session_Learnings/` for yesterday's date file:
- If file exists, extract learning items (title, suggested_fix, status)
- Count total learnings

---

### Step 2: Synthesize TL;DR

Structure the summary around the 3 strategic pillars. One line per pillar with the most relevant data point and status. Use available data sources — as more integrations come online (Mixpanel metrics, Linear velocity), incorporate them.

Format — one `<strong>` pillar name per line, followed by a concise status:

```
<strong>Premium Creator Revenue</strong> — [key metric or project status]
<strong>First Copy Conversion</strong> — [key metric or project status]
<strong>Maximize LTV:CAC</strong> — [key metric or project status]
```

**Data to include per pillar (use what's available):**
- KPI from summary_stats (subscription rate, copy rate, deposit/link bank rates) with WoW change if comparison data exists
- Linear project status mapped to pillar (from LINEAR_PROJECTS config)
- Blockers or red flags affecting that pillar
- Mixpanel funnel trends (when configured)

**If a data source isn't available yet**, use whatever is — even a qualitative status from tasks or goals is better than nothing. Never show "N/A" — omit the pillar line entirely if there's truly nothing to say.

Example (with full integrations):
> **Premium Creator Revenue** — Sub rate 2.1%, up 0.3pp WoW. Plus Subscription project on track.
> **First Copy Conversion** — Copy rate 8.4%, flat WoW. 2 blockers in activation experimentation.
> **Maximize LTV:CAC** — Deposit rate 12.1%, down 0.5pp. Link bank funnel needs attention.

---

### Step 3: Write to Supabase

Construct the full snapshot and upsert via Supabase MCP `execute_sql`:

```sql
INSERT INTO cos_daily_snapshot (
  snapshot_date, daily_tldr, pillar_metrics, linear_snapshot,
  calendar_shape, week_progress, quarter_goals, task_summary,
  commitments, project_health, session_learnings,
  data_sources_used, generation_duration_ms
) VALUES (
  'YYYY-MM-DD',
  $tldr,
  $pillar_metrics::jsonb,
  $linear_snapshot::jsonb,
  $calendar_shape::jsonb,
  $week_progress::jsonb,
  $quarter_goals::jsonb,
  $task_summary::jsonb,
  $commitments::jsonb,
  $project_health::jsonb,
  $session_learnings::jsonb,
  ARRAY['work_mcp', 'calendar', 'linear', 'supabase', 'alphavantage', 'figma'],
  $duration_ms
) ON CONFLICT (snapshot_date) DO UPDATE SET
  daily_tldr = EXCLUDED.daily_tldr,
  pillar_metrics = EXCLUDED.pillar_metrics,
  linear_snapshot = EXCLUDED.linear_snapshot,
  calendar_shape = EXCLUDED.calendar_shape,
  week_progress = EXCLUDED.week_progress,
  quarter_goals = EXCLUDED.quarter_goals,
  task_summary = EXCLUDED.task_summary,
  commitments = EXCLUDED.commitments,
  project_health = EXCLUDED.project_health,
  session_learnings = EXCLUDED.session_learnings,
  data_sources_used = EXCLUDED.data_sources_used,
  generation_duration_ms = EXCLUDED.generation_duration_ms,
  created_at = now();
```

**Important:** Properly escape all JSONB values. Use single-quoted JSON strings with internal quotes escaped.

---

### Step 4: Confirm to User

Display a compact summary:

```
Dashboard snapshot published for YYYY-MM-DD.

Week: Day X of 5 — Y of Z priorities on track
Calendar: [day_type] — N meetings, Xh free
Engineering: A completed / B created / C blockers
Tasks: P0: X | P1: Y | Overdue: Z
Pillars: [placeholder — run /dub-daily after Mixpanel config]

View at: [dub analytics dashboard URL]
```

---

## Graceful Degradation

If any MCP is unavailable:
- Set that JSONB column to NULL
- Record which sources succeeded in `data_sources_used`
- The frontend conditionally renders — missing sections just don't show
- Never fail the entire snapshot because one source is down

## Integration with /daily-plan

This skill runs automatically at the end of `/daily-plan` (Step 8). When triggered from `/daily-plan`:
- Runs silently — no confirmation output shown to user
- Daily plan appends a one-liner: *Dashboard synced — [view Executive Summary](...)*
- If sync fails, daily plan notes it but doesn't block

Can also be run standalone with `/dub-daily` to refresh the dashboard outside of the morning routine.

## JSONB Schema Reference

See the `cos_daily_snapshot` table definition in the plan file or DATABASE_SCHEMA.md for the expected shape of each JSONB column. The frontend (executive-summary.js) reads these shapes directly.
