import { loadConfig } from "./config.js";
import { expandRoutes } from "./routes.js";
import { openDb } from "./db.js";
import { createTokenResolver } from "./tokens.js";
import { fetchIntent, fetchAlternatives } from "./lifi.js";
import { runMatrix } from "./runner.js";

const cfg = loadConfig(new URL("../../config.json", import.meta.url).pathname);
const db = openDb(new URL("../../db/quotes.db", import.meta.url).pathname);
const resolver = createTokenResolver();
const routes = expandRoutes(cfg);
const opts = { slippage: cfg.defaultSlippage, timeoutMs: cfg.quoteTimeoutMs };

console.log(`daily run: ${routes.length} requests × 2 calls each`);
const summary = await runMatrix({
  db, routes, runKind: "daily", rateLimitRps: cfg.rateLimitRps,
  resolveToken: (c, s) => resolver.resolve(c, s),
  fetchIntent: r => fetchIntent(r, resolver, opts),
  fetchAlternatives: r => fetchAlternatives(r, resolver, { ...opts, topN: cfg.alternativesTopN }),
  onProgress: (d, t) => process.stdout.write(`\r${d}/${t}  `),
});
console.log(`\n${summary.runId}: ok=${summary.ok} partial=${summary.partial} err=${summary.err} ${summary.wallMs}ms`);
