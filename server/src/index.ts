import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import { buildApp } from "./handlers.js";

const dbPath = new URL("../../db/quotes.db", import.meta.url).pathname;
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const app = buildApp(db);
const PORT = Number(process.env.PORT ?? 5174);
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: PORT }, i =>
  console.log(`server: http://127.0.0.1:${i.port}`)
);
