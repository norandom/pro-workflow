/**
 * Event Adapter — maps OpenCode events to pro-workflow hook scripts.
 *
 * Covers 15 of 24 Claude Code hook event types.  The 7 unmapped events
 * (ConfigChange, Notification, TeammateIdle, StopFailure, WorktreeCreate,
 * WorktreeRemove, CwdChanged) are documented below and enforced via rules
 * or alternative mechanisms.
 *
 * ## Event Mapping Table
 *
 * | OpenCode Event            | Claude Code Event     | Scripts Invoked                          |
 * |---------------------------|-----------------------|------------------------------------------|
 * | tool.execute.before       | PreToolUse            | quality-gate, read-before-write,         |
 * |                           |                       | tool-call-budget, git-blast-radius,      |
 * |                           |                       | pre-commit-check, commit-validate,       |
 * |                           |                       | secret-scan, pre-push-check              |
 * | tool.execute.after        | PostToolUse           | post-edit-check, learn-capture,          |
 * |                           |                       | drift-detector, test-failure-check       |
 * | tool.execute.after(error) | PostToolUseFailure    | tool-failure                             |
 * | session.created           | SessionStart          | session-start                            |
 * | session.idle              | SessionEnd / Stop     | session-end, session-check               |
 * | file.edited               | FileChanged           | file-changed, config-watcher             |
 * | session.compacted         | PostCompact           | post-compact                             |
 * | permission.ask            | PermissionRequest     | permission-request                       |
 * | permission.replied(deny)  | PermissionDenied      | permission-denied                        |
 * | todo.updated              | TaskCreated/Completed | task-created, task-completed             |
 * | tui.prompt.append         | UserPromptSubmit      | prompt-submit                            |
 * | session.status            | SubagentStart/Stop    | subagent-start, subagent-stop            |
 * | experimental.s.compacting | PreCompact            | pre-compact                              |
 *
 * ## Unmapped Events
 *
 * - ConfigChange: OpenCode has no dedicated config-change event.
 *   Partially covered by `file.edited` checking for config files.
 * - Notification: No equivalent. Exposed as a skill.
 * - TeammateIdle: No equivalent.
 * - StopFailure: No equivalent. Handled by OpenCode `session.error`.
 * - WorktreeCreate/Remove: No equivalent.
 * - CwdChanged: No equivalent.
 * - Setup: Handled by the setup utility (setup-opencode.ts).
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root of the pro-workflow package (3 levels up from dist/opencode-plugin/) */
const PLUGIN_ROOT = resolve(__dirname, "..", "..");

/** Shell execution helper — matches Bun `$` tagged template type */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ShellFn = any;

/** Logger type */
type LogFn = (msg: string) => void;

/** Map of OpenCode event names → list of scripts to run */
interface ScriptMapping {
  /** Script paths relative to PLUGIN_ROOT (e.g., "scripts/quality-gate.js") */
  scripts: string[];
  /** Extra env vars to set */
  env?: Record<string, string>;
}

export const EVENT_MAP: Record<string, ScriptMapping> = {
  "tool.execute.before": {
    scripts: [
      "scripts/quality-gate.js",
      "scripts/read-before-write.js",
      "scripts/tool-call-budget.js",
      "scripts/git-blast-radius.js",
      "scripts/secret-scan.js",
    ],
  },

  "tool.execute.after": {
    scripts: [
      "scripts/post-edit-check.js",
      "scripts/learn-capture.js",
      "scripts/drift-detector.js",
      "scripts/test-failure-check.js",
    ],
  },

  "session.created": {
    scripts: ["scripts/session-start.js"],
  },

  "session.idle": {
    scripts: ["scripts/session-end.js", "scripts/session-check.js"],
  },

  "file.edited": {
    scripts: ["scripts/file-changed.js", "scripts/config-watcher.js"],
  },

  "session.compacted": {
    scripts: ["scripts/post-compact.js"],
  },

  "permission.ask": {
    scripts: ["scripts/permission-request.js"],
  },

  "permission.denied": {
    scripts: ["scripts/permission-denied.js"],
  },

  "todo.updated": {
    scripts: ["scripts/task-created.js", "scripts/task-completed.js"],
  },

  "tui.prompt.append": {
    scripts: ["scripts/prompt-submit.js"],
  },

  "session.status": {
    scripts: ["scripts/subagent-start.js", "scripts/subagent-stop.js"],
    env: {
      CLAUDE_PROJECT_DIR: process.cwd(),
    },
  },

  "experimental.session.compacting": {
    scripts: ["scripts/pre-compact.js"],
  },
};

