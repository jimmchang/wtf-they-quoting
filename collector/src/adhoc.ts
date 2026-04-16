import { Command } from "commander";
import { loadConfig } from "./config.js";
import { expandRoutes } from "./routes.js";
import { openDb } from "./db.js";
import { createTokenResolver } from "./tokens.js";
import { fetchIntent, fetchAlternatives } from "./lifi.js";
import { runMatrix } from "./runner.js";
import type { RouteFilter } from "./routes.js";

// pnpm script forwarding inserts a bare "--" into argv; strip it so Commander
// sees the flags correctly (e.g. pnpm pull:adhoc -- --pair USDC-USDC ...).
const argv = process.argv.filter(a => a !== "--");

const program = new Command()
  .option("--from-chain <n>", "source chainId", v => Number(v))
  .option("--to-chain <n>",   "dest chainId",   v => Number(v))
  .option("--pair <name>",    "asset pair name (e.g. USDC-USDC)")
  .option("--size <n>",       "human-readable size", v => Number(v))
  .parse(argv);

const o = program.opts<{ fromChain?: number; toChain?: number; pair?: string; size?: number }>();
const filter: RouteFilter = { fromChain: o.fromChain, toChain: o.toChain, pair: o.pair, size: o.size };

const cfg = loadConfig(new URL("../../config.json", import.meta.url).pathname);
const routes = expandRoutes(cfg, filter);
if (routes.length === 0) { console.error("no routes match those filters"); process.exit(2); }

const db = openDb(new URL("../../db/quotes.db", import.meta.url).pathname);
const resolver = createTokenResolver();
const opts = { slippage: cfg.defaultSlippage, timeoutMs: cfg.quoteTimeoutMs };

console.log(`adhoc run: ${routes.length} requests`);
const summary = await runMatrix({
  db, routes, runKind: "adhoc", rateLimitRps: cfg.rateLimitRps,
  resolveToken: (c, s) => resolver.resolve(c, s),
  fetchIntent: r => fetchIntent(r, resolver, opts),
  fetchAlternatives: r => fetchAlternatives(r, resolver, { ...opts, topN: cfg.alternativesTopN }),
  onProgress: (d, t) => process.stdout.write(`\r${d}/${t}  `),
});
console.log(`\n${summary.runId}: ok=${summary.ok} partial=${summary.partial} err=${summary.err} ${summary.wallMs}ms`);
