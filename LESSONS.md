# MyTrend — Lessons Learned

> Review at session start. Update after every correction or incident.

## Architecture Decisions

### Companion MUST run natively, not in Docker (2026-02-24)
- **Context**: Attempted to dockerize companion service (commit fa2f856)
- **Problem**: Docker companion = sandboxed. No MCP servers, no skills, no host filesystem, no Kanban sync. Bun.spawn can't exec symlinks in container. Root user blocked by Claude Code.
- **Fix**: 5 cascading fix commits before reverting to native (commit b28d446)
- **Rule**: Companion needs full host access. Docker only viable for remote server deploy (lite mode).
- **Lesson**: When fix #2 doesn't work, STOP and re-evaluate the approach. Don't chain fixes.

### Docker named volumes isolate data from host (2026-02-24)
- **Context**: `companion_data:/app/data` (named volume) vs `./companion/data:/app/data` (bind mount)
- **Problem**: Named volume = data lives inside Docker, invisible to host. Profiles and telegram config "disappeared".
- **Rule**: Always use bind mounts for config/data that needs host access.

## Telegram Bot

### Reply race condition with concurrent messages (2026-02-24)
- **Context**: User sends msg A, Claude starts responding. User sends msg B before response finishes.
- **Problem**: `lastUserMsgId` overwritten by msg B → Claude's response to A gets reply-to on B.
- **Fix**: `responseOriginMsg` map locks origin message ID when response starts.
- **Rule**: Any shared mutable state between async flows needs lock/snapshot pattern.

### Idle timeout must track CLI activity, not just user messages (2026-02-24)
- **Context**: 30min idle timeout only reset on user messages.
- **Problem**: Claude working actively (writing files, running tools) but no user message → session killed mid-work.
- **Fix**: Reset timer on `assistant`, `tool_progress`, `result`, `status_change` events. Increased to 60min.
- **Rule**: "Idle" means no activity from EITHER side, not just one side.

### Model names must map to valid CLI aliases (2026-02-24)
- **Context**: Telegram keyboard had `opus-1m`, `sonnet-1m` as model names.
- **Problem**: Claude Code CLI doesn't recognize these. Valid aliases: `sonnet`, `opus`, `haiku`, `sonnet[1m]`, `opus[1m]`, `opusplan`.
- **Fix**: MODEL_MAP in ws-bridge.ts and cli-launcher.ts translates display names → CLI aliases.
- **Rule**: Always check upstream API/CLI docs before inventing identifier names.

### PocketBase Goja has no Intl API (2026-03-01)
- **Context**: `telegram_auth.pb.js` used `Intl.DateTimeFormat().resolvedOptions().timeZone` to set user timezone
- **Problem**: Goja JSVM doesn't implement `Intl`. Crashes at runtime when creating new Telegram user.
- **Fix**: Replace with static `'UTC'` string
- **Rule**: Never use browser/Node APIs in PB hooks: no `Intl`, no `crypto`, no `fetch`, no `Buffer`. Check Goja docs.

### Magic link auth uses authWithPassword, not custom tokens (2026-03-01)
- **Context**: Wanted to issue PocketBase auth tokens directly via `$tokens.recordAuthToken()`
- **Problem**: JSVM doesn't reliably expose token generation. Custom token auth also requires frontend changes.
- **Decision**: Generate one-time password on verify, return `{email, password}`, let frontend call `pb.authWithPassword()`. Password changes every login → no security risk over HTTPS.
- **Rule**: When PB JSVM doesn't support an API, find a workaround using existing battle-tested APIs.

## Workflow

### "Fix chaining" anti-pattern (2026-02-24)
- **Context**: Docker companion spawn failed → tried 6 different approaches in sequence without stepping back.
- **Symptom**: Each fix introduced new problems. User frustrated: "trước đó vẫn bình thường, cứ fix lung tung rồi lại lỗi phát sinh".
- **Rule**: If fix #2 for the same issue doesn't work → STOP, re-read the original working code, consider reverting. Max 2 fix attempts before re-plan.

### Commit before long-running operations (2026-02-24)
- **Context**: Rune project session timed out while Claude was writing 35 skill files.
- **Problem**: All changes uncommitted → risk of losing work.
- **Rule**: Commit after each logical unit of work. Don't batch large changes.
