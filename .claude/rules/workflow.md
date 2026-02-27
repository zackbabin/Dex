# Chief-of-Staff Workflow

> Universal principles (planning, verification, simplicity, safety) are in `~/.claude/CLAUDE.md`.
> This file covers Dex/vault-specific workflow rules only.

## Plan Mode Triggers

Enter plan mode for:
- Adding new system features (MCP tools, new workflows, structural changes to vault)
- Editing CLAUDE.md, pillars.yaml, or user-profile.yaml in ways that affect system behavior
- Changes that touch 3+ files or multiple system components
- Anything that changes how Dex interprets future data (pillar mapping, routing rules)

Skip plan mode for:
- Creating or updating person pages, meeting notes, or task entries
- Routine vault file edits (single file, obvious change)

## Vault File Operations

- Always read existing files before editing — never overwrite without seeing current state
- Person pages: route to `05-Areas/People/Internal/` or `External/` based on email domain
- Meeting notes: `00-Inbox/Meetings/YYYY-MM-DD - Topic.md`
- Never delete vault content without explicit confirmation

## System Changes Verification

Before marking system changes complete:
- [ ] CLAUDE.md edits preserve the `USER_EXTENSIONS_START / USER_EXTENSIONS_END` block verbatim
- [ ] CHANGELOG.md updated with version number and today's date
- [ ] MCP tools still respond correctly (test if config changed)
- [ ] No accidental vault file moves or deletions

## Self-Improvement Loop

After any correction during a session, capture it in `System/Session_Learnings/YYYY-MM-DD.md`:

```markdown
## [HH:MM] - [Short title]

**What happened:** [Specific situation]
**Why it matters:** [Impact on system/workflow]
**Suggested fix:** [Specific action with file paths]
**Status:** pending
```

Review recent `System/Session_Learnings/` entries at session start when working on related areas.

## Linear API Patterns

See `MEMORY.md` for the full list of gotchas. Key rules:
- No team filter = all teams (parent + all subteams) — prefer this over per-subteam queries
- Extract minimal fields immediately after `list_issues` — full descriptions overflow context
- Never delegate Linear queries to sub-agents — they hallucinate when tokens overflow
