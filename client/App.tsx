import { useEffect, useState } from "react";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/react";
import Workouts from "./Workouts";

type Account = {
  id: string;
  email: string;
  weight_unit: "kg" | "lb";
  distance_unit: "km" | "mi";
  created_at: string;
};

function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState("");

  const updatePreferences = async (
    preferences: Partial<Pick<Account, "weight_unit" | "distance_unit">>,
  ) => {
    const token = await getToken();
    const response = await fetch("/api/me/preferences", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(preferences),
    });
    const payload = (await response.json()) as {
      user?: Account;
      error?: string;
    };
    if (!response.ok || !payload.user) {
      throw new Error(payload.error ?? "Your weight unit couldn't be updated.");
    }
    setAccount((current) =>
      current ? { ...current, ...preferences } : payload.user!,
    );
  };

  useEffect(() => {
    let isCurrent = true;

    async function loadAccount() {
      if (!isLoaded || !isSignedIn) {
        setAccount(null);
        setAccountError("");
        return;
      }

      try {
        const token = await getToken();
        const response = await fetch("/api/me", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        const payload = (await response.json()) as {
          user?: Account;
          error?: string;
        };

        if (!response.ok || !payload.user) {
          throw new Error(payload.error ?? "Your account could not be loaded.");
        }

        if (isCurrent) {
          setAccount(payload.user);
          setAccountError("");
        }
      } catch (error) {
        if (isCurrent) {
          setAccountError(
            error instanceof Error
              ? error.message
              : "Your account could not be loaded. Please try again.",
          );
        }
      }
    }

    void loadAccount();

    return () => {
      isCurrent = false;
    };
  }, [getToken, isLoaded, isSignedIn]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Stride and Strength home">
          <span className="brand-mark">S</span>
          <span>STRIDE <b>&</b> STRENGTH</span>
        </a>
        <Show when="signed-out">
          <nav className="auth-actions" aria-label="Account">
            <SignInButton mode="modal">
              <button className="button button-quiet" type="button">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="button button-primary" type="button">
                Create account
              </button>
            </SignUpButton>
          </nav>
        </Show>
        <Show when="signed-in">
          <div className="signed-in-nav">
            <span className="account-label">YOUR ACCOUNT</span>
            <UserButton />
          </div>
        </Show>
      </header>

      {!isLoaded ? (
        <main className="loading-state" aria-live="polite">
          <span className="loader" />
          <p>Connecting your account…</p>
        </main>
      ) : (
        <Show when="signed-out">
          <main className="welcome-layout">
            <section className="welcome-copy">
              <span className="eyebrow"><span className="status-dot" /> YOUR TRAINING, MADE VISIBLE</span>
              <h1>Show up.<br /><em>Get stronger.</em></h1>
              <p className="welcome-description">
                A personal place to track every lift, every run, and every
                step toward your next goal.
              </p>
              <div className="welcome-cta">
                <SignUpButton mode="modal">
                  <button className="button button-primary button-large" type="button">
                    Create your account <span aria-hidden="true">↗</span>
                  </button>
                </SignUpButton>
                <span>Already training with us? <SignInButton mode="modal"><button className="inline-link" type="button">Sign in</button></SignInButton></span>
              </div>
            </section>

            <section className="preview-card" aria-label="Workout tracker preview">
              <div className="preview-top">
                <div>
                  <span className="eyebrow">THE LONG GAME</span>
                  <h2>Progress takes reps.</h2>
                </div>
                <span className="preview-icon" aria-hidden="true">↗</span>
              </div>
              <div className="preview-stat">
                <span>YOUR NEXT PERSONAL BEST</span>
                <strong>Starts with a sign in.</strong>
              </div>
              <div className="preview-bars" aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
              </div>
              <div className="preview-footer">
                <span>Strength + running</span>
                <span>One account. Yours.</span>
              </div>
            </section>
          </main>
        </Show>
      )}

      <Show when="signed-in">
        <main className="workout-account-layout">
          {accountError ? (
            <div className="loading-state">
              <p className="message message-error" role="alert">{accountError}</p>
            </div>
          ) : account ? (
            <Workouts
              getToken={getToken}
              weightUnit={account.weight_unit}
              distanceUnit={account.distance_unit}
              onWeightUnitChange={(weightUnit) =>
                updatePreferences({ weight_unit: weightUnit })
              }
              onDistanceUnitChange={(distanceUnit) =>
                updatePreferences({ distance_unit: distanceUnit })
              }
            />
          ) : (
            <div className="loading-state" aria-live="polite">
              <span className="loader" />
              <p>Syncing your account…</p>
            </div>
          )}
        </main>
      </Show>
      <footer className="page-footer">
        <span>BUILT FOR THE WORK YOU PUT IN</span>
        <span>STRENGTH · ENDURANCE · PROGRESS</span>
      </footer>
    </div>
  );
}

export default App;
