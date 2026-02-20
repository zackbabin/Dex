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

# Leadership team (used for Project filtering)
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

**PARALLELISM LIMIT:** Run at most **4 SQL queries in parallel** via `execute_sql`. More than 4 concurrent calls can cause upstream timeouts, and when one sibling fails all parallel siblings are killed. Batch into groups of 4, wait for each batch to complete before starting the next.

#### 1a. Linear Data (via Edge Function + SQL)

Data comes from the `linear_issues` and `linear_cycles` tables, populated by the `sync-linear-issues` edge function. This replaces direct Linear MCP calls — the edge function fetches issues across all dub 3.0 subteams (Pod 0, Pod 1, Crypto, Web) with labels, project, and cycle data.

**Step 1 — Check sync freshness, trigger if stale:**

```sql
SELECT sync_status, sync_completed_at,
       EXTRACT(EPOCH FROM (NOW() - sync_completed_at))/60 as minutes_ago
FROM sync_logs WHERE source = 'linear_issues'
ORDER BY created_at DESC LIMIT 1;
```

If `minutes_ago` < 30 and `sync_status` = 'completed', proceed with existing data — no need to re-sync.

If stale (> 30 min) or no recent sync, trigger a fresh sync via `net.http_post` with the public anon key (edge function deployed with `--no-verify-jwt`):
```sql
SELECT net.http_post(
  url := 'https://rnpfeblxapdafrbmomix.supabase.co/functions/v1/sync-linear-issues',
  headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJucGZlYmx4YXBkYWZyYm1vbWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMjMwNjIsImV4cCI6MjA3NDg5OTA2Mn0.qGTxaIkqspHZcCN1bcyUj6y1HvkOqj4DTmmgDe-df1Q", "Content-Type": "application/json"}'::jsonb,
  body := '{"force": true}'::jsonb
);
```

Then poll `sync_logs` every 10s (up to 60s) until status = 'completed'. If it doesn't complete in time, proceed with existing data.

**Steps 2-3 — Linear queries (reference only).** These are built inline as CTEs in the Step 3 INSERT — no need to run them separately. Documented here for debugging.

**Step 2 — Projects** (from `linear_projects` table, synced by edge function → `action_cards.projects[]`):

```sql
SELECT name, state, priority, priority_label, lead_name as lead, url, created_at
FROM linear_projects
WHERE state IN ('started', 'planned')
ORDER BY CASE WHEN priority = 0 THEN 99 ELSE priority END ASC,
  state ASC, created_at DESC;
```

**Step 3 — Upcoming Priorities** (from `linear_issues` → `action_cards.upcoming_priorities[]`):

```sql
SELECT identifier, LEFT(title, 100) as title, state_name as status, url,
       project_name as project, updated_at, cycle_number
FROM linear_issues
WHERE 'Roadmap' = ANY(labels)
  AND state_name NOT IN ('Canceled', 'Done', 'Deleted')
  AND NOT EXISTS (
    SELECT 1 FROM linear_cycles lc
    WHERE lc.is_active = TRUE AND lc.id = linear_issues.cycle_id
  )
ORDER BY cycle_number ASC NULLS LAST, updated_at DESC
LIMIT 100;
```

**Fields stored per item in snapshot JSONB:**
- Projects: `name`, `state`, `priority`, `priority_label`, `lead` (name), `url`, `created_at`
- Upcoming Priorities: `identifier`, `title` (max 100 chars), `status`, `url`, `project` (name), `cycle_number`, `updated_at`
- Never store descriptions — they bloat JSONB

**Rules:**
- Never fabricate data — empty is always better than fabricated

#### 1b. Supabase Queries (Pillar Metrics)

**CRITICAL — Schema Validation (run FIRST, before ANY data queries):**

The queries below are hardcoded for speed and precision. But the DB schema changes with migrations, so validate them first. Run this once:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'summary_stats', 'premium_creator_metrics', 'creator_subscriptions_by_price',
    'conversion_path_analysis', 'event_sequence_metrics',
    'ltv_cohort_analysis', 'appsflyer_summary_metrics'
  )
