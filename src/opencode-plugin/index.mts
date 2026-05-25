import type { Plugin, Hooks, PluginModule } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import type { Store } from "../db/store.js";
import { createStore } from "../db/store.js";
import { pwSearch, pwLearn, pwWikiQuery } from "./tools.mjs";
import { runScriptsForEvent } from "./adapter.mjs";

let _store: Store | null = null;

function getOrCreateStore(): Store {
  if (!_store) {
    _store = createStore();
  }
  return _store;
}

function getStoreState(): Store | null {
  return _store;
}

type LogFn = (msg: string) => void;

function safeLog(log: LogFn, msg: string): void {
  try {
    log(msg);
  } catch {
    /* noop — client.app.log can be absent or throw in test environments */
  }
}

export const ProWorkflow: Plugin = async (input): Promise<Hooks> => {
  const log: LogFn = (msg: string) => {
    try {
      const client = input.client;
      (client as any).app?.log?.(msg);
    } catch {
      /* noop */
    }
  };

  const $ = input.$;
  const project = input.project;

  async function handleEvent(
    eventName: string,
    payload: Record<string, unknown>,
    sessionID?: string,
  ): Promise<void> {
    try {
      getOrCreateStore();
      safeLog(log, `ProWorkflow: ${eventName}`);
      await runScriptsForEvent($, log, eventName, payload, sessionID);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      safeLog(log, `ProWorkflow: ${eventName} handler error: ${message}`);
    }
  }

  return {
    event: async ({ event }: { event: Event }): Promise<void> => {
      await handleEvent(
        event.type,
        event as unknown as Record<string, unknown>,
      );
    },

    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: any },
    ): Promise<void> => {
      await handleEvent("tool.execute.before", {
        tool: input.tool,
        args: output.args,
        sessionID: input.sessionID,
        callID: input.callID,
      }, input.sessionID);
    },

    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any },
    ): Promise<void> => {
      await handleEvent("tool.execute.after", {
        tool: input.tool,
        args: input.args ?? {},
        output: output.output ?? "",
        sessionID: input.sessionID,
        callID: input.callID,
      }, input.sessionID);
    },

    "shell.env": async (
      input: { cwd: string; sessionID?: string; callID?: string },
      output: { env: Record<string, string> },
    ): Promise<void> => {
      // Inject pro-workflow env vars into shell environment
      try {
        getOrCreateStore();
        safeLog(log, "ProWorkflow: shell.env — injecting project vars");
        output.env["PRO_WORKFLOW_ROOT"] = input.cwd;
        output.env["PRO_WORKFLOW_PROJECT"] = project?.id ?? "";
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        safeLog(log, `ProWorkflow: shell.env error: ${message}`);
      }
    },

    "permission.ask": async (input, output): Promise<void> => {
      await handleEvent("permission.ask", {
        ...(input as Record<string, unknown>),
      });
    },

    "experimental.session.compacting": async (
      input: { sessionID: string },
      output: { context: string[]; prompt?: string },
    ): Promise<void> => {
      await handleEvent("experimental.session.compacting", {
        sessionID: input.sessionID,
      }, input.sessionID);
    },

    tool: {
      "pw-search": pwSearch,
      "pw-learn": pwLearn,
      "pw-wiki-query": pwWikiQuery,
    },
  };
};

const pluginModule: PluginModule = { server: ProWorkflow };
export default pluginModule;

export { getOrCreateStore, getStoreState };
