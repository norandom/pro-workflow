import { describe, it, before, beforeEach, after } from "node:test";
import { strict as assert } from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build an in-memory FTS5-backed database with the learnings schema and populate
 * it with sample rows.  This mirrors the production setup in `src/db/store.ts`
 * so that `searchLearnings()` can run unmodified.
 */
function createTestDb() {
  const schemaRelative = path.resolve(__dirname, "..", "db", "schema.sql");
  const candidates = [
    path.resolve(__dirname, "../../dist/db/schema.sql"),
    path.resolve(__dirname, "../../src/db/schema.sql"),
    schemaRelative,
  ];
  const schemaPath = candidates.find((p) => fs.existsSync(p));
  if (!schemaPath) {
    throw new Error(`schema.sql not found. Candidates: ${candidates.join(", ")}`);
  }

  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  // Seed a few learnings so FTS5 returns something
  db.exec(`
    INSERT INTO learnings (project, category, rule, mistake, correction) VALUES
      ('test-proj', 'python', 'Always use virtualenv', 'Used system python', 'Run: python -m venv .venv'),
      ('test-proj', 'git', 'Write meaningful commit messages', 'msg: fix', 'Use conventional commits'),
      (NULL, 'security', 'Never hardcode secrets', 'API key in source', 'Use env vars')
  `);

  return db;
}

describe("pw-search tool", () => {
  let db;
  let pwSearch;
  let mod;

  before(async () => {
    db = createTestDb();

    // Dynamically import the compiled tool and inject the test store
    mod = await import(
      path.resolve(__dirname, "../../dist/opencode-plugin/tools.mjs")
    );

    if (typeof mod.__setTestStore !== "function") {
      throw new Error("tools.mjs must export __setTestStore(store) for test injection");
    }

    // Provide a Store-shaped object that wraps the in-memory db
    mod.__setTestStore({
      db,
      close() {},
      searchWiki(query, opts) {
        return [];
      },
    });

    pwSearch = mod.pwSearch;
  });

  after(() => {
    if (db) db.close();
    mod.__setTestStore(null);
  });

  it("REQ 9.2: returns markdown table of learning results for a text query", async () => {
    const result = await pwSearch.execute({ query: "virtualenv", limit: 10 }, {
      sessionID: "s1",
      messageID: "m1",
      agent: "test",
      directory: "/tmp",
      worktree: "/tmp",
      abort: new AbortController().signal,
    });

    const output = typeof result === "string" ? result : result.output;
    assert.ok(output.includes("virtualenv"), "should mention the matched learning");
    assert.ok(output.includes("Learnings"), "should have a 'Learnings' section");
    assert.ok(output.includes("|"), "should contain markdown table bars");
  });

  it("respects the limit parameter", async () => {
    // Use a broad query that matches multiple rows (3 seeded learnings)
    const result = await pwSearch.execute({ query: "use", limit: 2 }, {
      sessionID: "s1",
      messageID: "m1",
      agent: "test",
      directory: "/tmp",
      worktree: "/tmp",
      abort: new AbortController().signal,
    });

    const output = typeof result === "string" ? result : result.output;
    const lines = output.split("\n").filter((l) => l.match(/^\| \d+ \|/));
    assert.ok(lines.length <= 2, `expected ≤ 2 result rows, got ${lines.length}`);
  });

  it("filters by category when provided", async () => {
    const result = await pwSearch.execute({ query: "git", category: "python", limit: 10 }, {
      sessionID: "s1",
      messageID: "m1",
      agent: "test",
      directory: "/tmp",
      worktree: "/tmp",
      abort: new AbortController().signal,
    });

    const output = typeof result === "string" ? result : result.output;
    // "virtualenv" learning has category="python", "commit" learning has category="git"
    // With category filter "python", we should NOT see the git rule
    assert.ok(
      !output.toLowerCase().includes("commit message"),
      "should not include git-category result when filtering for python"
    );
  });

  it("returns empty message when no results found", async () => {
    const result = await pwSearch.execute({ query: "zzzznonexistentpattern", limit: 10 }, {
      sessionID: "s1",
      messageID: "m1",
      agent: "test",
      directory: "/tmp",
      worktree: "/tmp",
      abort: new AbortController().signal,
    });

    const output = typeof result === "string" ? result : result.output;
    assert.ok(output.includes("No results"), "should indicate no results found");
  });

  it("REQ 11.2: returns within 200ms for a normal-sized query", async () => {
    const start = Date.now();
    await pwSearch.execute({ query: "virtualenv", limit: 10 }, {
      sessionID: "s1",
      messageID: "m1",
      agent: "test",
      directory: "/tmp",
      worktree: "/tmp",
      abort: new AbortController().signal,
    });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 200, `expected < 200ms, took ${elapsed}ms`);
  });
});
