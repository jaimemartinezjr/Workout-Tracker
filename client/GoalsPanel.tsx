import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  deleteGoal,
  listGoals,
  saveGoal,
  type Goal,
  type GoalInput,
} from "./goalsApi";
import {
  formatPaceInput,
  paceFromSecondsPerKm,
  paceToSecondsPerKm,
  parsePaceInput,
} from "./pace";
import "./goals.css";

type Props = {
  getToken: () => Promise<string | null>;
  weightUnit: "kg" | "lb";
  distanceUnit: "km" | "mi";
};

type GoalDraft = {
  goal_type: "strength" | "run";
  exercise_name: string;
  target_weight: string;
  target_reps: string;
  target_distance: string;
  target_pace: string;
};

const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;

function newGoalDraft(goalType: GoalDraft["goal_type"] = "strength"): GoalDraft {
  return {
    goal_type: goalType,
    exercise_name: "",
    target_weight: "",
    target_reps: "",
    target_distance: "",
    target_pace: "",
  };
}

function draftFromGoal(
  goal: Goal,
  weightUnit: Props["weightUnit"],
  distanceUnit: Props["distanceUnit"],
): GoalDraft {
  const strength = goal.goal_type === "strength";
  return {
    goal_type: goal.goal_type,
    exercise_name: goal.exercise_name ?? "",
    target_weight: strength && goal.target_weight_kg != null
      ? String(Number((goal.target_weight_kg * (weightUnit === "lb" ? 1 / KG_PER_LB : 1)).toFixed(2)))
      : "",
    target_reps: goal.target_reps == null ? "" : String(goal.target_reps),
    target_distance: goal.target_distance_km == null
      ? ""
      : String(Number((goal.target_distance_km * (distanceUnit === "mi" ? 1 / KM_PER_MI : 1)).toFixed(2))),
    target_pace: goal.target_pace_seconds_per_km == null
      ? ""
      : formatPaceInput(paceFromSecondsPerKm(goal.target_pace_seconds_per_km, distanceUnit)),
  };
}

function displayNumber(value: number, decimals = 2) {
  return String(Number(value.toFixed(decimals)));
}

