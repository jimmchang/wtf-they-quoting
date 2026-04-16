---
name: quote
description: Pull LI.FI intent quotes and compare to alternatives for tracked routes. Invoke when the user asks to "pull quotes", "run daily", "quote X from Y to Z", "how does lifi do on ETH to Base", or similar requests about LI.FI quote quality.
---

# /quote — LI.FI intent quote runner

Fetches LI.FI intent quotes and compares them to alternative routes. Stores results in SQLite and reports the intent's rank among alternatives plus the output delta.

## When to invoke
- "pull today's quotes" / "run daily" → `pnpm pull:daily`
- "quote <size> <asset> from <chain> to <chain>" → `pnpm pull:adhoc -- --pair <PAIR> --from-chain <id> --to-chain <id> --size <n>`
- "quote <asset> every direction at <size>" → `pnpm pull:adhoc -- --pair <PAIR> --size <n>`
- "quote everything at <size>" → `pnpm pull:adhoc -- --size <n>`
- "how is LI.FI doing on <route>" → run adhoc for that route, report rank + delta

## Chain IDs
| Chain     | ID    |
|-----------|-------|
| Ethereum  | 1     |
| Base      | 8453  |
| Arbitrum  | 42161 |

## Asset pair names (must match config.json exactly)
- `USDC-USDC` — USDC cross-chain
- `USDT-USDT` — USDT cross-chain
- `ETH-ETH` — native ETH cross-chain
- `WETH-ETH` — WETH source to native ETH dest

## Procedure
1. Parse the user's intent into one of the commands above.
2. If pair or size is ambiguous, ask **one** clarifying question before running.
3. Run via Bash from the repo root. Capture stdout.
4. Report back:
   - `run_id`, ok/partial/err counts, wall time
   - For single-route runs: intent rank, delta_bps, intent tool, best tool
   - Chart URL: `http://localhost:5173/route?pair=<P>&from=<F>&to=<T>&size=<S>`
5. Never edit files. This skill is run-only.

## Output interpretation
- **Rank #1**: LI.FI intent is the best offer. 
- **Rank #2–3**: Competitive, small delta.
- **Rank #4+**: LI.FI intent is being beaten by multiple alternatives.
- **delta_bps**: basis points behind the best offer (0 = tied for best).

## Examples

| User says | Command |
|-----------|---------|
| "pull quotes for today" | `pnpm pull:daily` |
| "quote 5k USDC from Ethereum to Base" | `pnpm pull:adhoc -- --pair USDC-USDC --from-chain 1 --to-chain 8453 --size 5000` |
| "quote 1 ETH everywhere" | `pnpm pull:adhoc -- --pair ETH-ETH --size 1` |
| "quote WETH to ETH at 0.1 ETH" | `pnpm pull:adhoc -- --pair WETH-ETH --size 0.1` |
| "how does LI.FI do on USDC Arb to Base" | `pnpm pull:adhoc -- --pair USDC-USDC --from-chain 42161 --to-chain 8453 --size 1000` |
| "run everything at 100 USDC" | `pnpm pull:adhoc -- --size 100` |
