import { createRoot } from "react-dom/client";
import PerfApp from "./perf-app";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(<PerfApp />);
}