import { readFileSync } from "node:fs";
import { z } from "zod";
import type { AppConfig } from "./types.js";

const Schema = z.object({
  chains: z.array(z.number().int().positive()).min(2),
  assetPairs: z.array(z.object({
    name: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    sizes: z.array(z.number().positive()).min(1),
  })).min(1),
  crossChainOnly: z.boolean(),
  rateLimitRps: z.number().positive(),
  defaultSlippage: z.number().min(0).max(0.5),
  quoteTimeoutMs: z.number().int().positive(),
  alternativesTopN: z.number().int().positive(),
});

export const parseConfig = (raw: unknown): AppConfig => Schema.parse(raw) as AppConfig;
export const loadConfig = (path: string): AppConfig =>
  parseConfig(JSON.parse(readFileSync(path, "utf8")));
