import { Routes, Route, Link } from "react-router-dom";
import Snapshot from "./pages/Snapshot.js";
import Timeseries from "./pages/Timeseries.js";

export default function App() {
  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <Link to="/">Snapshot</Link>
        <Link to="/route">Route</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Snapshot />} />
        <Route path="/route" element={<Timeseries />} />
      </Routes>
    </div>
  );
}
