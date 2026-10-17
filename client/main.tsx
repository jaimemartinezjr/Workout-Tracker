import { ClerkProvider } from "@clerk/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The app root element is missing.");
}

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  createRoot(rootElement).render(
    <main className="setup-screen">
      <div className="setup-card">
        <span className="eyebrow">SETUP REQUIRED</span>
        <h1>Connect your sign-in provider</h1>
        <p>
          Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> to your environment, then
          restart the app. Keep your Clerk secret key and database URL on the
          server only.
        </p>
      </div>
    </main>,
  );
} else {
  createRoot(rootElement).render(
    <ClerkProvider publishableKey={publishableKey}>
      <App />
    </ClerkProvider>,
  );
}
