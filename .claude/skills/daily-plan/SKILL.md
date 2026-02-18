---
name: daily-plan
description: Generate context-aware daily plan with calendar, tasks, and priorities. Includes midweek awareness, meeting intelligence, commitment tracking, and smart scheduling suggestions.
---

## Purpose

Generate your daily plan with full context awareness. Automatically gathers information from your calendar, tasks, meetings, relationships, and weekly progress to create a focused plan with genuine situational awareness.

## Usage

- `/daily-plan` — Create today's daily plan
- `/daily-plan tomorrow` — Plan for tomorrow (evening planning)
- `/daily-plan --setup` — Re-run integration setup

---

## Tone Calibration

Before executing this command, read `System/user-profile.yaml` → `communication` section and adapt tone accordingly (see CLAUDE.md → "Communication Adaptation").

---

## Step 0: Demo Mode Check

Before anything else, check if demo mode is active:

1. Read `System/user-profile.yaml`
2. Check `demo_mode` value
3. **If `demo_mode: true`:**
   - Display banner: "Demo Mode Active — Using sample data from System/Demo/"
   - Use demo paths and skip live integrations
4. **If `demo_mode: false`:** Proceed normally

---

## Step 1: Background Checks (Silent)

Run these silently without user-facing output:

1. **Update check**: `check_for_updates(force=False)` - store notification if available
2. **Self-learning checks**: Run changelog and learning review scripts if due
3. **Search index refresh**: Run `qmd update && qmd embed` to refresh vault search index with any overnight changes (meetings processed, files edited, etc.). If `qmd` is not installed, skip silently.
4. **Innovation synthesis** (silent): Call `synthesize_changelog()` and `synthesize_learnings()` from Improvements MCP. These run in background and populate the backlog — results are surfaced in Step 1.5 below.

---

## Step 1.5: Innovation Spotlight (Concierge)

After background checks complete, check for noteworthy backlog activity:

1. Call `list_ideas(status="active", min_score=70)` from Improvements MCP
2. Check `System/.synthesis-state.json` for recent synthesis activity (last 7 days)
3. If there are AI-authored or recently enriched ideas, pick the most impactful one

**Surface as a brief spotlight in the plan output (1-2 lines max):**

> **Innovation Spotlight:** Claude Code shipped native memory (v2.1.32) — this could simplify idea-006 (Session Memory MCP). Run `/dex-improve idea-006` to explore.

**Rules:**
- Show at most 1 spotlight per daily plan (don't overwhelm)
- Rotate through ideas — don't show the same one twice in a row
- Only show if there's genuine "Why Now?" urgency (new evidence in last 7 days)
- If no recent synthesis activity, skip this section entirely
- Never block the plan for this — it's a helpful aside, not a gate

---

## Step 2: Morning Journal Check (If Enabled)

If `journaling.morning: true` in user-profile.yaml, check for today's morning journal and prompt if missing.

---

## Step 3: Monday Weekly Planning Gate

If today is Monday and week isn't planned, offer to run `/week-plan` first.

---

## Step 4: Yesterday's Review Check (Soft Gate)

Check for yesterday's review and extract context (open loops, tomorrow's focus, blocked items).

---

## Step 5: Context Gathering (ENHANCED)

Gather context from all available sources. **This is where the magic happens.**

### 5.1 Midweek Progress Check (NEW)

```
Use: get_week_progress()
```

This is critical for genuine situational awareness. Extract:
- Day of week and days remaining
- Weekly priority status (complete / in_progress / not_started)
- Warnings for priorities with no activity

**Surface this prominently:**

> "It's **Wednesday**. Here's where you are on this week's priorities:
> 
> 1. ✅ **Ship pricing page** — Complete (finished Monday)
> 2. 🔄 **Review proposal** — In progress (2 of 5 tasks done)
> 3. ⚠️ **Customer interviews** — Not started (no activity yet)
> 
> You have 2 days left this week. Priority 3 needs attention."

### 5.2 Calendar Capacity Analysis (NEW)

```
Use: analyze_calendar_capacity(days_ahead=1, events=[...from calendar MCP...])
```

Understand the *shape* of today:

- **Day type**: stacked / moderate / open
- **Meeting count and hours**
- **Free blocks available**
- **Recommendation**: What kind of work fits today

**Surface this:**

> "📅 **Today's shape:** Moderate (4 meetings, 3 hours total)
> 
> **Free blocks:**
> - 8:00-9:30 AM (90 min) — Morning focus time
> - 2:00-4:00 PM (120 min) — Afternoon block
> 
> **Recommendation:** Good for medium tasks and meeting prep. Deep work fits the 2-4pm block."

### 5.3 Meeting Intelligence (NEW)

For each meeting today:

```
Use: get_meeting_context(meeting_title="...", attendees=[...])
```

Get genuine context, not just attendee names:
- **Related project**: What project is this connected to?
- **Project status**: What's outstanding? What's blocked?
- **Outstanding tasks with attendees**: What do you owe them? What do they owe you?
- **Prep suggestions**: What should you review before this meeting?

