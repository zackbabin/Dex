#!/bin/bash
# Dex Daily Dashboard Sync
# Runs /dub-daily via Claude Code to publish the daily snapshot to Supabase.
# Triggered by launchd at 7:00 AM daily.

set -euo pipefail

LOG_PREFIX="[dub-daily-sync $(date '+%Y-%m-%d %H:%M:%S')]"

echo "$LOG_PREFIX Starting daily dashboard sync..."

cd /Users/zack/chief-of-staff

# Run /dub-daily non-interactively via Claude Code
# --print: non-interactive mode (no TTY needed)
# Output goes to stdout which launchd captures in the log file
if claude --print "/dub-daily" 2>&1; then
    echo "$LOG_PREFIX Sync completed successfully."
else
    echo "$LOG_PREFIX Sync failed with exit code $?."
    exit 1
fi