ORDER BY table_name, ordinal_position;
```

**Before running each query below, check the schema results:**
- Verify every table and column referenced in the query actually exists
- If a column is missing, find the closest match in that table's schema (e.g., `created_at` → `synced_at`)
- If a table is missing entirely, skip that query and note the gap
- For `ltv_cohort_analysis`, check which `week_N_ltv` columns exist and adjust the COALESCE accordingly
- **Do NOT run a query with columns that don't exist** — fix it first using the schema

**Output format (all 3 pillars must produce this structure for `pillar_metrics` JSONB):**

Each pillar writes to its key (`premium_creator_revenue`, `first_copy_conversion`, `ltv_cac`) with exactly these 5 fields:
- `key_metric` (string) — the main KPI value, formatted (e.g., "2.1%", "$4.13")
- `metric_label` (string) — what the metric is (e.g., "Subscription Rate", "Copy Rate", "Avg LTV")
- `wow_change` (string) — week-over-week change with sign (e.g., "+0.3pp", "-$0.15")
- `wow_direction` (string) — "up", "down", or "flat"
- `analysis` (string) — 1-2 sentence AI-generated insight synthesizing the data

Read from already-synced tables to build pillar metrics:

**Premium Creator Revenue** → output key: `premium_creator_revenue`
```sql
SELECT stats_data FROM summary_stats ORDER BY calculated_at DESC LIMIT 1;
-- Extract: subscription_rate → key_metric

SELECT total_subscriptions, total_paywall_views, total_stripe_modal_views,
       paywall_views_delta_pct, copy_starts_delta_pct
FROM premium_creator_metrics ORDER BY synced_at DESC LIMIT 20;
-- Use delta percentages → wow_change, wow_direction

SELECT creator_username, subscription_price, subscription_interval,
       total_subscriptions, total_paywall_views
FROM creator_subscriptions_by_price ORDER BY synced_at DESC LIMIT 1;
-- Context for analysis
```

**First Copy Conversion** → output key: `first_copy_conversion`
```sql
SELECT stats_data FROM summary_stats ORDER BY calculated_at DESC LIMIT 1;
-- Extract: copy_rate → key_metric

SELECT path_type, analysis_type, path_rank, sequence,
       converter_count, pct_of_converters, total_converters_analyzed
FROM conversion_path_analysis ORDER BY created_at DESC LIMIT 10;
-- Context for analysis (sequence is JSONB with path steps)

SELECT mean_unique_portfolios, median_unique_portfolios,
       mean_unique_creators, median_unique_creators,
       portfolio_converter_count, creator_converter_count
FROM event_sequence_metrics ORDER BY calculated_at DESC LIMIT 5;
-- Use for wow_change, wow_direction
```

**Maximize LTV** → output key: `ltv_cac`
```sql
SELECT COALESCE(week_26_ltv, week_25_ltv, week_24_ltv, week_23_ltv, week_22_ltv,
       week_21_ltv, week_20_ltv, week_19_ltv, week_18_ltv, week_17_ltv,
       week_16_ltv, week_15_ltv, week_14_ltv, week_13_ltv, week_12_ltv,
       week_11_ltv, week_10_ltv, week_9_ltv, week_8_ltv, week_7_ltv,
       week_6_ltv, week_5_ltv, week_4_ltv, week_3_ltv, week_2_ltv, week_1_ltv) as avg_ltv
FROM ltv_cohort_analysis WHERE cohort_label = 'Avg Cohorts';
-- → key_metric (adjust COALESCE columns to match schema)

SELECT cohort_week, cohort_label, user_count, week_4_ltv
FROM ltv_cohort_analysis WHERE cohort_label != 'Avg Cohorts'
ORDER BY cohort_week DESC LIMIT 8;
-- Cohort trends → wow_change, wow_direction, analysis

SELECT stats_data FROM appsflyer_summary_metrics ORDER BY created_at DESC LIMIT 1;
-- Acquisition context for analysis (stats_data is JSONB)
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

Fail gracefully: if Alpha Vantage is unavailable (rate limit, timeout, etc.), carry forward the most recent `market_context` from a previous snapshot:

```sql
SELECT market_context FROM cos_daily_snapshot
WHERE market_context IS NOT NULL
ORDER BY created_at DESC LIMIT 1;
```

