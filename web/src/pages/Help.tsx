export default function Help() {
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-lg font-semibold mb-1">LI.FI Quote Tracker</h1>
        <p className="text-sm text-[--color-muted-foreground]">
          Tracks how lifiIntents quotes rank against all competing bridges on each route, size, and chain pair.
        </p>
      </div>

      <div className="space-y-6">
        <Step n={1} title="Set up environment">
          <p>Create a <code className={mono}>.env</code> file in the repo root with your LI.FI API key. Without it, the collector is rate limited to 100 RPM and will fail mid-run:</p>
          <CodeBlock>{`NEXT_PUBLIC_LIFI_API_KEY=your-key-here
INTEGRATOR_STRING=li.fi-solver`}</CodeBlock>
          <p>The UI itself doesn't need the key — only the collector does when fetching quotes from the LI.FI API.</p>
        </Step>

        <Step n={2} title="Start the UI">
          <p>Open two terminals from the repo root and run one command in each:</p>
          <CodeBlock>{`# Terminal 1 — API server (port 5174, reads the DB)
pnpm serve

# Terminal 2 — Vite frontend (port 5173)
pnpm web`}</CodeBlock>
          <p>Then open <strong>http://localhost:5173</strong>.</p>
        </Step>

        <Step n={3} title="Collect quotes">
          <p>Run the collector to pull fresh quotes from the LI.FI API. Each run calls <code className={mono}>getRoutes</code> once per route — the lifiIntents offer is extracted from the results and compared against all other bridges.</p>
          <CodeBlock>{`# Pull all 84 routes (~3 min)
pnpm pull:daily

# Pull a specific route
pnpm pull:adhoc -- --pair USDC-USDC --from-chain 8453 --to-chain 42161 --size 100

# Fan out over all sizes for a pair/route
pnpm pull:adhoc -- --pair ETH-ETH --from-chain 1 --to-chain 8453

# Fan out over all chains for a pair + size
pnpm pull:adhoc -- --pair USDC-USDC --size 1000`}</CodeBlock>
          <p>Results are written to <code className={mono}>db/quotes.db</code>. Refresh the UI to see them.</p>
        </Step>

        <Step n={4} title="Read the Snapshot">
          <p>One row per (pair, route, size) for the selected run:</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Rank</strong> — where lifiIntents finished among all bridges by gross output. <span className="text-[--color-accent] font-semibold">#1</span> = intent won.</li>
            <li><strong>Δ bps</strong> — basis points lifiIntents trails the best offer. 0 = tied for best.</li>
            <li><strong>Intent quote</strong> — the lifiIntents output amount.</li>
            <li><strong>Best quote</strong> — the output amount of the best offer (lifiIntents or otherwise).</li>
            <li><strong>Best tool</strong> — the bridge that returned the best output.</li>
            <li><strong>Alts</strong> — number of non-lifiIntents offers in the comparison pool.</li>
          </ul>
          <p className="mt-2">If lifiIntents isn't offered on a route (e.g. USDT-USDT, most ETH-ETH routes), Rank and Δ bps are empty but Best quote / Best tool are still populated from the alternatives.</p>
          <p>Use the Pair / Route / Size filters to narrow the table. Click <strong>chart →</strong> to open the timeseries for any row.</p>
        </Step>

        <Step n={5} title="Read the Timeseries">
          <p>Shows a single (pair, route, size) over time — useful after multiple daily runs:</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Output amount</strong> — lifiIntents output vs best alternative. Divergence = intent is losing on this route.</li>
            <li><strong>Rank</strong> — step chart of lifiIntents rank. Lower is better. Sustained rank &gt; 1 means a bridge consistently beats intent.</li>
          </ul>
          <p className="mt-2">Use the size selector to switch between amount sweeps for the same pair and route.</p>
        </Step>

        <Step n={6} title="Resetting the database">
          <p>To start fresh, always stop the server first — it holds the DB file open and won't see a new file until restarted:</p>
          <CodeBlock>{`# 1. Stop the server (ctrl+C in Terminal 1)
# 2. Delete the DB
rm -f db/quotes.db db/quotes.db-shm db/quotes.db-wal
# 3. Collect fresh data
pnpm pull:daily
# 4. Restart the server
pnpm serve`}</CodeBlock>
        </Step>
      </div>

      <Section title="Configured routes">
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Chains</strong>: Ethereum (1), Base (8453), Arbitrum (42161)</li>
          <li><strong>Pairs</strong>: USDC-USDC, USDT-USDT, ETH-ETH, WETH-ETH</li>
          <li><strong>Sizes</strong>: stables at 10 / 100 / 1,000 / 10,000 · ETH/WETH at 0.01 / 0.1 / 1</li>
          <li><strong>Total</strong>: 84 routes per daily run · ~3 min at 1 req/s</li>
        </ul>
        <p className="mt-2">Edit <code className={mono}>config.json</code> at the repo root to change the matrix.</p>
      </Section>
    </div>
  );
}

const mono = "font-mono text-xs bg-[--color-muted] px-1 py-0.5 rounded";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[--color-accent]/10 border border-[--color-accent]/30 flex items-center justify-center">
        <span className="text-xs font-semibold font-mono text-[--color-accent]">{n}</span>
      </div>
      <div className="flex-1 space-y-2 pt-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="text-sm text-[--color-foreground] space-y-2">{children}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[--color-muted-foreground] border-b border-[--color-border] pb-1">
        {title}
      </h2>
      <div className="text-sm text-[--color-foreground] space-y-2">{children}</div>
    </section>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-[--color-muted] border border-[--color-border] rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}
