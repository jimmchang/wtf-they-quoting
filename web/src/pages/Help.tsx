export default function Help() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold mb-1">How to use LI.FI Quote Tracker</h1>
        <p className="text-sm text-[--color-muted-foreground]">
          A local tool for tracking how LI.FI's intent quotes rank against alternative routes over time.
        </p>
      </div>

      <Section title="Collecting data">
        <p>There are two collector scripts. Run them from the repo root:</p>
        <CodeBlock>{`# Pull all 84 routes (3 chains × 4 pairs × sizes) — takes ~3 min
pnpm pull:daily

# Pull a specific route ad-hoc
pnpm pull:adhoc -- --pair USDC-USDC --from-chain 1 --to-chain 8453 --size 100

# Fan out over all sizes for a pair
pnpm pull:adhoc -- --pair ETH-ETH --from-chain 1 --to-chain 42161

# Fan out over all chains for a pair + size
pnpm pull:adhoc -- --pair USDT-USDT --size 1000`}</CodeBlock>
        <p className="mt-2">
          Each run fetches two quotes per route: an <strong>intent quote</strong> (via{" "}
          <code className="font-mono text-xs bg-[--color-muted] px-1 py-0.5 rounded">@lifi/cli</code>) and an{" "}
          <strong>alternatives list</strong> (via <code className="font-mono text-xs bg-[--color-muted] px-1 py-0.5 rounded">@lifi/sdk getRoutes</code>).
          Results are stored in <code className="font-mono text-xs bg-[--color-muted] px-1 py-0.5 rounded">db/quotes.db</code>.
        </p>
      </Section>

      <Section title="Starting the UI">
        <p>Open two terminals from the repo root:</p>
        <CodeBlock>{`# Terminal 1 — API server (port 5174)
pnpm server

# Terminal 2 — Vite dev server (port 5173)
pnpm web`}</CodeBlock>
        <p className="mt-2">Then open <strong>http://localhost:5173</strong>.</p>
      </Section>

      <Section title="Resetting the database">
        <p>To start fresh with clean data, follow this order:</p>
        <ol className="list-decimal list-inside space-y-1 mt-2 text-sm">
          <li><strong>Stop the server</strong> (ctrl+C in the server terminal)</li>
          <li><strong>Delete the DB files</strong></li>
          <li><strong>Run the collector</strong> to populate fresh data</li>
          <li><strong>Restart the server</strong></li>
        </ol>
        <CodeBlock className="mt-3">{`rm -f db/quotes.db db/quotes.db-shm db/quotes.db-wal
pnpm pull:daily
pnpm server`}</CodeBlock>
        <p className="mt-2 text-[--color-muted-foreground]">
          <strong>Why this order matters:</strong> the server opens <code className="font-mono text-xs bg-[--color-muted] px-1 py-0.5 rounded">quotes.db</code> at startup and holds the file open for the lifetime of the process. If you delete the DB while the server is running, the server keeps reading the old deleted file — new data written by the collector goes into a new file the server doesn't know about. Always stop the server before deleting.
        </p>
      </Section>

      <Section title="Snapshot page">
        <p>
          Shows every route from the selected run — one row per (pair, route, size) — with:
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2 text-sm">
          <li><strong>Rank</strong> — where the intent quote finished among all offers, sorted by output amount. <span className="text-[--color-accent] font-medium">#1</span> = intent won.</li>
          <li><strong>Δ bps</strong> — how many basis points the intent output trails the best offer. 0 = tied for best.</li>
          <li><strong>Intent tool / Best tool</strong> — which bridge or aggregator powered each quote.</li>
          <li><strong>Status</strong> — <code className="font-mono text-xs bg-[--color-muted] px-1 py-0.5 rounded">ok</code> both calls succeeded · <code className="font-mono text-xs bg-[--color-muted] px-1 py-0.5 rounded">partial</code> one call failed · <code className="font-mono text-xs bg-[--color-muted] px-1 py-0.5 rounded">error</code> both failed.</li>
        </ul>
        <p className="mt-2">Click <strong>chart →</strong> on any row to open the timeseries for that route.</p>
        <p className="mt-2">Use the run selector in the top right to switch between historical runs.</p>
      </Section>

      <Section title="Timeseries page">
        <p>Two charts for a single (pair, route, size) over time:</p>
        <ul className="list-disc list-inside space-y-1 mt-2 text-sm">
          <li><strong>Output amount</strong> — intent output (green) vs best alternative (red dashed). Divergence = intent is losing on this route.</li>
          <li><strong>Rank</strong> — step chart of intent rank. Lower = better. Sustained rank &gt; 1 means something consistently beats intent.</li>
        </ul>
        <p className="mt-2">Use the size selector to switch between amount sweeps for the same route pair.</p>
      </Section>

      <Section title="Using /quote in Claude Code">
        <p>
          Inside this repo, Claude Code has a <code className="font-mono text-xs bg-[--color-muted] px-1 py-0.5 rounded">/quote</code> slash command that translates natural language into collector invocations:
        </p>
        <CodeBlock>{`/quote pull USDC from Ethereum to Base at 1000
/quote run daily
/quote ETH to Arbitrum, 0.1 ETH`}</CodeBlock>
      </Section>

      <Section title="Configured routes">
        <p>The route matrix is defined in <code className="font-mono text-xs bg-[--color-muted] px-1 py-0.5 rounded">config.json</code> at the repo root:</p>
        <ul className="list-disc list-inside space-y-1 mt-2 text-sm">
          <li><strong>Chains</strong>: Ethereum (1), Base (8453), Arbitrum (42161)</li>
          <li><strong>Pairs</strong>: USDC-USDC, USDT-USDT, ETH-ETH, WETH-ETH</li>
          <li><strong>Sizes</strong>: stables at 10 / 100 / 1,000 / 10,000 · ETH/WETH at 0.01 / 0.1 / 1</li>
          <li><strong>Total</strong>: 84 routes per daily run · ~3 min at 1 req/s</li>
        </ul>
      </Section>
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

function CodeBlock({ children, className }: { children: string; className?: string }) {
  return (
    <pre className={`bg-[--color-muted] border border-[--color-border] rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre${className ? ` ${className}` : ""}`}>
      {children}
    </pre>
  );
}
