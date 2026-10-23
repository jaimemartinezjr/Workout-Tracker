import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Workouts from "../client/Workouts";
import "../client/styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Workout responsive test root is missing.");
}

createRoot(root).render(
  <StrictMode>
    <div className="app-shell">
      <main className="workout-account-layout">
        <Workouts
          getToken={async () => "responsive-test-token"}
          weightUnit="kg"
          distanceUnit="km"
          onWeightUnitChange={async () => undefined}
          onDistanceUnitChange={async () => undefined}
        />
      </main>
    </div>
  </StrictMode>,
);
