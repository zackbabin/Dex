---
name: dub-daily
description: Generate Chief of Staff daily dashboard snapshot — synthesizes platform metrics, engineering status, and market data into the Executive Summary tab.
---

## Purpose

Generate a daily snapshot and publish to the dub_analysis_tool's Executive Summary tab via Supabase.

## Usage

- `/dub-daily` — Generate today's snapshot and publish to dashboard
- `/dub-daily refresh` — Re-generate (overwrite today's existing snapshot)

---

## Configuration

```yaml
# Supabase target
PROJECT_ID: rnpfeblxapdafrbmomix
TABLE: cos_daily_snapshot

# Linear
LINEAR_PRIMARY_TEAM: "dub 3.0"
LINEAR_TEAM_ID: "268053e9-b3a1-42d8-a01d-0870c5231346"

# Leadership team (used for Attention Required + Project filtering)
LEADERSHIP_IDS:
  zack: "04c633dd-c65e-42f5-bb9f-58016fd4fc43"
  steven: "dda1a6c3-3e6d-46c3-b565-6bd742cb5abe"
  daniel: "8db5b997-2f22-4de6-ab7c-f96b7dbec372"
  joy: "c8f62a70-3690-458e-bf35-c9bb3615dee2"

# Pillar mapping — explicit overrides take priority, then keyword inference
# IMPORTANT: Override check order matters. More specific overrides (ltv_cac, first_copy_conversion)
# are checked BEFORE the broad "Premium" catch-all in premium_creator_revenue.
PILLAR_OVERRIDES:
  ltv_cac:
    - "Plus Subscription"
    - "Subscription Lifecycle Optimization"
    - "Appsflyer integration / attribution"
    - "Braze"
    - "Analytics"
    - "Segment"
  first_copy_conversion:
    - "Activation Experimentation"
    - "Copy Trading Optimization"
    - "Onboarding"
    - "PDP Redesign"
    - "Copy Once"
    - "Rebalance"
    - "Net Performance"
    - "Advanced Metrics"
  premium_creator_revenue:
    - "Premium"                                # broad catch-all — checked LAST

PILLAR_KEYWORDS:
  premium_creator_revenue: [premium, creator revenue, creator earnings, creator payout]
  first_copy_conversion: [copy, activation, onboarding, experiment, funnel, conversion, pdp, discovery, rebalance, portfolio, performance, metrics, trade]
  ltv_cac: [subscription, lifecycle, retention, churn, ltv, braze, attribution, appsflyer, deposit, bank, plaid, analytics, segment, tracking, revenue]
```

---

## Execution Flow

### Step 1: Gather Data (Parallel)

Track timing: `const startTime = Date.now();`

**REQUIRED sources (retry once on failure):** Linear (1a), Supabase (1b), Alpha Vantage (1c).

#### 1a. Linear MCP Queries

Use `mcp__linear__*` tools (load via ToolSearch first).

**Key optimization:** Query with NO `team` parameter — this returns issues across ALL teams in the workspace (parent + all subteams). No need to discover or iterate subteams separately.

**Current cycles:** Call `list_cycles` for team "dub 3.0" type "current" to get active cycle IDs. Needed to filter Upcoming Priorities.

**Action card queries (all team-less, `limit: 50`):**

**1. QA Required** — 4 queries, one per state:
- `list_issues(state="Ready For QA Dev", limit=50)`
- `list_issues(state="In QA Dev", limit=50)`
- `list_issues(state="Ready for QA Prod", limit=50)`
- `list_issues(state="In QA Prod", limit=50)`
- Merge all results, deduplicate by identifier
- Store as `action_cards.qa_required[]`

**2. Attention Required** — Query each subteam:
- `list_issues(team="Pod 0", limit=50)`
- `list_issues(team="Pod 1", limit=50)`
- `list_issues(team="Crypto", limit=50)`
- `list_issues(team="Web", limit=50)`
- Filter ALL results: exclude "Blocked", "Canceled", "Done", "Deleted" statuses
- Merge all results, deduplicate by identifier
- Store as `action_cards.attention_required[]`

**3. Upcoming Priorities** — `list_issues(label="Roadmap", limit=250)`
- Filter: exclude issues where cycleId matches any current cycle ID
- Filter: exclude "Canceled", "Done", "Deleted" statuses
- Store as `action_cards.upcoming_priorities[]`

**Total: ~10 queries** (4 QA + 4 subteam + 1 roadmap), plus `list_cycles` and `list_projects`.

**Project queries (leadership-filtered):**
- `list_projects` with team "dub 3.0"
- Filter to projects where `lead.id` matches any leadership team member
- Exclude status "Completed"
- For each project, assign pillar via PILLAR_OVERRIDES → PILLAR_KEYWORDS fallback
- Extract: name, status, pillar, lead name, url
- Store in `linear_snapshot.projects[]`

**Field extraction — CRITICAL:**

Linear `list_issues` returns full descriptions which overflow context. After EVERY `list_issues` call, immediately extract minimal fields via python3:

```bash
python3 -c "
import json, sys
raw = json.loads(sys.stdin.read())
issues = raw.get('issues', raw) if isinstance(raw, dict) else raw
for i in (issues if isinstance(issues, list) else []):
    print(json.dumps({
        'identifier': i.get('identifier',''),
        'title': i.get('title','')[:100],
        'status': i.get('status',''),
        'url': i.get('url',''),
        'project': (i.get('project',{}) or {}).get('name','') if isinstance(i.get('project'), dict) else str(i.get('project','')),
        'assignee': (i.get('assignee',{}) or {}).get('name','') if isinstance(i.get('assignee'), dict) else str(i.get('assignee','')),
        'updated_at': i.get('updatedAt', i.get('updated_at','')),
        'cycle_number': (i.get('cycle',{}) or {}).get('number', None)
    }))
" <<< '$RAW_JSON'
```

If result overflows to a file, read the file in the python3 script instead of stdin.

**Fields stored per issue in snapshot JSONB:**
- All cards: `identifier`, `title` (max 100 chars), `status`, `url`, `cycle_number`, `updated_at`
- QA Required & Attention Required: + `assignee` (name)
- Upcoming Priorities: + `project` (name)
- Never store descriptions — they bloat JSONB

**Rules:**
- Never delegate Linear queries to sub-agents (Task tool) — they hallucinate when tokens overflow
- Never fabricate data — empty is always better than fabricated

#### 1b. Supabase Queries (Pillar Metrics)

Read from already-synced tables to build pillar metrics:

**Premium Creator Revenue:**
```sql
SELECT stats_data FROM summary_stats ORDER BY calculated_at DESC LIMIT 1;
-- Extract: subscription_rate

SELECT total_subscriptions, total_paywall_views, total_stripe_modal_views,
       paywall_views_delta_pct, copy_starts_delta_pct
FROM premium_creator_metrics ORDER BY created_at DESC LIMIT 20;

SELECT price_point, subscriber_count, total_revenue
FROM creator_subscriptions_by_price ORDER BY created_at DESC LIMIT 1;
```

**First Copy Conversion:**
```sql
SELECT stats_data FROM summary_stats ORDER BY calculated_at DESC LIMIT 1;
-- Extract: copy_rate

SELECT path_description, conversion_rate, user_count
FROM conversion_path_analysis ORDER BY created_at DESC LIMIT 10;

SELECT metric_name, mean_value, median_value
FROM event_sequence_metrics ORDER BY created_at DESC LIMIT 5;
```

**Maximize LTV:**
```sql
SELECT COALESCE(week_26_ltv, week_25_ltv, week_24_ltv, week_23_ltv, week_22_ltv,
       week_21_ltv, week_20_ltv, week_19_ltv, week_18_ltv, week_17_ltv,
       week_16_ltv, week_15_ltv, week_14_ltv, week_13_ltv, week_12_ltv,
       week_11_ltv, week_10_ltv, week_9_ltv, week_8_ltv, week_7_ltv,
       week_6_ltv, week_5_ltv, week_4_ltv, week_3_ltv, week_2_ltv, week_1_ltv) as avg_ltv
FROM ltv_cohort_analysis WHERE cohort_label = 'Avg Cohorts';

SELECT cohort_week, cohort_label, user_count, week_4_ltv
FROM ltv_cohort_analysis WHERE cohort_label != 'Avg Cohorts'
ORDER BY cohort_week DESC LIMIT 8;

SELECT summary_data FROM appsflyer_summary_metrics ORDER BY created_at DESC LIMIT 1;
```

#### 1c. Alpha Vantage — Daily Market Pulse

Load via `ToolSearch` query "alphavantage". Run **3 calls** (sequential — 1 req/sec rate limit):

| # | Function | Params | Purpose |
|---|----------|--------|---------|
| 1 | `TOP_GAINERS_LOSERS` | (none) | Broad market movers |
| 2 | `NEWS_SENTIMENT` | `topics=financial_markets,technology` | Fintech news with sentiment |
| 3 | `MARKET_STATUS` | (none) | Market open/closed state |

**Data extraction:**
- **TOP_GAINERS_LOSERS** → top 3 gainers, top 3 losers (ticker, change_pct, price)
- **NEWS_SENTIMENT** → top 3 most relevant articles (title, source, sentiment_score, relevance_score)
- **MARKET_STATUS** → US market status ("open" or "closed")

**Synthesis:** Generate exactly 5 ranked market insights — the top 5 things an average retail investor would want to know to get a pulse on the overall stock and crypto markets today. Prioritize:
1. **Major index moves** — S&P 500, Nasdaq, Dow direction and magnitude
2. **Crypto market pulse** — BTC/ETH price action, notable altcoin moves
3. **Macro drivers** — Fed signals, inflation data, jobs reports, earnings surprises
4. **Sector rotation / themes** — what's hot, what's selling off, and why
5. **Volatility & sentiment** — VIX moves, fear/greed shifts, unusual volume

Each insight must have:
- `rank` (1-5), `headline` (max 80 chars), `body` (1-2 sentences written for a retail investor — plain language, no jargon)
- `sentiment` ("bullish"/"bearish"/"neutral"), `pillar` (optional), `data_point`

Skip anything that only matters to institutional traders. Focus on "what moved, why, and what it means for my portfolio."

Build `market_context` JSONB: `{ generated_at, market_status, insights[], market_movers: { top_gainers[], top_losers[] } }`

Fail gracefully: if Alpha Vantage is unavailable, set `market_context` to null.

<!-- ═══════════════════════════════════════════════════════════════
     COMMENTED OUT — Available for future activation

#### 1d. Work MCP Queries
- get_week_progress() → week_progress column
- get_quarterly_goals() → quarter_goals column
- list_tasks(status="active") → task_summary column
- get_commitments_due(date_range="today") → commitments column
- get_pillar_summary()

#### 1e. Calendar MCP Queries
- calendar_get_today() → calendar_shape (meeting_count, total hours)
- analyze_calendar_capacity() → calendar_shape (day_type, free_blocks)

#### 1f. Mixpanel (PLACEHOLDER)
- Set pillar_metrics to null until report screenshots are provided
- Once configured: query run_segmentation_query, run_funnels_query per pillar
- Compare current 7d vs prior 7d for WoW change

#### 1g. Project Health
- Scan vault 04-Projects/ for active project folders
- OR use project data from Linear (Step 1a)

#### 1h. Session Learnings
- Read System/Session_Learnings/ for yesterday's date file
- Extract learning items (title, suggested_fix, status)

═══════════════════════════════════════════════════════════════ -->

---

### Step 2: Synthesize Pillar Metrics

Build `pillar_metrics` JSONB from Supabase data (Step 1b). Each pillar gets a key metric, WoW change, and 1-2 sentence AI-generated analysis. Do NOT include Linear issues — those belong in Engineering Status.

**JSONB structure:**
```json
{
  "premium_creator_revenue": {
    "key_metric": "2.1%", "metric_label": "Subscription Rate",
    "wow_change": "+0.3pp", "wow_direction": "up",
    "analysis": "Subscription rate up driven by higher paywall-to-modal conversion."
  },
  "first_copy_conversion": {
    "key_metric": "8.4%", "metric_label": "Copy Rate",
    "wow_change": "-0.2pp", "wow_direction": "down",
    "analysis": "Copy rate slightly down."
  },
  "ltv_cac": {
    "key_metric": "$4.13", "metric_label": "Avg LTV",
    "wow_change": "+$0.15", "wow_direction": "up",
    "analysis": "Average LTV at $4.13 across all cohorts."
  }
}
```

**Per-pillar sources:**
- **Premium Creator Revenue:** subscription_rate from `summary_stats`, paywall→modal conversion from `premium_creator_metrics`, price tier distribution from `creator_subscriptions_by_price`
- **First Copy Conversion:** copy_rate from `summary_stats`, top paths from `conversion_path_analysis`, portfolios viewed from `event_sequence_metrics`
- **Maximize LTV:** avg_ltv from `ltv_cohort_analysis` (most mature non-null week via COALESCE), recent cohort week_4 trend, ROAS from `appsflyer_summary_metrics`

`wow_direction`: `"up"`, `"down"`, or `"flat"`

Also generate `daily_tldr` as text fallback (3 lines, one per pillar). Used if `pillar_metrics` rendering fails.

---

### Step 3: Write to Supabase

Upsert via `execute_sql` with dollar-quoting for safe JSONB insertion:

```sql
INSERT INTO cos_daily_snapshot (
  snapshot_date, daily_tldr, pillar_metrics, linear_snapshot,
  market_context, data_sources_used, generation_duration_ms
) VALUES (
  'YYYY-MM-DD', $tldr, $pillar_metrics::jsonb, $linear_snapshot::jsonb,
  $market_context::jsonb, ARRAY['linear', 'supabase', 'alphavantage'], $duration_ms
) ON CONFLICT (snapshot_date) DO UPDATE SET
  daily_tldr = EXCLUDED.daily_tldr,
  pillar_metrics = EXCLUDED.pillar_metrics,
  linear_snapshot = EXCLUDED.linear_snapshot,
  market_context = EXCLUDED.market_context,
  data_sources_used = EXCLUDED.data_sources_used,
  generation_duration_ms = EXCLUDED.generation_duration_ms,
  created_at = now();
```

---

### Step 4: Validate + Confirm

Query back to verify required data was stored:

```sql
SELECT linear_snapshot IS NOT NULL as has_linear,
       market_context IS NOT NULL as has_market,
       pillar_metrics IS NOT NULL as has_pillar,
       jsonb_array_length(COALESCE(linear_snapshot->'action_cards'->'qa_required', '[]'::jsonb)) as qa_count,
       jsonb_array_length(COALESCE(linear_snapshot->'action_cards'->'attention_required', '[]'::jsonb)) as attention_count,
       jsonb_array_length(COALESCE(linear_snapshot->'action_cards'->'upcoming_priorities', '[]'::jsonb)) as upcoming_count
FROM cos_daily_snapshot WHERE snapshot_date = 'YYYY-MM-DD';
```

All REQUIRED columns (`has_linear`, `has_market`) must be true. If `upcoming_count` = 0, re-run Roadmap query. Warn user about any missing required sources.

Display compact summary:
```
Dashboard snapshot published for YYYY-MM-DD.

Engineering: QA: X | Attention: Y | Upcoming: Z
Pillars: [1-line summary per pillar]
Market: [status + top insight]

View at: [dashboard URL]
```

---

## Integration with /daily-plan

Runs automatically at end of `/daily-plan` (Step 8). When triggered from `/daily-plan`:
- Runs silently — no confirmation output
- Daily plan appends: *Dashboard synced — [view Executive Summary](...)*
- If sync fails, daily plan notes it but doesn't block

Can also be run standalone with `/dub-daily` to refresh the dashboard.
