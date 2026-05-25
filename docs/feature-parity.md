# Feature Parity Matrix

Comparison of pro-workflow support across supported agents.

## Core Features

| Feature | Claude Code | Cursor | OpenCode |
|---------|------------|--------|----------|
| **Skills (34)** | Full | Full | Full |
| **Agents (8)** | Full | Full | Full (tools→permission conversion) |
| **Commands (22)** | Full | Full | Full (agent routing added) |
| **Rules (11)** | Full (.mdc) | Full | Full (merged to AGENTS.md) |

## Hook System

| Event | Claude Code | Cursor | OpenCode |
|-------|------------|--------|----------|
| PreToolUse | Full | — | Full (tool.execute.before) |
| PostToolUse | Full | — | Full (tool.execute.after) |
| PostToolUseFailure | Full | — | Full (tool.execute.after error) |
| SessionStart | Full | — | Full (session.created) |
| SessionEnd | Full | — | Full (session.idle) |
| Stop | Full | — | Full (session.idle) |
| UserPromptSubmit | Full | — | Partial (tui.prompt.append) |
| PostCompact | Full | — | Full (session.compacted) |
| PreCompact | Full | — | Partial (experimental.session.compacting) |
| FileChanged | Full | — | Full (file.edited) |
| PermissionRequest | Full | — | Partial (permission.ask) |
| SubagentStart/Stop | Full | — | Partial (session.status) |
| TaskCreated/Completed | Full | — | Partial (todo.updated) |
| ConfigChange | Full | — | Rules enforcement |
| Notification | Full | — | Skill-based |
| TeammateIdle | Full | — | Not supported |
| StopFailure | Full | — | Not supported |
| WorktreeCreate | Full | — | Not supported |
| WorktreeRemove | Full | — | Not supported |
| CwdChanged | Full | — | Not supported |
| Setup | Full | — | Setup utility |

## Data Store

| Feature | Claude Code | Cursor | OpenCode |
|---------|------------|--------|----------|
| SQLite access | Full | Full | Full (custom tools) |
| FTS5 search | Full | Full | Full (pw-search) |
| Semantic search | Full | Full | Full (embedding fallback) |
| Learnings CRUD | Full | Full | Full (pw-learn) |
| Wiki access | Full | Full | Full (pw-wiki-query) |

## Plugin System

| Feature | Claude Code | Cursor | OpenCode |
|---------|------------|--------|----------|
| Manifest format | plugin.json | plugin.json | npm package + JS module |
| Skill loading | On-demand | On-demand | On-demand |
| Event hooks | hooks.json | Not supported | Native events (15/24 mapped) |
| Custom tools | MCP servers | MCP servers | Native tool() + Zod |

## OpenCode Limitations

1. **Hooks**: 9 of 24 hook event types have no native OpenCode equivalent. Workarounds:
   - Behavior enforcement → AGENTS.md rules
   - Content generation → Exposed as skills (e.g., learning capture, session summaries)
   - System state monitoring → Documented gaps with impact assessment

2. **Rules**: OpenCode has no `.mdc` file-scoped rules. All rules merged into single `AGENTS.md` regardless of `globs` patterns. File-scoped enforcement requires `instructions` field in `opencode.json`.

3. **Agents**: pro-workflow's `memory`, `background`, `isolation` fields have no OpenCode equivalents. These capabilities are dropped during conversion.

4. **Commands**: OpenCode doesn't support `argument-hint`. Commands use `$ARGUMENTS` directly.
