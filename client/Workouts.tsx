import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import GoalsPanel from "./GoalsPanel";
import TemplatesPanel from "./TemplatesPanel";
import {
  filterAndSortWorkouts,
  type WorkoutActivityFilter,
  type WorkoutSort,
} from "./workoutFilters";
import {
  deleteWorkout,
  getWorkout,
  listWorkouts,
  saveWorkout,
  type ActivityType,
  type LiftingSet,
  type WorkoutDetail,
  type WorkoutInput,
  type WorkoutListItem,
} from "./workoutsApi";
import {
  formatPaceInput,
  paceFromSecondsPerKm,
  paceToSecondsPerKm,
  parsePaceInput,
} from "./pace";
import { formatSessionDate } from "./sessionDate";
import type { WorkoutTemplate } from "./templatesApi";
import "./workouts.css";

const ProgressCharts = lazy(() => import("./ProgressCharts"));

type Props = {
  getToken: () => Promise<string | null>;
  weightUnit: "kg" | "lb";
  distanceUnit: "km" | "mi";
  onWeightUnitChange: (weightUnit: "kg" | "lb") => Promise<void>;
  onDistanceUnitChange: (distanceUnit: "km" | "mi") => Promise<void>;
};

type ExerciseDraft = {
  id: string;
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
let nextExerciseDraftId = 0;

function createExerciseDraft(exercise: Omit<ExerciseDraft, "id">): ExerciseDraft {
  nextExerciseDraftId += 1;
  return { ...exercise, id: String(nextExerciseDraftId) };
}

function exerciseErrorKey(field: "exercise" | "sets" | "reps" | "weight", exerciseId: string) {
  return `${field}-${exerciseId}`;
}

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
    exercises: [createExerciseDraft({ exercise_name: "", weight: "", set_count: "3", reps: "" })],
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
      exercises.push(createExerciseDraft({
        exercise_name: set.exercise_name,
        weight,
        set_count: "1",
        reps,
      }));
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
      : [createExerciseDraft({ exercise_name: "", weight: "", set_count: "1", reps: "" })],
    distance: run ? String(Number((run.distance_km * distanceMultiplier).toFixed(2))) : "",
    pace: run
      ? formatPaceInput(paceFromSecondsPerKm(run.pace_seconds_per_km, distanceUnit))
      : "",
    calories: run?.calories == null ? "" : String(run.calories),
  };
}

