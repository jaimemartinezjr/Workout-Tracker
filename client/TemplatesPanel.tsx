import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatPaceInput } from "./pace";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  setTemplateStar,
  updateTemplate,
  type TemplateInput,
  type WorkoutTemplate,
} from "./templatesApi";
import type { ActivityType, WorkoutDetail } from "./workoutsApi";

type Props = {
  getToken: () => Promise<string | null>;
  weightUnit: "kg" | "lb";
  distanceUnit: "km" | "mi";
  sourceWorkout: WorkoutDetail | null;
  onSourceWorkoutHandled: () => void;
  onUseTemplate: (template: WorkoutTemplate) => void;
  disableUse: boolean;
};

type StrengthItemDraft = {
  id: string;
  exercise_name: string;
  sets: string;
  reps: string;
  weight: string;
};

type TemplateDraft = {
  name: string;
  activity_type: ActivityType;
  exercises: StrengthItemDraft[];
  distance: string;
  pace: string;
};

const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;
let nextItemId = 0;

function newStrengthItem(): StrengthItemDraft {
  nextItemId += 1;
  return {
    id: String(nextItemId),
    exercise_name: "",
    sets: "3",
    reps: "",
    weight: "",
  };
}

function newTemplateDraft(activity_type: ActivityType = "strength"): TemplateDraft {
  return {
    name: "",
    activity_type,
    exercises: [newStrengthItem()],
    distance: "",
    pace: "",
  };
}

function draftFromWorkout(
  detail: WorkoutDetail,
  weightUnit: Props["weightUnit"],
  distanceUnit: Props["distanceUnit"],
): TemplateDraft {
  if (detail.workout.activity_type === "strength") {
    const multiplier = weightUnit === "lb" ? 1 / KG_PER_LB : 1;
    const exercises: StrengthItemDraft[] = [];
    for (const set of [...detail.sets].sort((left, right) => left.set_number - right.set_number)) {
      const weight = String(Number((set.weight_kg * multiplier).toFixed(2)));
      const reps = String(set.reps);
      const previous = exercises[exercises.length - 1];
      if (
        previous &&
        previous.exercise_name === set.exercise_name &&
        previous.weight === weight &&
        previous.reps === reps
      ) {
        previous.sets = String(Number(previous.sets) + 1);
      } else {
        const item = newStrengthItem();
        exercises.push({
          ...item,
          exercise_name: set.exercise_name,
          sets: "1",
          reps,
          weight,
        });
      }
    }
    return {
      ...newTemplateDraft("strength"),
      name: detail.workout.title,
      exercises: exercises.length ? exercises : [newStrengthItem()],
    };
  }

  const run = detail.runDetails;
  const distanceMultiplier = distanceUnit === "mi" ? 1 / KM_PER_MI : 1;
  const paceMultiplier = distanceUnit === "mi" ? KM_PER_MI : 1;
  return {
    ...newTemplateDraft("run"),
    name: detail.workout.title,
    distance: run
      ? String(Number((run.distance_km * distanceMultiplier).toFixed(2)))
      : "",
    pace: run
      ? String(Number(((run.pace_seconds_per_km * paceMultiplier) / 60).toFixed(4)))
      : "",
  };
}

function draftFromTemplate(
  template: WorkoutTemplate,
  weightUnit: Props["weightUnit"],
  distanceUnit: Props["distanceUnit"],
): TemplateDraft {
  if (template.activity_type === "strength") {
    const weightMultiplier = weightUnit === "lb" ? 1 / KG_PER_LB : 1;
    const exercises = [...template.items]
      .sort((left, right) => left.position - right.position)
      .map((item) => ({
        ...newStrengthItem(),
        exercise_name: item.exercise_name ?? "",
        sets: String(item.planned_sets ?? 3),
        reps: item.planned_reps == null ? "" : String(item.planned_reps),
        weight: item.planned_weight_kg == null
          ? ""
          : String(Number((item.planned_weight_kg * weightMultiplier).toFixed(2))),
      }));
    return {
      ...newTemplateDraft("strength"),
      name: template.name,
      exercises: exercises.length ? exercises : [newStrengthItem()],
    };
  }

  const item = template.items[0];
  const distanceMultiplier = distanceUnit === "mi" ? 1 / KM_PER_MI : 1;
  const paceMultiplier = distanceUnit === "mi" ? KM_PER_MI : 1;
  return {
    ...newTemplateDraft("run"),
    name: template.name,
    distance: item?.planned_distance_km == null
      ? ""
      : String(Number((item.planned_distance_km * distanceMultiplier).toFixed(2))),
    pace: item?.planned_pace_seconds_per_km == null
      ? ""
      : String(Number(((item.planned_pace_seconds_per_km * paceMultiplier) / 60).toFixed(4))),
  };
}

