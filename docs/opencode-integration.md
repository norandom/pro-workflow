# OpenCode Integration Guide

How to use pro-workflow natively within OpenCode.

## Installation

```bash
npm install pro-workflow
```

## Setup

```bash
npx pro-workflow setup-opencode
```

This provisions `.opencode/` with skills, agents, commands, and rules:

```
.opencode/
├── skills/       # 34 skills (symlinked or copied)
├── agents/       # 8 agents (converted frontmatter)
├── commands/     # 22 commands (added agent routing)
└── AGENTS.md     # 11 rules (merged from rules/*.mdc)
```

The setup utility prints a JSON snippet — add it to your `opencode.json`.

## Configuration

Add to your `opencode.json`:

```json
{
  "plugin": ["pro-workflow"],
  "instructions": ["./.opencode/AGENTS.md"]
}
```

See `templates/opencode-config.example.json` and `templates/opencode-settings.example.json` for full examples.

## Features

| Feature | Support |
|---------|---------|
| **Skills** (34) | Full — format is natively compatible |
| **Agents** (8) | Full — converted with tools → permission mapping |
| **Commands** (22) | Full — routed to build agent |
| **Rules** (11) | Full — merged into AGENTS.md |
| **Hooks** (37 scripts) | Partial — 15/24 event types mapped via plugin; unmapped hooks enforced via rules or skills |

## Custom Tools

The plugin registers three custom tools:

- `pw-search` — Full-text search across learnings and wiki pages
- `pw-learn` — Store a new learning in the pro-workflow database
- `pw-wiki-query` — Query wiki pages by title or content

These tools appear alongside OpenCode's built-in tools when the plugin is loaded.

## Hooks

pro-workflow's 37 hook scripts execute through OpenCode's native event system. The plugin maps:

| OpenCode Event | pro-workflow Hooks |
|---|---|
| `tool.execute.before` | PreToolUse |
| `tool.execute.after` | PostToolUse, PostToolUseFailure |
| `session.idle` | SessionEnd, Stop |
| `session.compacted` | PostCompact |
| `shell.env` | Environment injection |
| `permission.ask` | PermissionRequest |
| `experimental.session.compacting` | PreCompact |

Unmapped hooks (ConfigChange, Notification, TeammateIdle, StopFailure, WorktreeCreate, WorktreeRemove, CwdChanged, Setup) are enforced through AGENTS.md rules or exposed as skills.

## Troubleshooting

**Skills not appearing**: Ensure `.opencode/skills/` exists and contains `SKILL.md` files. Run `npx pro-workflow setup-opencode` to regenerate.

**Hooks not firing**: Verify `plugin: ["pro-workflow"]` is in your `opencode.json`. Check OpenCode logs for plugin load confirmation.

**Custom tools not found**: The plugin must be loaded via `opencode.json` `plugin` array. Tools are registered at load time.

**Database errors**: Ensure the SQLite database exists at `~/.pro-workflow/data.db`. The store connects lazily on first use.