**Surface this with surprise and delight:**

> "📍 **Meeting: Acme Quarterly Review** (2pm with Sarah Chen, Mike Ross)
> 
> **Related project:** Acme Implementation (Phase 2)
> - Status: On track, but pricing section still in draft
> - Outstanding: You owe Sarah the pricing proposal
> 
> **Prep suggestion:** Review proposal draft, prepare pricing options. Block 30 min before this meeting?"

### 5.4 Commitment Tracking (NEW)

```
Use: get_commitments_due(date_range="today")
```

Surface things you said you'd do:

> "⚡ **Commitments due today:**
> 
> - You told Mike you'd get back to him by Wednesday (from Monday 1:1)
> - Follow up on competitive analysis (from Acme meeting)"

### 5.5 Task Scheduling Suggestions (NEW)

```
Use: suggest_task_scheduling(include_all_tasks=False, calendar_events=[...])
```

Match tasks to available time based on effort classification:

> "📋 **Scheduling suggestions:**
> 
> | Task | Effort | Suggested Time |
> |------|--------|----------------|
> | Write Q1 strategy doc | Deep work (2-3h) | Tomorrow (you have a 3h morning block) |
> | Review Sarah's proposal | Medium (1h) | Today 2-3pm (before Acme meeting) |
> | Reply to Mike | Quick (15min) | Between meetings |
> 
> ⚠️ **Heads up:** You have 2 deep work tasks but today's too fragmented. Consider protecting tomorrow morning."

### 5.6 Semantic Context Enrichment (if QMD available)

**This step runs automatically when QMD is installed via `/enable-semantic-search`.** It adds a semantic search layer on top of the standard context gathering to surface connections that keyword search misses.

Check if QMD MCP tools are available by calling `qmd_status`. **If available:**

1. **For each meeting today**, run:
   ```
   qmd_search(query="[meeting topic] [attendee names]", limit=3)
   ```
   Surface: past discussions, related decisions, relevant commitments that share **meaning** but not keywords with this meeting. Example: a meeting about "customer onboarding" finds notes about "activation rates" and "time to value".

2. **For each weekly priority that's lagging**, run:
   ```
   qmd_search(query="[priority description]", limit=3)
   ```
   Surface: vault content that advances or relates to this priority but wouldn't appear in a keyword search. Especially useful for finding forgotten context about stalled work.

3. **Cross-topic connection scan:**
   ```
   qmd_search(query="[today's key themes combined]", limit=5)
   ```
   Surface: unexpected connections between today's meetings, tasks, and priorities. This is where semantic search shines — finding that a 2pm customer call relates to a PRD you wrote last month using completely different terminology.

4. **Merge with existing context** — only add genuinely new insights. Don't duplicate what Steps 5.1-5.5 already found. Mark semantic results with their source so the plan output can distinguish them.

**What this enables in the plan output:**
- Meeting context sections include "**Also relevant:**" with thematically related past discussions
- Priority recommendations cite relevant vault content discovered by meaning
- "Heads Up" section catches connections between seemingly unrelated items
- Focus recommendations are informed by deeper vault knowledge

**If QMD is not available:** Skip silently. Steps 5.1-5.5 and 5.7 provide full context via standard methods.

---

### 5.7 Standard Context Gathering

Also gather:
- **Calendar**: Today's meetings with times and attendees
- **Tasks**: P0, P1, started-but-not-completed, overdue
- **Week Priorities**: This week's Top 3
- **Work Summary**: Quarterly goals context (if enabled)
- **People**: Context for meeting attendees
- **Self-Learning Alerts**: Changelog updates, pending learnings

---

## Step 6: Synthesis

Combine all gathered context into actionable recommendations:

### Focus Recommendation

Generate 3 recommended focus items based on:
- P0 tasks (highest weight)
- Weekly priority alignment (especially lagging priorities!)
- Meeting prep needs
- Commitments due

**The system should actively recommend, not just list:**

> "Based on your week progress and today's shape, I recommend focusing on:
> 
> 1. **Prep for Acme meeting** — Priority 2 is lagging and this meeting is critical
> 2. **Reply to Mike** — Commitment due today
> 3. **Task X from Priority 1** — Keeps momentum on your shipped priority"

### Meeting Prep (Enhanced)

For each meeting, show:
- Who's attending + People/ context
- Related project status
- Outstanding tasks with attendees
- Suggested prep time and what to prepare

### Heads Up (Enhanced)

Flag potential issues:
- Weekly priorities with no activity (midweek warning)
- Commitments due today
- Back-to-back meetings
- P0 items with no time blocked
- Deep work tasks with no suitable slot this week

---

## Step 7: Generate Daily Plan

Create `07-Archives/Plans/YYYY-MM-DD.md`:

