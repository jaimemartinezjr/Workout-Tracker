import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ProgressCharts from "../client/ProgressCharts";
import "../client/styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Progress overview test root is missing.");
}

createRoot(root).render(
  <StrictMode>
    <main className="workout-account-layout">
      <ProgressCharts
        getToken={async () => "progress-overview-test-token"}
        weightUnit="lb"
        distanceUnit="mi"
        refreshKey={0}
      />
    </main>
  </StrictMode>,
);