function makeTemplateInput(
  draft: TemplateDraft,
  weightUnit: Props["weightUnit"],
  distanceUnit: Props["distanceUnit"],
): { input?: TemplateInput; error?: string } {
  const name = draft.name.trim();
  if (!name || name.length > 100) {
    return { error: "Enter a template name up to 100 characters." };
  }

  if (draft.activity_type === "strength") {
    if (!draft.exercises.length || draft.exercises.length > 40) {
      return { error: "Add between 1 and 40 exercises." };
    }
    const items: Extract<TemplateInput, { activity_type: "strength" }>["items"] = [];
    for (const exercise of draft.exercises) {
      const exerciseName = exercise.exercise_name.trim();
      const sets = Number(exercise.sets);
      const reps = Number(exercise.reps);
      const weight = Number(exercise.weight);
      if (!exerciseName || exerciseName.length > 120) {
        return { error: "Enter an exercise name up to 120 characters." };
      }
      if (!Number.isInteger(sets) || sets < 1 || sets > 100) {
        return { error: "Enter a whole number of sets from 1 to 100." };
      }
      if (!Number.isInteger(reps) || reps < 1 || reps > 10000) {
        return { error: "Enter a whole number of reps from 1 to 10,000." };
      }
      if (exercise.weight === "" || !Number.isFinite(weight) || weight < 0) {
        return { error: `Enter a weight of zero or more ${weightUnit}.` };
      }
      items.push({
        exercise_name: exerciseName,
        planned_sets: sets,
        planned_reps: reps,
        planned_weight_kg: Number(
          (weight * (weightUnit === "lb" ? KG_PER_LB : 1)).toFixed(3),
        ),
      });
    }
    return { input: { name, activity_type: "strength", items } };
  }

  const distance = Number(draft.distance);
  const pace = Number(draft.pace);
  if (draft.distance === "" || !Number.isFinite(distance) || distance <= 0) {
    return { error: `Enter a planned distance greater than zero in ${distanceUnit}.` };
  }
  if (draft.pace === "" || !Number.isFinite(pace) || pace <= 0) {
    return { error: `Enter a planned pace greater than zero in minutes per ${distanceUnit}.` };
  }

  return {
    input: {
      name,
      activity_type: "run",
      items: [{
        planned_distance_km: Number(
          (distance * (distanceUnit === "mi" ? KM_PER_MI : 1)).toFixed(3),
        ),
        planned_pace_seconds_per_km: Math.round(
          (pace * 60) / (distanceUnit === "mi" ? KM_PER_MI : 1),
        ),
      }],
    },
  };
}

function templateSummary(template: WorkoutTemplate, weightUnit: Props["weightUnit"], distanceUnit: Props["distanceUnit"]) {
  if (template.activity_type === "run") {
    const item = template.items[0];
    if (!item?.planned_distance_km || !item.planned_pace_seconds_per_km) {
      return "Running template";
    }
    const distance = item.planned_distance_km * (distanceUnit === "mi" ? 1 / KM_PER_MI : 1);
    const pace = Math.round(
      item.planned_pace_seconds_per_km * (distanceUnit === "mi" ? KM_PER_MI : 1),
    );
    return `${Number(distance.toFixed(2))} ${distanceUnit} · ${formatPaceInput(pace)} / ${distanceUnit}`;
  }
  const exercises = [...new Set(
    template.items
      .map((item) => item.exercise_name)
      .filter((name): name is string => Boolean(name)),
  )];
  if (!exercises.length) return "Strength template";
  const firstItem = template.items.find((item) => item.exercise_name === exercises[0]);
  const first = firstItem?.exercise_name ?? exercises[0];
  const plan = firstItem
    ? ` ${firstItem.planned_sets ?? ""}×${firstItem.planned_reps ?? ""} @ ${
        firstItem.planned_weight_kg == null
          ? "—"
          : Number((firstItem.planned_weight_kg * (weightUnit === "lb" ? 1 / KG_PER_LB : 1)).toFixed(1))
      } ${weightUnit}`
    : "";
  const more = exercises.length > 1 ? ` + ${exercises.length - 1} more` : "";
  return `${exercises.length} ${exercises.length === 1 ? "exercise" : "exercises"} · ${first}${plan}${more}`;
}