```markdown
---
date: YYYY-MM-DD
type: daily-plan
integrations_used: [calendar, tasks, people, work-intelligence]
---

# Daily Plan — {{Day}}, {{Month}} {{DD}}

## TL;DR
- {{1-2 sentence summary including week progress}}
- {{X}} meetings today, day is {{stacked/moderate/open}}
- {{Key focus area based on week priorities}}

---

## 📊 Week Progress (Midweek Check)

**Day {{X}} of 5** — {{days_remaining}} days left this week

| Priority | Status | Notes |
|----------|--------|-------|
| {{Priority 1}} | ✅ Complete | Finished {{day}} |
| {{Priority 2}} | 🔄 In progress | {{X}} of {{Y}} tasks done |
| {{Priority 3}} | ⚠️ Not started | Needs attention |

**This week's focus:** {{Recommendation based on lagging priorities}}

---

## 📅 Today's Shape

**Day type:** {{stacked/moderate/open}} ({{X}} meetings, {{Y}} hours)

**Free blocks:**
- {{Time range}}: {{Size}} — {{Recommended use}}

**Best for:** {{Quick tasks only / Medium tasks / Deep work opportunity}}

---

## ⚡ Commitments Due Today

- [ ] {{Commitment}} — from {{source}}
- [ ] {{Commitment}} — from {{source}}

---

## 🎯 Today's Focus

**If I only do three things today:**

1. [ ] {{Focus item 1}} — {{Pillar}} *(supports Week Priority #X)*
2. [ ] {{Focus item 2}} — {{Pillar}} *(supports Week Priority #Y)*
3. [ ] {{Focus item 3}} — {{Pillar}}

---

## 📍 Meetings (with Context)

### {{Time}} — {{Meeting Title}}

**Attendees:** {{Names}}
**Related project:** {{Project name}} ({{status}})
**Outstanding with them:**
- {{Task/commitment}}

**Prep needed:** {{What to review/prepare}}
**Suggested prep time:** {{Block X min before}}

---

### {{Time}} — {{Meeting Title}}

[Repeat for each meeting]

---

## 📋 Task Scheduling

| Task | Effort | Suggested Slot | Reason |
|------|--------|----------------|--------|
| {{Task}} | Deep work | {{Day/time}} | {{Reason}} |
| {{Task}} | Medium | {{Day/time}} | {{Reason}} |
| {{Task}} | Quick | Between meetings | Batch these |

{{If deep work capacity warning}}
> ⚠️ You have {{X}} deep work tasks but only {{Y}} suitable slots this week. Consider protecting time or deferring.

---

## ⚠️ Heads Up

- {{Warning about lagging weekly priority}}
- {{Commitment due today}}
- {{Back-to-back meetings}}
- {{Other flags}}

---

*Generated: {{timestamp}}*
*Week progress: {{X}}/{{Y}} priorities on track*
```

---

## Step 8: Dashboard Sync (Silent)

After the daily plan is generated and saved, automatically run the `/dub-daily` skill to publish the day's snapshot to the Executive Summary dashboard.

**Execution:**
1. Follow the full `/dub-daily` execution flow (gather data from Work MCP, Calendar MCP, Linear MCP, Supabase; synthesize TL;DR; write to `cos_daily_snapshot`)
2. Run silently — do NOT show the `/dub-daily` confirmation output to the user
3. At the end of the daily plan output, append a single line:
   > *Dashboard synced — [view Executive Summary](https://effective-dollop-kzkpnp1.pages.github.io/#executive)*
4. If the sync fails for any reason, append instead:
   > *Dashboard sync skipped — run `/dub-daily` manually to update.*
5. Never block or delay the daily plan output for this step

---

## Step 9: Track Usage (Silent)

Update `System/usage_log.md` to mark daily planning as used.

**Analytics (Silent):**

Call `track_event` with event_name `daily_plan_completed` and properties:
- `meetings_count`: number of meetings today
- `tasks_surfaced`: number of tasks shown
- `priorities_count`: number of priorities

This only fires if the user has opted into analytics. No action needed if it returns "analytics_disabled".

---

## Graceful Degradation

The plan works at multiple levels:

### Full Context (All MCPs available)
- Complete week progress, meeting intelligence, scheduling suggestions
- Maximum "surprise and delight"

### Partial Context (Work MCP only)
- Week progress and task scheduling
- No meeting context (prompt user to add manually)

### Minimal Context (No MCPs)
- Interactive flow asking about priorities
- Basic daily note

---

## MCP Dependencies (Updated)

| Integration | MCP Server | Tools Used |
|-------------|------------|------------|
| Calendar | dex-calendar-mcp | `calendar_get_today`, `calendar_get_events_with_attendees` |
| Granola | dex-granola-mcp | `get_recent_meetings` |
| Work | dex-work-mcp | `list_tasks`, `get_week_progress`, `get_meeting_context`, `get_commitments_due`, `analyze_calendar_capacity`, `suggest_task_scheduling` |
| Improvements | dex-improvements-mcp | `synthesize_changelog`, `synthesize_learnings`, `list_ideas` |