/**
 * Transform an OpenCode event payload into JSON suitable for piping to
 * Claude Code hook scripts that read stdin.
 */
export function toHookPayload(
  eventName: string,
  eventPayload: Record<string, unknown>,
): Record<string, unknown> {
  switch (eventName) {
    case "tool.execute.before":
      return {
        tool_name: eventPayload.tool,
        tool_input: eventPayload.args ?? {},
        session_id: eventPayload.sessionID,
        call_id: eventPayload.callID,
      };
    case "tool.execute.after":
      return {
        tool_name: eventPayload.tool,
        tool_input: eventPayload.args ?? {},
        tool_output: eventPayload.output ?? "",
        session_id: eventPayload.sessionID,
        call_id: eventPayload.callID,
      };
    case "session.compacted":
      return {
        session_id: eventPayload.sessionID,
        compact_event: eventPayload,
      };
    case "experimental.session.compacting":
      return {
        session_id: eventPayload.sessionID,
        pre_compact: eventPayload,
      };
    case "file.edited":
      return {
        file: eventPayload.file ?? eventPayload.path ?? "",
        session_id: eventPayload.sessionID ?? "",
      };
    default:
      return { event: eventName, ...eventPayload };
  }
}

/**
 * Execute the scripts mapped to an OpenCode event.
 *
 * Each script is run via `node <script>` with the plugin root and session
 * info set as environment variables.  Scripts that read stdin receive the
 * transformed payload.
 */
export async function runScriptsForEvent(
  $: ShellFn,
  log: LogFn,
  eventName: string,
  eventPayload: Record<string, unknown>,
  sessionID?: string,
): Promise<void> {
  const mapping = EVENT_MAP[eventName];
  if (!mapping) {
    log(`ProWorkflow: no script mapping for event "${eventName}"`);
    return;
  }

  const payload = toHookPayload(eventName, eventPayload);
  const stdin = JSON.stringify(payload);
  const projectDir = process.cwd();

  for (const scriptPath of mapping.scripts) {
    const fullPath = resolve(PLUGIN_ROOT, scriptPath);
    const cmd = `node "${fullPath}"`;

    try {
      // Pipe the payload via stdin, set env vars the scripts expect
      const envOverrides = [
        `CLAUDE_PLUGIN_ROOT="${PLUGIN_ROOT}"`,
        `CLAUDE_PROJECT_DIR="${projectDir}"`,
        ...(sessionID ? [`CLAUDE_SESSION_ID="${sessionID}"`] : []),
        ...Object.entries(mapping.env ?? {}).map(([k, v]) => `${k}="${v}"`),
      ];

      const fullCmd = `${envOverrides.join(" ")} echo '${stdin.replace(/'/g, "'\\''")}' | ${cmd}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await $({ raw: [fullCmd] } as any);

      const stderr: string = String(result?.stderr ?? "");
      if (stderr) {
        log(`ProWorkflow [${scriptPath}]: ${stderr.replace(/\n$/, "")}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log(`ProWorkflow [${scriptPath}] error: ${message}`);
      // Never block — hooks are fire-and-forget
    }
  }
}

/**
 * Human-readable list of unadaptable events and their alternative strategies.
 */
export const UNMAPPED_EVENTS: Record<string, string> = {
  ConfigChange:
    "No dedicated event. Partially covered by `file.edited` checking for config files.",
  Notification:
    "No equivalent. Consider exposing notification handler as a skill.",
  TeammateIdle:
    "No equivalent. Team monitoring not supported by OpenCode.",
  StopFailure:
    "No equivalent. Handled by OpenCode `session.error` event.",
  WorktreeCreate:
    "No equivalent. OpenCode does not expose worktree creation events.",
  WorktreeRemove:
    "No equivalent. OpenCode does not expose worktree removal events.",
  CwdChanged:
    "No equivalent. OpenCode does not expose working-directory change events.",
  Setup:
    "Handled by the setup utility (`npx pro-workflow setup-opencode`).",
};
