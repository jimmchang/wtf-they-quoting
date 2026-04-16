import { resolve } from "node:path";

export function setup() {
  // Tests use process.cwd() + "db/schema.sql" — cwd must be repo root
  process.chdir(resolve(import.meta.dirname, "../.."));
}