export default function TemplatesPanel({
  getToken,
  weightUnit,
  distanceUnit,
  sourceWorkout,
  onSourceWorkoutHandled,
  onUseTemplate,
  disableUse,
}: Props) {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(() => newTemplateDraft());
  const [editorError, setEditorError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isFromWorkout, setIsFromWorkout] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "starred">("all");
  const [updatingStarIds, setUpdatingStarIds] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setTemplates(await listTemplates(getToken));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Your templates couldn't be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sourceWorkout) return;
    setDraft(draftFromWorkout(sourceWorkout, weightUnit, distanceUnit));
    setIsFromWorkout(true);
    setEditingTemplateId(null);
    setEditorError("");
    setEditorOpen(true);
    onSourceWorkoutHandled();
  }, [sourceWorkout, weightUnit, distanceUnit, onSourceWorkoutHandled]);

  useEffect(() => {
    if (!editorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        setEditorOpen(false);
        setEditorError("");
        setEditingTemplateId(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editorOpen, saving]);

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditorError("");
    setEditingTemplateId(null);
  };

  const startManualTemplate = () => {
    setDraft(newTemplateDraft());
    setIsFromWorkout(false);
    setEditingTemplateId(null);
    setEditorError("");
    setEditorOpen(true);
  };

  const startEditingTemplate = (template: WorkoutTemplate) => {
    setDraft(draftFromTemplate(template, weightUnit, distanceUnit));
    setIsFromWorkout(false);
    setEditingTemplateId(template.id);
    setEditorError("");
    setEditorOpen(true);
  };

  const moveExercise = (index: number, offset: -1 | 1) => {
    setDraft((current) => {
      const targetIndex = index + offset;
      if (targetIndex < 0 || targetIndex >= current.exercises.length) return current;
      const exercises = [...current.exercises];
      [exercises[index], exercises[targetIndex]] = [exercises[targetIndex], exercises[index]];
      return { ...current, exercises };
    });
    setEditorError("");
  };

  const updateExercise = (
    index: number,
    key: Exclude<keyof StrengthItemDraft, "id">,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, itemIndex) =>
        itemIndex === index ? { ...exercise, [key]: value } : exercise,
      ),
    }));
    setEditorError("");
  };

  const saveTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditorError("");
    const result = makeTemplateInput(draft, weightUnit, distanceUnit);
    if (!result.input) {
      setEditorError(result.error ?? "Complete the template details before saving.");
      return;
    }

    setSaving(true);
    try {
      const saved = editingTemplateId
        ? await updateTemplate(getToken, editingTemplateId, result.input)
        : await createTemplate(getToken, result.input);
      setTemplates((current) => editingTemplateId
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current.filter((item) => item.id !== saved.id)]);
      if (!editingTemplateId) setView("all");
      setEditorOpen(false);
      setEditingTemplateId(null);
    } catch (error) {
      setEditorError(
        error instanceof Error ? error.message : "This template couldn't be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (template: WorkoutTemplate) => {
    if (!window.confirm(`Delete “${template.name}”? Logged workouts will not be changed.`)) return;
    setLoadError("");
    try {
      await deleteTemplate(getToken, template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "This template couldn't be removed.",
      );
    }
  };

  const toggleTemplateStar = async (template: WorkoutTemplate) => {
    const starred = !template.is_starred;
    setActionError("");
    setUpdatingStarIds((current) => new Set(current).add(template.id));
    try {
      await setTemplateStar(getToken, template.id, starred);
      setTemplates((current) => current.map((item) =>
        item.id === template.id ? { ...item, is_starred: starred } : item
      ));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "We couldn't update this template. Please try again.",
      );
    } finally {
      setUpdatingStarIds((current) => {
        const next = new Set(current);
        next.delete(template.id);
        return next;
      });
    }
  };

  const starredCount = templates.filter((template) => template.is_starred).length;
  const visibleTemplates = view === "starred"
    ? templates.filter((template) => template.is_starred)
    : templates;

  return (
    <section className="templates-section" aria-labelledby="templates-title">
      <header className="templates-heading">
        <div>
          <span className="workouts-overline">YOUR REUSABLE ROUTINES</span>
          <h2 id="templates-title">Templates</h2>
        </div>
        <button
          className="workouts-button workouts-button-quiet"
          type="button"
          onClick={startManualTemplate}
        >
          <span aria-hidden="true">+</span> Create template
        </button>
      </header>

      {loadError && (
        <div className="templates-message is-error" role="alert">
          <span>{loadError}</span>
          <button className="workouts-text-button" type="button" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}

      {actionError && (
        <p className="templates-message is-error" role="alert">{actionError}</p>
      )}

      {!loading && templates.length > 0 && (
        <div className="template-view-switch" role="group" aria-label="Template view">
          <button
            type="button"
            className="template-view-button"
            aria-pressed={view === "all"}
            onClick={() => setView("all")}
          >
            All <span>{templates.length}</span>
          </button>
          <button
            type="button"
            className="template-view-button"
            aria-pressed={view === "starred"}
            onClick={() => setView("starred")}
          >
            Starred <span>{starredCount}</span>
          </button>
        </div>
      )}

      {loading ? (
        <p className="templates-message" aria-live="polite">Loading your templates…</p>
      ) : templates.length === 0 ? (
        <p className="templates-message">Create one here or save a completed session to reuse it next time.</p>
      ) : visibleTemplates.length === 0 ? (
        <p className="templates-message">No starred templates yet. Star a routine to find it here.</p>
      ) : (
        <div className="template-list">
          {visibleTemplates.map((template) => (
            <article className="template-card" key={template.id}>
              <div className="template-card-copy">
                <span className={`template-type ${template.activity_type}`}>
                  {template.activity_type === "strength" ? "STRENGTH" : "RUN"}
                </span>
                <h3>{template.name}</h3>
                <p>{templateSummary(template, weightUnit, distanceUnit)}</p>
              </div>
              <div className="template-card-actions">
                <button
                  className={`template-star-button${template.is_starred ? " is-starred" : ""}`}
                  type="button"
                  onClick={() => void toggleTemplateStar(template)}
                  disabled={updatingStarIds.has(template.id)}
                  aria-label={`${template.is_starred ? "Remove" : "Add"} ${template.name} ${template.is_starred ? "from" : "to"} starred templates`}
                  aria-pressed={template.is_starred}
                  title={template.is_starred ? "Remove from Starred" : "Add to Starred"}
                >
                  <span aria-hidden="true">{template.is_starred ? "★" : "☆"}</span>
                </button>
                <button
                  className="workouts-button workouts-button-primary"
                  type="button"
                  onClick={() => onUseTemplate(template)}
                  disabled={disableUse}
                >
                  Use template
                </button>
                <button
                  className="workouts-text-button"
                  type="button"
                  onClick={() => startEditingTemplate(template)}
                  aria-label={`Edit ${template.name} template`}
                >
                  Edit
                </button>
                <button
                  className="workouts-text-button is-danger"
                  type="button"
                  onClick={() => void removeTemplate(template)}
                  aria-label={`Delete ${template.name} template`}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editorOpen && (
        <div className="template-editor-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeEditor();
        }}>
          <section
            className="template-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-editor-title"
          >
            <header className="template-editor-heading">
              <div>
                <span className="workouts-overline">
                  {isFromWorkout
                    ? "SAVE A REUSABLE ROUTINE"
                    : editingTemplateId
                      ? "EDIT A SAVED ROUTINE"
                      : "BUILD A REUSABLE ROUTINE"}
                </span>
                <h2 id="template-editor-title">
                  {isFromWorkout
                    ? "Save as template"
                    : editingTemplateId
                      ? "Edit template"
                      : "Create template"}
                </h2>
              </div>
              <button
                className="workouts-icon-button"
                type="button"
                onClick={closeEditor}
                aria-label="Close template form"
                disabled={saving}
              >
                ×
              </button>
            </header>

            <form onSubmit={saveTemplate} noValidate>
              <label className="workout-field template-name-field">
                <span className="workout-field-label">Template name <i>Required</i></span>
                <input
                  value={draft.name}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, name: event.target.value }));
                    setEditorError("");
                  }}
                  maxLength={100}
                  autoFocus
                  placeholder="e.g. Push day"
                />
              </label>

              <label className="workout-field template-activity-field">
                <span className="workout-field-label">Activity</span>
                <select
                  value={draft.activity_type}
                  onChange={(event) => {
                    const activity = event.target.value as ActivityType;
                    setDraft((current) => ({
                      ...newTemplateDraft(activity),
                      name: current.name,
                    }));
                    setIsFromWorkout(false);
                    setEditorError("");
                  }}
                >
                  <option value="strength">Strength</option>
                  <option value="run">Run</option>
                </select>
              </label>

              {draft.activity_type === "strength" ? (
                <div className="template-entry-section">
                  <div className="template-entry-heading">
                    <h3>Exercises</h3>
                    <button
                      className="workouts-text-button"
                      type="button"
                      onClick={() => {
                        setDraft((current) => ({
                          ...current,
                          exercises: [...current.exercises, newStrengthItem()],
                        }));
                        setEditorError("");
                      }}
                      disabled={draft.exercises.length >= 40}
                    >
                      + Add exercise
                    </button>
                  </div>
                  <div className="template-strength-list">
                    {draft.exercises.map((exercise, index) => (
                      <div className="template-strength-row" key={exercise.id}>
                        <label className="workout-field">
                          <span className="workout-field-label">Exercise</span>
                          <input
                            value={exercise.exercise_name}
                            onChange={(event) => updateExercise(index, "exercise_name", event.target.value)}
                            maxLength={120}
                            placeholder="e.g. Bench press"
                          />
                        </label>
                        <label className="workout-field">
                          <span className="workout-field-label">Sets</span>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            inputMode="numeric"
                            value={exercise.sets}
                            onChange={(event) => updateExercise(index, "sets", event.target.value)}
                          />
                        </label>
                        <label className="workout-field">
                          <span className="workout-field-label">Reps</span>
                          <input
                            type="number"
                            min="1"
                            max="10000"
                            step="1"
                            inputMode="numeric"
                            value={exercise.reps}
                            onChange={(event) => updateExercise(index, "reps", event.target.value)}
                          />
                        </label>
                        <label className="workout-field">
                          <span className="workout-field-label">Load ({weightUnit})</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={exercise.weight}
                            onChange={(event) => updateExercise(index, "weight", event.target.value)}
                          />
                        </label>
                        <div className="template-item-order-actions">
                          <button
                            className="set-remove template-item-reorder"
                            type="button"
                            onClick={() => moveExercise(index, -1)}
                            aria-label={`Move ${exercise.exercise_name || `exercise ${index + 1}`} up`}
                            disabled={index === 0}
                          >
                            ↑
                          </button>
                          <button
                            className="set-remove template-item-reorder"
                            type="button"
                            onClick={() => moveExercise(index, 1)}
                            aria-label={`Move ${exercise.exercise_name || `exercise ${index + 1}`} down`}
                            disabled={index === draft.exercises.length - 1}
                          >
                            ↓
                          </button>
                          <button
                            className="set-remove template-item-remove"
                            type="button"
                            onClick={() => setDraft((current) => ({
                              ...current,
                              exercises: current.exercises.filter((item) => item.id !== exercise.id),
                            }))}
                            aria-label={`Remove ${exercise.exercise_name || `exercise ${index + 1}`}`}
                            disabled={draft.exercises.length <= 1}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="workout-hint">Set a planned load in {weightUnit}; users can adjust it before logging.</p>
                </div>
              ) : (
                <div className="template-entry-section">
                  <h3>Run details</h3>
                  <div className="workout-form-grid run-fields">
                    <label className="workout-field">
                      <span className="workout-field-label">Distance <i>({distanceUnit})</i></span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={draft.distance}
                        onChange={(event) => {
                          setDraft((current) => ({ ...current, distance: event.target.value }));
                          setEditorError("");
                        }}
                        placeholder={`0.0 ${distanceUnit}`}
                      />
                    </label>
                    <label className="workout-field">
                      <span className="workout-field-label">Pace <i>min / {distanceUnit}</i></span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={draft.pace}
                        onChange={(event) => {
                          setDraft((current) => ({ ...current, pace: event.target.value }));
                          setEditorError("");
                        }}
                        placeholder="e.g. 8.5 for 8:30"
                      />
                    </label>
                  </div>
                  <p className="workout-hint">Calories are entered for each actual run, not stored in the template.</p>
                </div>
              )}

              {editorError && <p className="template-editor-error" role="alert">{editorError}</p>}
              <div className="template-editor-actions">
                <button
                  className="workouts-button workouts-button-quiet"
                  type="button"
                  onClick={closeEditor}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button className="workouts-button workouts-button-primary" type="submit" disabled={saving}>
                  {saving
                    ? "Saving…"
                    : editingTemplateId
                      ? "Save changes"
                      : "Save template"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
