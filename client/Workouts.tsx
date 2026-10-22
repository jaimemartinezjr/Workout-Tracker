import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  deleteWorkout,
  getWorkout,
  listWorkouts,
  saveWorkout,
  type ActivityType,
  type LiftingSet,
  type Workout,
  type WorkoutDetail,
  type WorkoutInput,
} from "./workoutsApi";
import "./workouts.css";

type Props = {
  getToken: () => Promise<string | null>;
  weightUnit: "kg" | "lb";
  distanceUnit: "km" | "mi";
  onWeightUnitChange: (weightUnit: "kg" | "lb") => Promise<void>;
};

type ExerciseDraft = {
  exercise_name: string;
  weight: string;
  set_count: string;
  reps: string;
};

type WorkoutDraft = {
  title: string;
  activity_type: ActivityType;
  performed_on: string;
  notes: string;
  exercises: ExerciseDraft[];
  distance: string;
  pace: string;
  calories: string;
};

const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;

function todayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function newDraft(activity: ActivityType = "strength"): WorkoutDraft {
  return {
    title: "",
    activity_type: activity,
    performed_on: todayValue(),
    notes: "",
    exercises: [{ exercise_name: "", weight: "", set_count: "3", reps: "" }],
    distance: "",
    pace: "",
    calories: "",
  };
}

function exerciseDraftsFromSets(sets: LiftingSet[], weightUnit: "kg" | "lb") {
  const multiplier = weightUnit === "lb" ? 1 / KG_PER_LB : 1;
  const exercises: ExerciseDraft[] = [];

  for (const set of sets) {
    const weight = String(Number((set.weight_kg * multiplier).toFixed(2)));
    const reps = String(set.reps);
    const previous = exercises[exercises.length - 1];

    if (
      previous &&
      previous.exercise_name === set.exercise_name &&
      previous.weight === weight &&
      previous.reps === reps
    ) {
      previous.set_count = String(Number(previous.set_count) + 1);
    } else {
      exercises.push({
        exercise_name: set.exercise_name,
        weight,
        set_count: "1",
        reps,
      });
    }
  }

  return exercises;
}

function draftFromDetail(detail: WorkoutDetail, weightUnit: "kg" | "lb", distanceUnit: "km" | "mi"): WorkoutDraft {
  const distanceMultiplier = distanceUnit === "mi" ? 1 / KM_PER_MI : 1;
  const run = detail.runDetails;
  const exercises = exerciseDraftsFromSets(detail.sets, weightUnit);
  return {
    title: detail.workout.title,
    activity_type: detail.workout.activity_type,
    performed_on: detail.workout.performed_on.slice(0, 10),
    notes: detail.workout.notes ?? "",
    exercises: exercises.length
      ? exercises
      : [{ exercise_name: "", weight: "", set_count: "1", reps: "" }],
    distance: run ? String(Number((run.distance_km * distanceMultiplier).toFixed(2))) : "",
    pace: run
      ? String(Number(((run.pace_seconds_per_km * (distanceUnit === "mi" ? KM_PER_MI : 1)) / 60).toFixed(2)))
      : "",
    calories: run ? String(run.calories) : "",
  };
}

