import { Routes, Route, Link, useLocation } from "react-router-dom";
import { cn } from "./lib/utils.js";
import Snapshot from "./pages/Snapshot.js";
import Timeseries from "./pages/Timeseries.js";
import Help from "./pages/Help.js";

export default function App() {
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-[--color-background] text-[--color-foreground]">
      <header className="border-b border-[--color-border] px-6 py-3 flex items-center gap-8">
        <span className="font-mono text-sm font-medium text-[--color-accent] tracking-widest uppercase">
          LI.FI / Quote Tracker
        </span>
        <nav className="flex gap-6">
          <Link
            to="/"
            className={cn(
              "text-sm transition-colors",
              loc.pathname === "/"
                ? "text-[--color-foreground] font-medium"
                : "text-[--color-muted-foreground] hover:text-[--color-foreground]"
            )}
          >
            Snapshot
          </Link>
          <Link
            to="/route"
            className={cn(
              "text-sm transition-colors",
              loc.pathname === "/route"
                ? "text-[--color-foreground] font-medium"
                : "text-[--color-muted-foreground] hover:text-[--color-foreground]"
            )}
          >
            Timeseries
          </Link>
          <Link
            to="/help"
            className={cn(
              "text-sm transition-colors",
              loc.pathname === "/help"
                ? "text-[--color-foreground] font-medium"
                : "text-[--color-muted-foreground] hover:text-[--color-foreground]"
            )}
          >
            Help
          </Link>
        </nav>
      </header>
      <main className="px-6 py-6">
        <Routes>
          <Route path="/" element={<Snapshot />} />
          <Route path="/route" element={<Timeseries />} />
          <Route path="/help" element={<Help />} />
        </Routes>
      </main>
    </div>
  );
}
