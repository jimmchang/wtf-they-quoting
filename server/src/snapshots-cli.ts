import Database from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateSnapshots } from "./snapshots.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const dbPath = join(repoRoot, "db", "quotes.db");
const outDir = join(repoRoot, "web", "public", "data");

if (!existsSync(dbPath)) {
  console.warn(`[snapshots] db not found at ${dbPath}, writing empty stubs`);
  mkdirSync(join(outDir, "snapshot"), { recursive: true });
  writeFileSync(join(outDir, "runs.json"), JSON.stringify({ runs: [] }));
  writeFileSync(join(outDir, "routes.json"), JSON.stringify({ routes: [] }));
  writeFileSync(join(outDir, "snapshot", "latest.json"), JSON.stringify({ runId: "", rows: [] }));
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
generateSnapshots(db, outDir);
console.log(`[snapshots] wrote ${outDir}`);