function formatDate(date: string) {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function formatPace(secondsPerKm: number, distanceUnit: "km" | "mi") {
  const totalSeconds = Math.round(secondsPerKm * (distanceUnit === "mi" ? KM_PER_MI : 1));
  const whole = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${whole}:${String(seconds).padStart(2, "0")} / ${distanceUnit}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function Workouts({ getToken, weightUnit, distanceUnit, onWeightUnitChange }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [activeDetail, setActiveDetail] = useState<WorkoutDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [weightUnitError, setWeightUnitError] = useState("");
  const [updatingWeightUnit, setUpdatingWeightUnit] = useState(false);

  const sortedWorkouts = useMemo(
    () => [...workouts].sort((a, b) => b.performed_on.localeCompare(a.performed_on)),
    [workouts],
  );

  const refresh = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      setWorkouts(await listWorkouts(getToken));
    } catch (error) {
      setListError(errorMessage(error, "Your training history couldn't be loaded."));
    } finally {
      setListLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openWorkout = async (id: string) => {
    setActiveDetail(null);
    setDraft(null);
    setEditing(false);
    setDetailError("");
    setFormMessage("");
    setDetailLoading(true);
    try {
      const detail = await getWorkout(getToken, id);
      setActiveDetail(detail);
      setDraft(draftFromDetail(detail, weightUnit, distanceUnit));
    } catch (error) {
      setDetailError(errorMessage(error, "That session couldn't be opened."));
    } finally {
      setDetailLoading(false);
    }
  };

  const startNew = () => {
    setActiveDetail(null);
    setDraft(newDraft());
    setEditing(true);
    setDetailError("");
    setFormError("");
    setFormMessage("");
  };

  const closeDetail = () => {
    setActiveDetail(null);
    setDraft(null);
    setEditing(false);
    setDetailError("");
    setFormError("");
    setFormMessage("");
  };

  const updateDraft = (key: keyof WorkoutDraft, value: string | ActivityType) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setFormError("");
    setFormMessage("");
  };

  const updateExercise = (index: number, key: keyof ExerciseDraft, value: string) => {
    setDraft((current) => current
      ? { ...current, exercises: current.exercises.map((exercise, exerciseIndex) => exerciseIndex === index ? { ...exercise, [key]: value } : exercise) }
      : current);
    setFormError("");
  };

  const addExercise = () => {
    setDraft((current) => current
      ? { ...current, exercises: [...current.exercises, { exercise_name: "", weight: "", set_count: "3", reps: "" }] }
      : current);
  };

  const removeExercise = (index: number) => {
    setDraft((current) => current
      ? { ...current, exercises: current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index) }
      : current);
  };

  const changeWeightUnit = async (nextUnit: "kg" | "lb") => {
    if (nextUnit === weightUnit || updatingWeightUnit) return;
    setUpdatingWeightUnit(true);
    setWeightUnitError("");
    try {
      await onWeightUnitChange(nextUnit);
      const conversion = weightUnit === "kg" ? 1 / KG_PER_LB : KG_PER_LB;
      setDraft((current) => current
        ? {
            ...current,
            exercises: current.exercises.map((exercise) => ({
              ...exercise,
              weight: exercise.weight === ""
                ? ""
                : String(Number((Number(exercise.weight) * conversion).toFixed(2))),
            })),
          }
        : current);
    } catch (error) {
      setWeightUnitError(errorMessage(error, "Your weight unit couldn't be updated."));
    } finally {
      setUpdatingWeightUnit(false);
    }
  };

  const buildInput = (): WorkoutInput | null => {
    if (!draft) return null;
    const title = draft.title.trim();
    if (!title) {
      setFormError("Give this session a name before saving.");
      return null;
    }
    if (!draft.performed_on) {
      setFormError("Choose the date you trained.");
      return null;
    }
    if (draft.activity_type === "strength") {
      if (!draft.exercises.length) {
        setFormError("Add at least one exercise to this strength session.");
        return null;
      }
      const sets: LiftingSet[] = [];
      for (let index = 0; index < draft.exercises.length; index += 1) {
        const exercise = draft.exercises[index];
        const exercise_name = exercise.exercise_name.trim();
        const weight = Number(exercise.weight);
        const setCount = Number(exercise.set_count);
        const reps = Number(exercise.reps);
        if (
          !exercise_name ||
          exercise.weight === "" ||
          !Number.isFinite(weight) ||
          weight < 0 ||
          !Number.isInteger(setCount) ||
          setCount < 1 ||
          setCount > 100 ||
          exercise.reps === "" ||
          !Number.isInteger(reps) ||
          reps <= 0
        ) {
          setFormError(`Check exercise, sets, reps and weight for exercise ${index + 1}.`);
          return null;
        }
        for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
          sets.push({
            exercise_name,
            set_number: sets.length + 1,
            weight_kg: Number((weight * (weightUnit === "lb" ? KG_PER_LB : 1)).toFixed(5)),
            reps,
          });
        }
      }
      return { title, activity_type: "strength", performed_on: draft.performed_on, notes: draft.notes.trim(), sets };
    }

    const distance = Number(draft.distance);
    const pace = Number(draft.pace);
    const calories = Number(draft.calories);
    if (
      draft.distance === "" || !Number.isFinite(distance) || distance <= 0 ||
      draft.pace === "" || !Number.isFinite(pace) || pace <= 0 ||
      draft.calories === "" || !Number.isInteger(calories) || calories < 0
    ) {
      setFormError("Enter a distance, a positive pace, and calories burned (zero is okay).");
      return null;
    }
    return {
      title,
      activity_type: "run",
      performed_on: draft.performed_on,
      notes: draft.notes.trim(),
      runDetails: {
        distance_km: Number((distance * (distanceUnit === "mi" ? KM_PER_MI : 1)).toFixed(5)),
        pace_seconds_per_km: Math.round((pace * 60) / (distanceUnit === "mi" ? KM_PER_MI : 1)),
        calories,
      },
    };
  };

  const submitWorkout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage("");
    setFormError("");
    const input = buildInput();
    if (!input) return;
    setSaving(true);
    try {
      const detail = await saveWorkout(getToken, activeDetail?.workout.id, input);
      setActiveDetail(detail);
      setDraft(draftFromDetail(detail, weightUnit, distanceUnit));
      setEditing(false);
      setFormMessage("Session saved.");
      await refresh();
    } catch (error) {
      setFormError(errorMessage(error, "Your session couldn't be saved. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const removeWorkout = async () => {
    if (!activeDetail || !window.confirm(`Delete “${activeDetail.workout.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    setDetailError("");
    try {
      await deleteWorkout(getToken, activeDetail.workout.id);
      closeDetail();
      await refresh();
    } catch (error) {
      setDetailError(errorMessage(error, "This session couldn't be deleted. Please try again."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="workouts" aria-labelledby="workouts-title">
      <header className="workouts-heading">
        <div>
          <span className="workouts-kicker"><span className="workouts-pulse" /> YOUR TRAINING LOG</span>
          <h1 id="workouts-title">The work, <em>kept.</em></h1>
          <p>A clear record of the strength and miles you put in.</p>
        </div>
        <div className="workouts-heading-actions">
          <div className="weight-unit-control">
            <span className="weight-unit-label">WEIGHT UNIT</span>
            <div className="weight-unit-switch" role="group" aria-label="Weight unit">
              {(["kg", "lb"] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  aria-pressed={weightUnit === unit}
                  disabled={updatingWeightUnit}
                  onClick={() => void changeWeightUnit(unit)}
                >
                  {unit}
                </button>
              ))}
            </div>
            {weightUnitError && <span className="weight-unit-error" role="alert">{weightUnitError}</span>}
          </div>
          <button className="workouts-button workouts-button-primary" type="button" onClick={startNew}>
            <span aria-hidden="true">+</span> Log a session
          </button>
        </div>
      </header>

      <div className="workouts-layout">
        <section className="workout-history" aria-labelledby="history-title">
          <div className="workouts-section-head">
            <div>
              <span className="workouts-overline">YOUR RECORD</span>
              <h2 id="history-title">Sessions</h2>
            </div>
            <span className="workouts-count">{workouts.length} {workouts.length === 1 ? "entry" : "entries"}</span>
          </div>

          {listLoading ? (
            <div className="workouts-state" aria-live="polite">
              <span className="workouts-skeleton-line" />
              <span className="workouts-skeleton-line short" />
              <span className="workouts-skeleton-line" />
              <span className="workouts-skeleton-line short" />
              <span className="workouts-sr-only">Loading your sessions</span>
            </div>
          ) : listError ? (
            <div className="workouts-state workouts-state-error" role="alert">
              <span className="workouts-state-mark">!</span>
              <h3>History is out of reach.</h3>
              <p>{listError}</p>
              <button className="workouts-button workouts-button-quiet" type="button" onClick={() => void refresh()}>Try again</button>
            </div>
          ) : sortedWorkouts.length === 0 ? (
            <div className="workouts-empty">
              <span className="workouts-empty-index">01 / BEGIN</span>
              <div className="workouts-empty-mark" aria-hidden="true"><span /><span /><span /></div>
              <h3>Your first session starts here.</h3>
              <p>Log a lift or a run, then come back to see your training history take shape.</p>
              <button className="workouts-button workouts-button-primary" type="button" onClick={startNew}>Log your first session</button>
            </div>
          ) : (
            <ul className="workout-list">
              {sortedWorkouts.map((workout, index) => (
                <li key={workout.id}>
                  <button
                    className={`workout-row${activeDetail?.workout.id === workout.id ? " is-selected" : ""}`}
                    type="button"
                    onClick={() => void openWorkout(workout.id)}
                    aria-label={`Open ${workout.title}, ${formatDate(workout.performed_on)}`}
                    aria-current={activeDetail?.workout.id === workout.id ? "true" : undefined}
                  >
                    <span className="workout-row-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className={`workout-type-icon ${workout.activity_type}`} aria-hidden="true">
                      {workout.activity_type === "strength" ? "S" : "R"}
                    </span>
                    <span className="workout-row-copy">
                      <strong>{workout.title}</strong>
                      <span>{formatDate(workout.performed_on)}</span>
                    </span>
                    <span className={`workout-kind ${workout.activity_type}`}>{workout.activity_type === "strength" ? "STRENGTH" : "RUN"}</span>
                    <span className="workout-row-arrow" aria-hidden="true">↗</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`workout-panel${editing ? " is-editing" : ""}`} aria-label={editing ? (activeDetail ? "Edit workout" : "New workout") : "Workout details"}>
          {detailLoading ? (
            <div className="workouts-panel-state" aria-live="polite">
              <span className="workouts-panel-skeleton" />
              <span className="workouts-panel-skeleton medium" />
              <span className="workouts-panel-skeleton" />
              <span className="workouts-sr-only">Loading session details</span>
            </div>
          ) : detailError && !activeDetail && !editing ? (
            <div className="workouts-panel-state workouts-panel-error" role="alert">
              <span className="workouts-overline">SESSION UNAVAILABLE</span>
              <p>{detailError}</p>
              <button className="workouts-button workouts-button-quiet" type="button" onClick={() => setDetailError("")}>Dismiss</button>
            </div>
          ) : editing && draft ? (
            <form className="workout-form" onSubmit={submitWorkout} noValidate>
              <div className="workout-panel-heading">
                <div>
                  <span className="workouts-overline">{activeDetail ? "UPDATE RECORD" : "NEW RECORD"}</span>
                  <h2>{activeDetail ? "Edit session" : "Log a session"}</h2>
                </div>
                <button className="workouts-icon-button" type="button" onClick={closeDetail} aria-label="Close session form">×</button>
              </div>

              <div className="workout-form-grid">
                <label className="workout-field workout-field-wide">
                  <span>Session name <i>Required</i></span>
                  <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} maxLength={100} autoFocus placeholder="e.g. Upper body" />
                </label>
                <label className="workout-field">
                  <span>Activity</span>
                  <select
                    value={draft.activity_type}
                    onChange={(event) => {
                      const activity = event.target.value as ActivityType;
                      setDraft((current) => current ? { ...current, activity_type: activity } : current);
                      setFormError("");
                    }}
                  >
                    <option value="strength">Strength</option>
                    <option value="run">Run</option>
                  </select>
                </label>
                <label className="workout-field">
                  <span>Date <i>Required</i></span>
                  <input type="date" value={draft.performed_on} onChange={(event) => updateDraft("performed_on", event.target.value)} />
                </label>
              </div>

              {draft.activity_type === "strength" ? (
                <div className="workout-entry-section">
                  <div className="workout-entry-heading">
                    <div><span className="workouts-overline">STRENGTH DETAILS</span><h3>Exercises</h3></div>
                    <button className="workouts-text-button" type="button" onClick={addExercise}>+ Add exercise</button>
                  </div>
                  <div className="exercise-table-head" aria-hidden="true">
                    <span /><span>EXERCISE</span><span>SETS</span><span>REPS</span><span>LOAD ({weightUnit})</span><span />
                  </div>
                  <div className="exercise-rows">
                    {draft.exercises.map((exercise, index) => (
                      <div className="exercise-row" key={`exercise-${index}`}>
                        <span className="set-row-number">{String(index + 1).padStart(2, "0")}</span>
                        <label className="exercise-field exercise-name">
                          <span>EXERCISE</span>
                          <input id={`exercise-${index}`} value={exercise.exercise_name} onChange={(event) => updateExercise(index, "exercise_name", event.target.value)} placeholder="e.g. Bench press" maxLength={80} />
                        </label>
                        <label className="exercise-field exercise-sets">
                          <span>SETS</span>
                          <input id={`sets-${index}`} type="number" min="1" max="100" step="1" inputMode="numeric" value={exercise.set_count} onChange={(event) => updateExercise(index, "set_count", event.target.value)} placeholder="3" aria-label={`Number of sets for exercise ${index + 1}`} />
                        </label>
                        <label className="exercise-field exercise-reps">
                          <span>REPS</span>
                          <input id={`reps-${index}`} type="number" min="1" step="1" inputMode="numeric" value={exercise.reps} onChange={(event) => updateExercise(index, "reps", event.target.value)} placeholder="5" aria-label={`Reps per set for exercise ${index + 1}`} />
                        </label>
                        <label className="exercise-field exercise-load">
                          <span>LOAD ({weightUnit})</span>
                          <input id={`weight-${index}`} type="number" min="0" step="any" inputMode="decimal" value={exercise.weight} onChange={(event) => updateExercise(index, "weight", event.target.value)} placeholder="0" aria-label={`Weight in ${weightUnit} for exercise ${index + 1}`} />
                        </label>
                        <button className="set-remove" type="button" onClick={() => removeExercise(index)} aria-label={`Remove exercise ${index + 1}`} disabled={draft.exercises.length === 1}>×</button>
                      </div>
                    ))}
                  </div>
                  <p className="workout-hint">Log sets × reps at one load, for example 3 sets × 5 reps at 275 {weightUnit}.</p>
                </div>
              ) : (
                <div className="workout-entry-section">
                  <div className="workout-entry-heading">
                    <div><span className="workouts-overline">RUN DETAILS</span><h3>Distance &amp; pace</h3></div>
                  </div>
                  <div className="workout-form-grid run-fields">
                    <label className="workout-field">
                      <span>Distance <i>({distanceUnit})</i></span>
                      <input type="number" min="0" step="any" inputMode="decimal" value={draft.distance} onChange={(event) => updateDraft("distance", event.target.value)} placeholder={`0.0 ${distanceUnit}`} />
                    </label>
                    <label className="workout-field">
                      <span>Pace <i>min / {distanceUnit}</i></span>
                      <input type="number" min="0" step="any" inputMode="decimal" value={draft.pace} onChange={(event) => updateDraft("pace", event.target.value)} placeholder="0.0" />
                    </label>
                    <label className="workout-field">
                      <span>Calories <i>kcal</i></span>
                      <input type="number" min="0" step="1" inputMode="numeric" value={draft.calories} onChange={(event) => updateDraft("calories", event.target.value)} placeholder="0" />
                    </label>
                  </div>
                  <p className="workout-hint">Pace is entered as decimal minutes per {distanceUnit}, such as 5.5 for 5:30.</p>
                </div>
              )}

              <label className="workout-field workout-notes-field">
                <span>Notes <i>Optional</i></span>
                <textarea value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} rows={3} maxLength={2000} placeholder="How did it feel? Anything to remember…" />
              </label>
              {formError && <p className="workout-form-message is-error" role="alert">{formError}</p>}
              {detailError && <p className="workout-form-message is-error" role="alert">{detailError}</p>}
              <div className="workout-form-actions">
                {activeDetail && <button className="workouts-button workouts-button-danger" type="button" onClick={() => setEditing(false)}>Cancel</button>}
                <button className="workouts-button workouts-button-primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : activeDetail ? "Save changes" : "Save session"}
                </button>
              </div>
            </form>
          ) : activeDetail ? (
            <div className="workout-detail">
              <div className="workout-panel-heading">
                <div>
                  <span className="workouts-overline">{activeDetail.workout.activity_type === "strength" ? "STRENGTH SESSION" : "RUN SESSION"}</span>
                  <h2>{activeDetail.workout.title}</h2>
                </div>
                <button className="workouts-icon-button" type="button" onClick={closeDetail} aria-label="Close session details">×</button>
              </div>
              <div className="workout-detail-date">
                <span className={`workout-detail-mark ${activeDetail.workout.activity_type}`} aria-hidden="true">
                  {activeDetail.workout.activity_type === "strength" ? "S" : "R"}
                </span>
                <div><span>PERFORMED ON</span><strong>{formatDate(activeDetail.workout.performed_on)}</strong></div>
              </div>
              {activeDetail.workout.activity_type === "strength" ? (
                <div className="detail-section">
                  <div className="detail-section-heading"><span>EXERCISE LOG</span><span>{activeDetail.sets.length} {activeDetail.sets.length === 1 ? "set" : "sets"}</span></div>
                  {activeDetail.sets.length ? (
                    <div className="detail-sets">
                      {exerciseDraftsFromSets(activeDetail.sets, weightUnit).map((exercise, index) => (
                        <div className="detail-set" key={`${exercise.exercise_name}-${index}`}>
                          <span className="detail-set-index">{String(index + 1).padStart(2, "0")}</span>
                          <strong>{exercise.exercise_name}</strong>
                          <span>{exercise.set_count} sets × {exercise.reps} reps</span>
                          <span>{exercise.weight} <i>{weightUnit}</i></span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="workout-detail-empty">No sets recorded for this session.</p>}
                </div>
              ) : activeDetail.runDetails ? (
                <div className="run-summary">
                  <div><span>DISTANCE</span><strong>{Number((activeDetail.runDetails.distance_km * (distanceUnit === "mi" ? 1 / KM_PER_MI : 1)).toFixed(2))}<i>{distanceUnit}</i></strong></div>
                  <div><span>PACE</span><strong>{formatPace(activeDetail.runDetails.pace_seconds_per_km, distanceUnit)}</strong></div>
                  <div><span>CALORIES</span><strong>{activeDetail.runDetails.calories}<i>kcal</i></strong></div>
                </div>
              ) : <p className="workout-detail-empty">No run details were recorded for this session.</p>}
              {activeDetail.workout.notes && (
                <div className="workout-notes-display">
                  <span className="workouts-overline">NOTES</span>
                  <p>{activeDetail.workout.notes}</p>
                </div>
              )}
              {formMessage && <p className="workout-form-message is-success" role="status">{formMessage}</p>}
              {detailError && <p className="workout-form-message is-error" role="alert">{detailError}</p>}
              <div className="workout-detail-actions">
                <button className="workouts-button workouts-button-danger" type="button" onClick={() => void removeWorkout()} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete"}
                </button>
                <button className="workouts-button workouts-button-primary" type="button" onClick={() => {
                  setDraft(draftFromDetail(activeDetail, weightUnit, distanceUnit));
                  setEditing(true);
                  setFormError("");
                  setFormMessage("");
                }}>Edit session</button>
              </div>
            </div>
          ) : (
            <div className="workout-panel-empty">
              <div className="panel-orbit" aria-hidden="true"><span /><span /><span /></div>
              <span className="workouts-overline">SESSION NOTES</span>
              <h2>One day at a time.</h2>
              <p>Select a session to see the details, or log today’s work.</p>
              <button className="workouts-text-button" type="button" onClick={startNew}>Start a new entry <span aria-hidden="true">↗</span></button>
            </div>
          )}
        </section>
      </div>
      <div className="workouts-footnote"><span>EVERY SESSION COUNTS</span><span>WEIGHT · DISTANCE · DATE</span></div>
    </section>
  );
}