function draftFromTemplate(
  template: WorkoutTemplate,
  weightUnit: "kg" | "lb",
  distanceUnit: "km" | "mi",
): WorkoutDraft {
  const draft = newDraft(template.activity_type);
  if (template.activity_type === "strength") {
    const weightMultiplier = weightUnit === "lb" ? 1 / KG_PER_LB : 1;
    const exercises = template.items.map((item) => createExerciseDraft({
      exercise_name: item.exercise_name ?? "",
      weight: item.planned_weight_kg == null
        ? ""
        : String(Number((item.planned_weight_kg * weightMultiplier).toFixed(2))),
      set_count: String(item.planned_sets ?? 3),
      reps: item.planned_reps == null ? "" : String(item.planned_reps),
    }));
    return {
      ...draft,
      title: template.name,
      exercises: exercises.length ? exercises : draft.exercises,
    };
  }

  const item = template.items[0];
  const distanceMultiplier = distanceUnit === "mi" ? 1 / KM_PER_MI : 1;
  return {
    ...draft,
    title: template.name,
    distance: item?.planned_distance_km == null
      ? ""
      : String(Number((item.planned_distance_km * distanceMultiplier).toFixed(2))),
    pace: item?.planned_pace_seconds_per_km == null
      ? ""
      : formatPaceInput(paceFromSecondsPerKm(item.planned_pace_seconds_per_km, distanceUnit)),
  };
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

export default function Workouts({
  getToken,
  weightUnit,
  distanceUnit,
  onWeightUnitChange,
  onDistanceUnitChange,
}: Props) {
  const [workouts, setWorkouts] = useState<WorkoutListItem[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyActivity, setHistoryActivity] = useState<WorkoutActivityFilter>("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historySort, setHistorySort] = useState<WorkoutSort>("newest");
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [weightUnitError, setWeightUnitError] = useState("");
  const [updatingWeightUnit, setUpdatingWeightUnit] = useState(false);
  const [distanceUnitError, setDistanceUnitError] = useState("");
  const [updatingDistanceUnit, setUpdatingDistanceUnit] = useState(false);
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const [templateSourceWorkout, setTemplateSourceWorkout] = useState<WorkoutDetail | null>(null);

  const refreshProgress = () => {
    setProgressRefreshKey((current) => current + 1);
  };

  const clearTemplateSourceWorkout = useCallback(() => {
    setTemplateSourceWorkout(null);
  }, []);

  const applyTemplate = (template: WorkoutTemplate) => {
    const draftHasContent = Boolean(draft && (
      draft.title.trim() ||
      draft.notes.trim() ||
      draft.exercises.some((exercise) =>
        exercise.exercise_name.trim() || exercise.weight.trim() || exercise.reps.trim(),
      ) ||
      draft.distance.trim() ||
      draft.pace.trim() ||
      draft.calories.trim()
    ));
    if (
      editing &&
      draftHasContent &&
      !window.confirm("Replace your current unsaved session with this template?")
    ) {
      return;
    }
    setActiveDetail(null);
    setDraft(draftFromTemplate(template, weightUnit, distanceUnit));
    setEditing(true);
    setDetailError("");
    setFormError("");
    setFormMessage("");
    setFieldErrors({});
    window.requestAnimationFrame(() => {
      document.querySelector(".workout-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  const clearFieldError = (fieldId: string) => {
    if (fieldErrors[fieldId] && !Object.keys(fieldErrors).some((key) => key !== fieldId)) {
      setFormError("");
    }
    setFieldErrors((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  };

  const showFieldErrors = (errors: Record<string, string>) => {
    setFieldErrors(errors);
    setFormError("Please fix the highlighted fields before saving.");
    const firstInvalidField = Object.keys(errors)[0];
    if (firstInvalidField) {
      window.requestAnimationFrame(() => {
        document.getElementById(firstInvalidField)?.focus();
      });
    }
  };

  const filteredWorkouts = useMemo(
    () => filterAndSortWorkouts(workouts, {
      query: historySearch,
      activity: historyActivity,
      dateFrom: historyFrom,
      dateTo: historyTo,
      sort: historySort,
    }),
    [workouts, historySearch, historyActivity, historyFrom, historyTo, historySort],
  );
  const hasHistoryFilters = Boolean(
    historySearch.trim() ||
    historyActivity !== "all" ||
    historyFrom ||
    historyTo ||
    historySort !== "newest"
  );

  const clearHistoryFilters = () => {
    setHistorySearch("");
    setHistoryActivity("all");
    setHistoryFrom("");
    setHistoryTo("");
    setHistorySort("newest");
  };

  const changeHistoryActivity = (activity: WorkoutActivityFilter) => {
    setHistoryActivity(activity);
    setHistorySort("newest");
  };

  const changeHistoryFrom = (date: string) => {
    setHistoryFrom(date);
    if (date && historyTo && date > historyTo) setHistoryTo(date);
  };

  const changeHistoryTo = (date: string) => {
    setHistoryTo(date);
    if (date && historyFrom && date < historyFrom) setHistoryFrom(date);
  };

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
    setFieldErrors({});
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
    setFieldErrors({});
  };

  const closeDetail = () => {
    setActiveDetail(null);
    setDraft(null);
    setEditing(false);
    setDetailError("");
    setFormError("");
    setFormMessage("");
    setFieldErrors({});
  };

  const updateDraft = (key: keyof WorkoutDraft, value: string | ActivityType) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    const fieldId: Partial<Record<keyof WorkoutDraft, string>> = {
      title: "workout-title",
      performed_on: "performed-on",
      distance: "distance",
      pace: "pace",
      calories: "calories",
    };
    if (fieldId[key]) clearFieldError(fieldId[key]!);
    setFormMessage("");
  };

  const updateExercise = (index: number, key: keyof Omit<ExerciseDraft, "id">, value: string) => {
    setDraft((current) => current
      ? { ...current, exercises: current.exercises.map((exercise, exerciseIndex) => exerciseIndex === index ? { ...exercise, [key]: value } : exercise) }
      : current);
    const exerciseId = draft?.exercises[index]?.id;
    if (!exerciseId) return;
    const fieldId = exerciseErrorKey(({
      exercise_name: "exercise",
      set_count: "sets",
      reps: "reps",
      weight: "weight",
    } as const)[key], exerciseId);
    clearFieldError(fieldId);
  };

  const addExercise = () => {
    setDraft((current) => current
      ? { ...current, exercises: [...current.exercises, createExerciseDraft({ exercise_name: "", weight: "", set_count: "3", reps: "" })] }
      : current);
  };

  const removeExercise = (index: number) => {
    const removedExerciseId = draft?.exercises[index]?.id;
    setDraft((current) => current
      ? { ...current, exercises: current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index) }
      : current);
    if (removedExerciseId) {
      const remainingErrors = Object.fromEntries(
        Object.entries(fieldErrors).filter(([fieldId]) =>
          !(["exercise", "sets", "reps", "weight"] as const)
            .some((field) => fieldId === exerciseErrorKey(field, removedExerciseId)),
        ),
      );
      setFieldErrors(remainingErrors);
      if (!Object.keys(remainingErrors).length) setFormError("");
    }
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

  const changeDistanceUnit = async (nextUnit: "km" | "mi") => {
    if (nextUnit === distanceUnit || updatingDistanceUnit) return;
    setUpdatingDistanceUnit(true);
    setDistanceUnitError("");
    try {
      await onDistanceUnitChange(nextUnit);
      const distanceConversion = distanceUnit === "km" ? 1 / KM_PER_MI : KM_PER_MI;
      setDraft((current) => current
        ? {
            ...current,
            distance: current.distance === ""
              ? ""
              : String(Number((Number(current.distance) * distanceConversion).toFixed(2))),
            pace: (() => {
              const paceSeconds = parsePaceInput(current.pace);
              return paceSeconds == null
                ? current.pace
                : formatPaceInput(
                    paceFromSecondsPerKm(
                      paceToSecondsPerKm(paceSeconds, distanceUnit),
                      nextUnit,
                    ),
                  );
            })(),
          }
        : current);
    } catch (error) {
      setDistanceUnitError(errorMessage(error, "Your distance unit couldn't be updated."));
    } finally {
      setUpdatingDistanceUnit(false);
    }
  };

  const buildInput = (): WorkoutInput | null => {
    if (!draft) return null;
    const title = draft.title.trim();
    const errors: Record<string, string> = {};
    if (!draft.performed_on) errors["performed-on"] = "Choose the date you trained.";

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
        let exerciseIsValid = true;
        if (!exercise_name) {
          errors[exerciseErrorKey("exercise", exercise.id)] = "Enter an exercise name.";
          exerciseIsValid = false;
        }
        if (!Number.isInteger(setCount) || setCount < 1 || setCount > 100) {
          errors[exerciseErrorKey("sets", exercise.id)] = "Enter a whole number from 1 to 100.";
          exerciseIsValid = false;
        }
        if (!Number.isInteger(reps) || reps < 1) {
          errors[exerciseErrorKey("reps", exercise.id)] = "Enter a whole number of reps greater than zero.";
          exerciseIsValid = false;
        }
        if (exercise.weight === "" || !Number.isFinite(weight) || weight < 0) {
          errors[exerciseErrorKey("weight", exercise.id)] = `Enter a weight of 0 or more ${weightUnit}.`;
          exerciseIsValid = false;
        }
        if (!exerciseIsValid) continue;

        for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
          sets.push({
            exercise_name,
            set_number: sets.length + 1,
            weight_kg: Number((weight * (weightUnit === "lb" ? KG_PER_LB : 1)).toFixed(5)),
            reps,
          });
        }
      }
      if (Object.keys(errors).length) {
        showFieldErrors(errors);
        return null;
      }
      setFieldErrors({});
      return { title, activity_type: "strength", performed_on: draft.performed_on, notes: draft.notes.trim(), sets };
    }

    const distance = Number(draft.distance);
    const paceSecondsPerUnit = parsePaceInput(draft.pace);
    const caloriesInput = draft.calories.trim();
    const calories = caloriesInput === "" ? null : Number(caloriesInput);
    if (draft.distance === "" || !Number.isFinite(distance) || distance <= 0) {
      errors.distance = `Enter a distance greater than zero in ${distanceUnit}.`;
    }
    if (paceSecondsPerUnit == null) {
      errors.pace = `Enter pace as min:sec per ${distanceUnit}, such as 8:30.`;
    }
    if (calories !== null && (!Number.isInteger(calories) || calories < 0)) {
      errors.calories = "Enter whole calories (0 is okay).";
    }
    if (Object.keys(errors).length) {
      showFieldErrors(errors);
      return null;
    }
    setFieldErrors({});
    return {
      title,
      activity_type: "run",
      performed_on: draft.performed_on,
      notes: draft.notes.trim(),
      runDetails: {
        distance_km: Number((distance * (distanceUnit === "mi" ? KM_PER_MI : 1)).toFixed(5)),
        pace_seconds_per_km: Math.round(paceToSecondsPerKm(paceSecondsPerUnit!, distanceUnit)),
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
      refreshProgress();
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
      refreshProgress();
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
          <div className="workouts-unit-controls">
            <div className="unit-control">
              <span className="unit-control-label">WEIGHT UNIT</span>
              <div className="unit-switch" role="group" aria-label="Weight unit">
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
              {weightUnitError && <span className="unit-control-error" role="alert">{weightUnitError}</span>}
            </div>
            <div className="unit-control">
              <span className="unit-control-label">DISTANCE UNIT</span>
              <div className="unit-switch" role="group" aria-label="Distance unit">
                {(["km", "mi"] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    aria-pressed={distanceUnit === unit}
                    disabled={updatingDistanceUnit}
                    onClick={() => void changeDistanceUnit(unit)}
                  >
                    {unit}
                  </button>
                ))}
              </div>
              {distanceUnitError && <span className="unit-control-error" role="alert">{distanceUnitError}</span>}
            </div>
          </div>
          <button className="workouts-button workouts-button-primary" type="button" onClick={startNew}>
            <span aria-hidden="true">+</span> Log a session
          </button>
        </div>
      </header>

      <TemplatesPanel
        getToken={getToken}
        weightUnit={weightUnit}
        distanceUnit={distanceUnit}
        sourceWorkout={templateSourceWorkout}
        onSourceWorkoutHandled={clearTemplateSourceWorkout}
        onUseTemplate={applyTemplate}
        disableUse={detailLoading || saving || deleting}
      />

      <GoalsPanel
        getToken={getToken}
        weightUnit={weightUnit}
        distanceUnit={distanceUnit}
        onGoalsChanged={refreshProgress}
      />

      <Suspense fallback={<p className="progress-message">Loading progress charts…</p>}>
        <ProgressCharts
          getToken={getToken}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          refreshKey={progressRefreshKey}
        />
      </Suspense>

      <div className="workouts-layout">
        <section className="workout-history" aria-labelledby="history-title">
          <div className="workouts-section-head">
            <div>
              <span className="workouts-overline">YOUR RECORD</span>
              <h2 id="history-title">Sessions</h2>
            </div>
            <span className="workouts-count">
              {filteredWorkouts.length} of {workouts.length} {workouts.length === 1 ? "session" : "sessions"}
            </span>
          </div>

          {!listLoading && !listError && workouts.length > 0 && (
            <>
              <div className="workout-history-filters" role="search" aria-label="Search and filter sessions">
                <label className="workout-filter-field workout-filter-search">
                  <span>Exercise or workout</span>
                  <input
                    type="search"
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="e.g. squat or easy run"
                  />
                </label>
                <label className="workout-filter-field">
                  <span>Activity</span>
                  <select
                    value={historyActivity}
                    onChange={(event) => changeHistoryActivity(event.target.value as WorkoutActivityFilter)}
                  >
                    <option value="all">All activity</option>
                    <option value="strength">Strength</option>
                    <option value="run">Running</option>
                  </select>
                </label>
                <label className="workout-filter-field">
                  <span>From</span>
                  <input
                    type="date"
                    value={historyFrom}
                    max={historyTo || undefined}
                    onChange={(event) => changeHistoryFrom(event.target.value)}
                  />
                </label>
                <label className="workout-filter-field">
                  <span>To</span>
                  <input
                    type="date"
                    value={historyTo}
                    min={historyFrom || undefined}
                    onChange={(event) => changeHistoryTo(event.target.value)}
                  />
                </label>
                <label className="workout-filter-field">
                  <span>Sort by</span>
                  <select
                    value={historySort}
                    onChange={(event) => setHistorySort(event.target.value as WorkoutSort)}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    {historyActivity === "strength" && (
                      <>
                        <option value="highest-weight">Highest weight</option>
                        <option value="lowest-weight">Lowest weight</option>
                      </>
                    )}
                    {historyActivity === "run" && (
                      <>
                        <option value="farthest">Farthest distance</option>
                        <option value="shortest">Shortest distance</option>
                      </>
                    )}
                  </select>
                </label>
              </div>
              <div className="workout-filter-footer">
                <span>
                  {historyActivity === "all"
                    ? "Choose Strength or Running to sort by weight or distance."
                    : historyActivity === "strength"
                      ? "Weight sorts use the lightest or heaviest recorded set."
                      : "Distance sorts rank runs by total distance."}
                </span>
                {hasHistoryFilters && (
                  <button
                    className="workouts-text-button"
                    type="button"
                    onClick={clearHistoryFilters}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </>
          )}

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
          ) : workouts.length === 0 ? (
            <div className="workouts-empty">
              <span className="workouts-empty-index">01 / BEGIN</span>
              <div className="workouts-empty-mark" aria-hidden="true"><span /><span /><span /></div>
              <h3>Your first session starts here.</h3>
              <p>Log a lift or a run, then come back to see your training history take shape.</p>
              <button className="workouts-button workouts-button-primary" type="button" onClick={startNew}>Log your first session</button>
            </div>
          ) : filteredWorkouts.length === 0 ? (
            <div className="workouts-filter-empty" role="status">
              <h3>No matching sessions.</h3>
              <p>Try changing the search, date range, or activity filter.</p>
              <button className="workouts-text-button" type="button" onClick={clearHistoryFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="workout-list">
              {filteredWorkouts.map((workout, index) => (
                <li key={workout.id}>
                  <button
                    className={`workout-row${activeDetail?.workout.id === workout.id ? " is-selected" : ""}`}
                    type="button"
                    onClick={() => void openWorkout(workout.id)}
                    aria-label={`Open ${workout.title}, ${formatSessionDate(workout.performed_on)}`}
                    aria-current={activeDetail?.workout.id === workout.id ? "true" : undefined}
                  >
                    <span className="workout-row-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className={`workout-type-icon ${workout.activity_type}`} aria-hidden="true">
                      {workout.activity_type === "strength" ? "S" : "R"}
                    </span>
                    <span className="workout-row-copy">
                      <strong>{workout.title}</strong>
                      <span>{formatSessionDate(workout.performed_on)}</span>
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
              {formError && <p className="workout-form-message is-error" role="alert">{formError}</p>}

              <div className="workout-form-grid">
                <label className="workout-field workout-field-wide">
                  <span className="workout-field-label">Session name <i>Optional</i></span>
                  <input
                    id="workout-title"
                    value={draft.title}
                    onChange={(event) => updateDraft("title", event.target.value)}
                    maxLength={100}
                    autoFocus
                    placeholder="e.g. Upper body"
                    aria-invalid={Boolean(fieldErrors["workout-title"])}
                    aria-describedby={fieldErrors["workout-title"] ? "workout-title-error" : undefined}
                  />
                  {fieldErrors["workout-title"] && <span className="workout-field-error" id="workout-title-error">{fieldErrors["workout-title"]}</span>}
                </label>
                <label className="workout-field">
                  <span className="workout-field-label">Activity</span>
                  <select
                    value={draft.activity_type}
                    onChange={(event) => {
                      const activity = event.target.value as ActivityType;
                      setDraft((current) => current ? { ...current, activity_type: activity } : current);
                      setFormError("");
                      setFieldErrors({});
                    }}
                  >
                    <option value="strength">Strength</option>
                    <option value="run">Run</option>
                  </select>
                </label>
                <label className="workout-field">
                  <span className="workout-field-label">Date <i>Required</i></span>
                  <input
                    id="performed-on"
                    type="date"
                    value={draft.performed_on}
                    onChange={(event) => updateDraft("performed_on", event.target.value)}
                    aria-invalid={Boolean(fieldErrors["performed-on"])}
                    aria-describedby={fieldErrors["performed-on"] ? "performed-on-error" : undefined}
                  />
                  {fieldErrors["performed-on"] && <span className="workout-field-error" id="performed-on-error">{fieldErrors["performed-on"]}</span>}
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
                      <div className="exercise-row" key={exercise.id}>
                        <span className="set-row-number">{String(index + 1).padStart(2, "0")}</span>
                        <label className="exercise-field exercise-name">
                          <span className="exercise-field-label">EXERCISE</span>
                          <input
                            id={`exercise-${exercise.id}`}
                            value={exercise.exercise_name}
                            onChange={(event) => updateExercise(index, "exercise_name", event.target.value)}
                            placeholder="e.g. Bench press"
                            maxLength={80}
                            aria-invalid={Boolean(fieldErrors[exerciseErrorKey("exercise", exercise.id)])}
                            aria-describedby={fieldErrors[exerciseErrorKey("exercise", exercise.id)] ? `exercise-${exercise.id}-error` : undefined}
                          />
                          {fieldErrors[exerciseErrorKey("exercise", exercise.id)] && <span className="exercise-field-error" id={`exercise-${exercise.id}-error`}>{fieldErrors[exerciseErrorKey("exercise", exercise.id)]}</span>}
                        </label>
                        <label className="exercise-field exercise-sets">
                          <span className="exercise-field-label">SETS</span>
                          <input
                            id={`sets-${exercise.id}`}
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            inputMode="numeric"
                            value={exercise.set_count}
                            onChange={(event) => updateExercise(index, "set_count", event.target.value)}
                            placeholder="3"
                            aria-label={`Number of sets for exercise ${index + 1}`}
                            aria-invalid={Boolean(fieldErrors[exerciseErrorKey("sets", exercise.id)])}
                            aria-describedby={fieldErrors[exerciseErrorKey("sets", exercise.id)] ? `sets-${exercise.id}-error` : undefined}
                          />
                          {fieldErrors[exerciseErrorKey("sets", exercise.id)] && <span className="exercise-field-error" id={`sets-${exercise.id}-error`}>{fieldErrors[exerciseErrorKey("sets", exercise.id)]}</span>}
                        </label>
                        <label className="exercise-field exercise-reps">
                          <span className="exercise-field-label">REPS</span>
                          <input
                            id={`reps-${exercise.id}`}
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={exercise.reps}
                            onChange={(event) => updateExercise(index, "reps", event.target.value)}
                            placeholder="5"
                            aria-label={`Reps per set for exercise ${index + 1}`}
                            aria-invalid={Boolean(fieldErrors[exerciseErrorKey("reps", exercise.id)])}
                            aria-describedby={fieldErrors[exerciseErrorKey("reps", exercise.id)] ? `reps-${exercise.id}-error` : undefined}
                          />
                          {fieldErrors[exerciseErrorKey("reps", exercise.id)] && <span className="exercise-field-error" id={`reps-${exercise.id}-error`}>{fieldErrors[exerciseErrorKey("reps", exercise.id)]}</span>}
                        </label>
                        <label className="exercise-field exercise-load">
                          <span className="exercise-field-label">LOAD ({weightUnit})</span>
                          <input
                            id={`weight-${exercise.id}`}
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={exercise.weight}
                            onChange={(event) => updateExercise(index, "weight", event.target.value)}
                            placeholder="0"
                            aria-label={`Weight in ${weightUnit} for exercise ${index + 1}`}
                            aria-invalid={Boolean(fieldErrors[exerciseErrorKey("weight", exercise.id)])}
                            aria-describedby={fieldErrors[exerciseErrorKey("weight", exercise.id)] ? `weight-${exercise.id}-error` : undefined}
                          />
                          {fieldErrors[exerciseErrorKey("weight", exercise.id)] && <span className="exercise-field-error" id={`weight-${exercise.id}-error`}>{fieldErrors[exerciseErrorKey("weight", exercise.id)]}</span>}
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
                      <span className="workout-field-label">Distance <i>({distanceUnit})</i></span>
                      <input
                        id="distance"
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={draft.distance}
                        onChange={(event) => updateDraft("distance", event.target.value)}
                        placeholder={`0.0 ${distanceUnit}`}
                        aria-invalid={Boolean(fieldErrors.distance)}
                        aria-describedby={fieldErrors.distance ? "distance-error" : undefined}
                      />
                      {fieldErrors.distance && <span className="workout-field-error" id="distance-error">{fieldErrors.distance}</span>}
                    </label>
                    <label className="workout-field">
                      <span className="workout-field-label">Pace <i>min:sec / {distanceUnit}</i></span>
                      <input
                        id="pace"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        value={draft.pace}
                        onChange={(event) => updateDraft("pace", event.target.value)}
                        placeholder="8:30"
                        aria-invalid={Boolean(fieldErrors.pace)}
                        aria-describedby={fieldErrors.pace ? "pace-hint pace-error" : "pace-hint"}
                      />
                      {fieldErrors.pace && <span className="workout-field-error" id="pace-error">{fieldErrors.pace}</span>}
                    </label>
                    <label className="workout-field">
                      <span className="workout-field-label">Calories <i>kcal · Optional</i></span>
                      <input
                        id="calories"
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={draft.calories}
                        onChange={(event) => updateDraft("calories", event.target.value)}
                        placeholder="Optional"
                        aria-invalid={Boolean(fieldErrors.calories)}
                        aria-describedby={fieldErrors.calories ? "calories-error" : undefined}
                      />
                      {fieldErrors.calories && <span className="workout-field-error" id="calories-error">{fieldErrors.calories}</span>}
                    </label>
                  </div>
                  <p className="workout-hint" id="pace-hint">Enter pace as minutes:seconds per {distanceUnit}, such as 8:30. Whole minutes like 9 mean 9:00.</p>
                </div>
              )}

              <label className="workout-field workout-notes-field">
                <span className="workout-field-label">Notes <i>Optional</i></span>
                <textarea value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} rows={3} maxLength={2000} placeholder="How did it feel? Anything to remember…" />
              </label>
              {detailError && <p className="workout-form-message is-error" role="alert">{detailError}</p>}
              <div className="workout-form-actions">
                {activeDetail && <button className="workouts-button workouts-button-danger" type="button" onClick={() => {
                  setEditing(false);
                  setFormError("");
                  setFieldErrors({});
                }}>Cancel</button>}
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
                <div><span>PERFORMED ON</span><strong>{formatSessionDate(activeDetail.workout.performed_on)}</strong></div>
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
                  <div><span>CALORIES</span><strong>{activeDetail.runDetails.calories == null ? "Not logged" : <>{activeDetail.runDetails.calories}<i>kcal</i></>}</strong></div>
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
                <button
                  className="workouts-button workouts-button-quiet"
                  type="button"
                  onClick={() => setTemplateSourceWorkout(activeDetail)}
                >
                  Save as template
                </button>
                <button className="workouts-button workouts-button-primary" type="button" onClick={() => {
                  setDraft(draftFromDetail(activeDetail, weightUnit, distanceUnit));
                  setEditing(true);
                  setFormError("");
                  setFieldErrors({});
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