function formatPace(secondsPerKm: number, distanceUnit: Props["distanceUnit"]) {
  return `${formatPaceInput(paceFromSecondsPerKm(secondsPerKm, distanceUnit))} / ${distanceUnit}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function GoalsPanel({ getToken, weightUnit, distanceUnit }: Props) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setGoals(await listGoals(getToken));
    } catch (error) {
      setLoadError(getErrorMessage(error, "Your goals couldn't be loaded."));
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startNew = () => {
    setDraft(newGoalDraft());
    setEditingId(undefined);
    setFieldErrors({});
    setFormError("");
    setStatusMessage("");
  };

  const startEdit = (goal: Goal) => {
    setDraft(draftFromGoal(goal, weightUnit, distanceUnit));
    setEditingId(goal.id);
    setFieldErrors({});
    setFormError("");
    setStatusMessage("");
  };

  const closeForm = () => {
    setDraft(null);
    setEditingId(undefined);
    setFieldErrors({});
    setFormError("");
  };

  const updateField = (
    key: keyof GoalDraft,
    value: string,
    fieldId?: string,
  ) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setFormError("");
    setStatusMessage("");
    if (fieldId) {
      setFieldErrors((current) => {
        if (!current[fieldId]) return current;
        const next = { ...current };
        delete next[fieldId];
        return next;
      });
    }
  };

  const submitGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || saving) return;

    const errors: Record<string, string> = {};
    let input: GoalInput | null = null;
    if (draft.goal_type === "strength") {
      const exerciseName = draft.exercise_name.trim();
      const weight = Number(draft.target_weight);
      const reps = Number(draft.target_reps);
      if (!exerciseName) errors["goal-exercise"] = "Enter the lift or exercise.";
      if (draft.target_weight === "" || !Number.isFinite(weight) || weight < 0) {
        errors["goal-weight"] = `Enter a target weight of 0 or more ${weightUnit}.`;
      }
      if (!Number.isInteger(reps) || reps < 1 || reps > 10000) {
        errors["goal-reps"] = "Enter a whole number of reps from 1 to 10,000.";
      }
      if (!Object.keys(errors).length) {
        input = {
          goal_type: "strength",
          exercise_name: exerciseName,
          target_weight_kg: Number((weight * (weightUnit === "lb" ? KG_PER_LB : 1)).toFixed(5)),
          target_reps: reps,
        };
      }
    } else {
      const distance = Number(draft.target_distance);
      const paceSeconds = parsePaceInput(draft.target_pace);
      if (draft.target_distance === "" || !Number.isFinite(distance) || distance <= 0) {
        errors["goal-distance"] = `Enter a target distance greater than zero ${distanceUnit}.`;
      }
      if (paceSeconds === null) {
        errors["goal-pace"] = "Enter pace as min:sec (for example, 8:30) with seconds from 00 to 59.";
      }
      if (!Object.keys(errors).length) {
        input = {
          goal_type: "run",
          target_distance_km: Number((distance * (distanceUnit === "mi" ? KM_PER_MI : 1)).toFixed(5)),
          target_pace_seconds_per_km: paceToSecondsPerKm(paceSeconds!, distanceUnit),
        };
      }
    }

    if (Object.keys(errors).length || !input) {
      setFieldErrors(errors);
      setFormError("Check the highlighted fields before saving.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const result = await saveGoal(getToken, editingId, input);
      setGoals((current) => editingId
        ? current.map((goal) => goal.id === editingId ? result.goal : goal)
        : [result.goal, ...current]);
      setDraft(null);
      setEditingId(undefined);
      setFieldErrors({});
      setStatusMessage("Goal saved.");
    } catch (error) {
      setFormError(getErrorMessage(error, "This goal couldn't be saved. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const removeGoal = async (goal: Goal) => {
    const label = goal.goal_type === "strength"
      ? goal.exercise_name ?? "this lift"
      : "this run";
    if (!window.confirm(`Remove the goal for ${label}?`)) return;
    setDeletingId(goal.id);
    setLoadError("");
    try {
      await deleteGoal(getToken, goal.id);
      setGoals((current) => current.filter((item) => item.id !== goal.id));
      if (editingId === goal.id) closeForm();
      setStatusMessage("Goal removed.");
    } catch (error) {
      setLoadError(getErrorMessage(error, "This goal couldn't be removed. Please try again."));
    } finally {
      setDeletingId("");
    }
  };

  return (
    <section className="goals-section" aria-labelledby="goals-title">
      <div className="goals-section-head">
        <div>
          <span className="workouts-overline">A TARGET TO WORK TOWARD</span>
          <h2 id="goals-title">Goals</h2>
        </div>
        {!draft && (
          <button className="workouts-button workouts-button-primary" type="button" onClick={startNew}>
            <span aria-hidden="true">+</span> Add a goal
          </button>
        )}
      </div>

      {statusMessage && <p className="goals-status" role="status">{statusMessage}</p>}
      {loadError && (
        <div className="goals-error" role="alert">
          <span>{loadError}</span>
          <button className="workouts-text-button" type="button" onClick={() => void refresh()}>Try again</button>
        </div>
      )}

      {draft && (
        <form className="goals-form" onSubmit={submitGoal} noValidate>
          <div className="goals-form-head">
            <h3>{editingId ? "Edit goal" : "Set a goal"}</h3>
            <button className="workouts-icon-button" type="button" onClick={closeForm} aria-label="Close goal form">×</button>
          </div>
          {formError && <p className="goals-error" role="alert">{formError}</p>}
          <label className="goal-field">
            <span className="workout-field-label">Goal type</span>
            <select
              value={draft.goal_type}
              onChange={(event) => {
                setDraft(newGoalDraft(event.target.value as GoalDraft["goal_type"]));
                setFieldErrors({});
                setFormError("");
              }}
            >
              <option value="strength">Lift</option>
              <option value="run">Run</option>
            </select>
          </label>

          {draft.goal_type === "strength" ? (
            <div className="goals-form-grid">
              <label className="goal-field">
                <span className="workout-field-label">Lift or exercise</span>
                <input
                  id="goal-exercise"
                  value={draft.exercise_name}
                  onChange={(event) => updateField("exercise_name", event.target.value, "goal-exercise")}
                  maxLength={120}
                  placeholder="e.g. Back squat"
                  aria-invalid={Boolean(fieldErrors["goal-exercise"])}
                  aria-describedby={fieldErrors["goal-exercise"] ? "goal-exercise-error" : undefined}
                />
                {fieldErrors["goal-exercise"] && <span className="goal-field-error" id="goal-exercise-error">{fieldErrors["goal-exercise"]}</span>}
              </label>
              <label className="goal-field">
                <span className="workout-field-label">Target weight <i>{weightUnit}</i></span>
                <input
                  id="goal-weight"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={draft.target_weight}
                  onChange={(event) => updateField("target_weight", event.target.value, "goal-weight")}
                  placeholder={`0 ${weightUnit}`}
                  aria-invalid={Boolean(fieldErrors["goal-weight"])}
                  aria-describedby={fieldErrors["goal-weight"] ? "goal-weight-error" : undefined}
                />
                {fieldErrors["goal-weight"] && <span className="goal-field-error" id="goal-weight-error">{fieldErrors["goal-weight"]}</span>}
              </label>
              <label className="goal-field">
                <span className="workout-field-label">Target reps</span>
                <input
                  id="goal-reps"
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  inputMode="numeric"
                  value={draft.target_reps}
                  onChange={(event) => updateField("target_reps", event.target.value, "goal-reps")}
                  placeholder="5"
                  aria-invalid={Boolean(fieldErrors["goal-reps"])}
                  aria-describedby={fieldErrors["goal-reps"] ? "goal-reps-error" : undefined}
                />
                {fieldErrors["goal-reps"] && <span className="goal-field-error" id="goal-reps-error">{fieldErrors["goal-reps"]}</span>}
              </label>
            </div>
          ) : (
            <div className="goals-form-grid">
              <label className="goal-field">
                <span className="workout-field-label">Target distance <i>{distanceUnit}</i></span>
                <input
                  id="goal-distance"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={draft.target_distance}
                  onChange={(event) => updateField("target_distance", event.target.value, "goal-distance")}
                  placeholder={`5 ${distanceUnit}`}
                  aria-invalid={Boolean(fieldErrors["goal-distance"])}
                  aria-describedby={fieldErrors["goal-distance"] ? "goal-distance-error" : undefined}
                />
                {fieldErrors["goal-distance"] && <span className="goal-field-error" id="goal-distance-error">{fieldErrors["goal-distance"]}</span>}
              </label>
              <label className="goal-field">
                <span className="workout-field-label">Target pace <i>min:sec / {distanceUnit}</i></span>
                <input
                  id="goal-pace"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={draft.target_pace}
                  onChange={(event) => updateField("target_pace", event.target.value, "goal-pace")}
                  placeholder="8:30"
                  aria-invalid={Boolean(fieldErrors["goal-pace"])}
                  aria-describedby={[
                    "goal-pace-hint",
                    fieldErrors["goal-pace"] ? "goal-pace-error" : "",
                  ].filter(Boolean).join(" ")}
                />
                <span className="goal-field-hint" id="goal-pace-hint">Use minutes:seconds, such as 8:30.</span>
                {fieldErrors["goal-pace"] && <span className="goal-field-error" id="goal-pace-error">{fieldErrors["goal-pace"]}</span>}
              </label>
            </div>
          )}
          <div className="goals-form-actions">
            <button className="workouts-button workouts-button-quiet" type="button" onClick={closeForm} disabled={saving}>Cancel</button>
            <button className="workouts-button workouts-button-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Save goal"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="goals-empty" aria-live="polite">Loading your goals…</p>
      ) : goals.length ? (
        <div className="goals-grid">
          {goals.map((goal) => (
            <article className={`goal-card ${goal.goal_type}`} key={goal.id}>
              <span className="goal-card-mark" aria-hidden="true">{goal.goal_type === "strength" ? "S" : "R"}</span>
              <div className="goal-card-copy">
                <span className="goal-card-type">{goal.goal_type === "strength" ? "LIFT TARGET" : "RUN TARGET"}</span>
                <h3>{goal.goal_type === "strength" ? goal.exercise_name : "Running"}</h3>
                <p>
                  {goal.goal_type === "strength"
                    ? `${displayNumber((goal.target_weight_kg ?? 0) * (weightUnit === "lb" ? 1 / KG_PER_LB : 1))} ${weightUnit} × ${goal.target_reps} reps`
                    : `${displayNumber((goal.target_distance_km ?? 0) * (distanceUnit === "mi" ? 1 / KM_PER_MI : 1))} ${distanceUnit} at ${formatPace(goal.target_pace_seconds_per_km ?? 0, distanceUnit)}`}
                </p>
              </div>
              <div className="goal-card-actions">
                <button className="workouts-text-button" type="button" onClick={() => startEdit(goal)}>Edit</button>
                <button
                  className="workouts-text-button is-danger"
                  type="button"
                  onClick={() => void removeGoal(goal)}
                  disabled={deletingId === goal.id}
                >
                  {deletingId === goal.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : !loadError && !draft ? (
        <p className="goals-empty">Set a lift or run target and keep it in view as you train.</p>
      ) : null}
    </section>
  );
}
