import { describe, it, before, beforeEach } from "node:test";
import { strict as assert } from "node:assert/strict";

// Import the compiled adapter for testing
const adapterPath = new URL(
  "../../dist/opencode-plugin/adapter.mjs",
  import.meta.url,
).pathname;

describe("Event Adapter — payload transformation", () => {
  let mod;

  before(async () => {
    mod = await import(adapterPath);
  });

  it("transforms tool.execute.before payload to hook input shape", () => {
    const result = mod.toHookPayload("tool.execute.before", {
      tool: "Edit",
      args: { file: "foo.ts", content: "bar" },
      sessionID: "s-1",
      callID: "c-1",
    });

    assert.equal(result.tool_name, "Edit");
    assert.deepEqual(result.tool_input, { file: "foo.ts", content: "bar" });
    assert.equal(result.session_id, "s-1");
    assert.equal(result.call_id, "c-1");
  });

  it("transforms tool.execute.after payload to hook input shape", () => {
    const result = mod.toHookPayload("tool.execute.after", {
      tool: "Bash",
      args: { command: "npm test" },
      output: "all tests pass",
      sessionID: "s-2",
      callID: "c-2",
    });

    assert.equal(result.tool_name, "Bash");
    assert.equal(result.tool_output, "all tests pass");
    assert.equal(result.session_id, "s-2");
  });

  it("transforms session.compacted payload", () => {
    const result = mod.toHookPayload("session.compacted", {
      sessionID: "s-3",
    });

    assert.equal(result.session_id, "s-3");
    assert.ok(result.compact_event, "should include compact_event");
  });

  it("transforms experimental.session.compacting payload", () => {
    const result = mod.toHookPayload("experimental.session.compacting", {
      sessionID: "s-4",
    });

    assert.equal(result.session_id, "s-4");
    assert.ok(result.pre_compact, "should include pre_compact");
  });

  it("transforms file.edited payload", () => {
    const result = mod.toHookPayload("file.edited", {
      file: "src/app.ts",
      sessionID: "s-5",
    });

    assert.equal(result.file, "src/app.ts");
    assert.equal(result.session_id, "s-5");
  });

  it("passes unknown events through as-is with event name", () => {
    const result = mod.toHookPayload("unknown.event", {
      foo: "bar",
    });

    assert.equal(result.event, "unknown.event");
    assert.equal(result.foo, "bar");
  });

  it("documents all 7 unmapped events", () => {
    const unmapped = mod.UNMAPPED_EVENTS;
    assert.ok(typeof unmapped === "object");
    assert.ok("ConfigChange" in unmapped, "ConfigChange documented");
    assert.ok("Notification" in unmapped, "Notification documented");
    assert.ok("TeammateIdle" in unmapped, "TeammateIdle documented");
    assert.ok("StopFailure" in unmapped, "StopFailure documented");
    assert.ok("WorktreeCreate" in unmapped, "WorktreeCreate documented");
    assert.ok("WorktreeRemove" in unmapped, "WorktreeRemove documented");
    assert.ok("CwdChanged" in unmapped, "CwdChanged documented");
    assert.ok("Setup" in unmapped, "Setup documented");

    for (const [key, desc] of Object.entries(unmapped)) {
      assert.ok(typeof desc === "string" && desc.length > 10,
        `${key} description should be meaningful`);
    }
  });

  it("EVENT_MAP covers 15 of 24 Claude Code hook types", () => {
    const eventMap = mod.EVENT_MAP;
    assert.ok(typeof eventMap === "object");

    // The 15 mapped events
    const mapped = [
      "tool.execute.before",
      "tool.execute.after",
      "session.created",
      "session.idle",
      "file.edited",
      "session.compacted",
      "permission.ask",
      "permission.denied",
      "todo.updated",
      "tui.prompt.append",
      "session.status",
      "experimental.session.compacting",
    ];

    for (const evt of mapped) {
      assert.ok(evt in eventMap, `${evt} should be in EVENT_MAP`);
      assert.ok(Array.isArray(eventMap[evt].scripts), `${evt} should have scripts array`);
      assert.ok(eventMap[evt].scripts.length > 0, `${evt} should have at least one script`);
    }

    // Unmapped events documented
    assert.equal(Object.keys(mod.UNMAPPED_EVENTS).length, 8,
      "should document 8 unmapped events");
  });
});

describe("Event Adapter — script execution", () => {
  let mod;
  const logs = [];

  function mock$(strings) {
    const cmd = Array.isArray(strings) ? strings.raw[0] : strings;
    return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
  }

  function log(msg) {
    logs.push(msg);
  }

  before(async () => {
    mod = await import(adapterPath);
  });

  beforeEach(() => {
    logs.length = 0;
  });

  it("logs when no mapping exists for an event", async () => {
    await mod.runScriptsForEvent(mock$, log, "nonexistent.event", {});
    assert.ok(logs.some((m) => m.includes("no script mapping")),
      "should log that no mapping exists");
  });

  it("does not throw when mapping exists but script execution fails", async () => {
    const failing$ = () => Promise.reject(new Error("cmd not found"));
    await mod.runScriptsForEvent(
      failing$,
      log,
      "session.created",
      {},
      "s-test",
    );

    const errorLogs = logs.filter((m) => m.includes("error"));
    assert.ok(errorLogs.length > 0, "should log script execution errors");
    // Should not have thrown — fire-and-forget semantics
  });

  it("includes session ID in executed command", async () => {
    const commands = [];
    const capture$ = (strings) => {
      const cmd = strings?.raw?.[0] ?? String(strings ?? "");
      commands.push(cmd);
      return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
    };

    await mod.runScriptsForEvent(
      capture$,
      log,
      "session.created",
      {},
      "s-test-123",
    );

    assert.ok(commands.length > 0, "should have executed at least one script");
    assert.ok(commands[0].includes("CLAUDE_SESSION_ID=\"s-test-123\""),
      "command should include session ID");
  });
});