Use this as `market_context` in the INSERT. The dashboard always shows the latest available market data, even if today's fetch failed.


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

**Build `linear_snapshot` JSONB inline via CTEs** — this avoids passing a 70KB+ JSON string through context. The database aggregates the issues directly:

```sql
WITH projects AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', name, 'state', state, 'priority', priority,
    'priority_label', priority_label, 'lead', lead_name,
    'url', url, 'created_at', created_at::text
  ) ORDER BY
    CASE WHEN priority = 0 THEN 99 ELSE priority END ASC,
    state ASC,
    created_at DESC), '[]'::jsonb) as items
  FROM linear_projects
  WHERE state IN ('started', 'planned')
),
upcoming AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'identifier', identifier, 'title', LEFT(title, 100), 'status', state_name,
    'url', url, 'project', project_name, 'updated_at', updated_at, 'cycle_number', cycle_number
  ) ORDER BY cycle_number ASC NULLS LAST, updated_at DESC), '[]'::jsonb) as items
  FROM (
    SELECT identifier, title, state_name, url, project_name, updated_at, cycle_number, cycle_id
    FROM linear_issues
    WHERE 'Roadmap' = ANY(labels)
      AND state_name NOT IN ('Canceled', 'Done', 'Deleted')
      AND NOT EXISTS (
        SELECT 1 FROM linear_cycles lc WHERE lc.is_active = TRUE AND lc.id = linear_issues.cycle_id
      )
    ORDER BY cycle_number ASC NULLS LAST, updated_at DESC
    LIMIT 100
  ) sub
),
snapshot AS (
  SELECT jsonb_build_object(
    'generated_at', now()::text,
    'summary', jsonb_build_object(
      'projects_count', jsonb_array_length(projects.items),
      'upcoming_count', jsonb_array_length(upcoming.items)
    ),
    'action_cards', jsonb_build_object(
      'projects', projects.items,
      'upcoming_priorities', upcoming.items
    )
  ) as data
  FROM projects, upcoming
)
INSERT INTO cos_daily_snapshot (
  snapshot_date, daily_tldr, pillar_metrics, linear_snapshot,
  market_context, data_sources_used, generation_duration_ms
) SELECT
  'YYYY-MM-DD',
  E'• [pillar 1 summary]\n• [pillar 2 summary]\n• [pillar 3 summary]',
  $pillar_metrics${ ... pillar JSON ... }$pillar_metrics$::jsonb,
  snapshot.data,
  $market${ ... market JSON ... }$market$::jsonb,
  ARRAY['linear', 'supabase', 'alphavantage'],
  $duration_ms
FROM snapshot;
```

**Key points:**
- **No ON CONFLICT** — each `/dub-daily` run inserts a new row. The frontend reads the most recent row via `ORDER BY created_at DESC LIMIT 1`.
- The CTEs build `linear_snapshot` server-side from `linear_issues` — no need to read query results first.
- For `market_context`: if Alpha Vantage succeeded, use the fresh data. If it failed, use the fallback from the most recent non-null snapshot (see Step 1c).
- Use dollar-quoting (`$tag$...$tag$`) for safe JSON embedding.

---

### Step 4: Validate + Confirm

Query back to verify required data was stored:

```sql
SELECT linear_snapshot IS NOT NULL as has_linear,
       market_context IS NOT NULL as has_market,
       pillar_metrics IS NOT NULL as has_pillar,
       jsonb_array_length(COALESCE(linear_snapshot->'action_cards'->'projects', '[]'::jsonb)) as projects_count,
       jsonb_array_length(COALESCE(linear_snapshot->'action_cards'->'upcoming_priorities', '[]'::jsonb)) as upcoming_count
FROM cos_daily_snapshot ORDER BY created_at DESC LIMIT 1;
```

All REQUIRED columns (`has_linear`, `has_pillar`) must be true. `has_market` should be true (carried forward from previous snapshot if Alpha Vantage failed). If `upcoming_count` = 0, re-run Roadmap query. Warn user about any missing required sources.

Display compact summary:
```
Dashboard snapshot published for YYYY-MM-DD.

Engineering: Projects: X | Upcoming: Y
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
