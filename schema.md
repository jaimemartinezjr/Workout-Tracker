# Database schema

The app stores its data in the PostgreSQL `public` schema. User IDs are the text IDs supplied by Clerk. Workout weights and distances are stored canonically in kilograms and kilometers; the UI converts them to the user's selected units.

## Tables and columns

### `users`

- `id TEXT` — primary key; the user's Clerk account ID.
- `email TEXT NOT NULL` — email associated with the account.
- `weight_unit TEXT NOT NULL DEFAULT 'kg'` — constrained to `kg` or `lb`.
- `distance_unit TEXT NOT NULL DEFAULT 'km'` — constrained to `km` or `mi`.
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — account row creation time.

### `workouts`

- `id TEXT` — primary key.
- `user_id TEXT NOT NULL` — foreign key to `users.id`; deleting a user deletes their workouts.
- `title TEXT NOT NULL` — 1–120 non-whitespace characters.
- `activity_type TEXT NOT NULL` — `strength` or `run`.
- `performed_on DATE NOT NULL` — local calendar date recorded for the workout.
- `notes TEXT` — optional, up to 2,000 characters.
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

### `lifting_sets`

- `id TEXT` — primary key.
- `workout_id TEXT NOT NULL` — foreign key to `workouts.id`; deleting a workout deletes its sets.
- `exercise_name TEXT NOT NULL` — 1–120 non-whitespace characters.
- `set_number INTEGER NOT NULL` — positive set position.
- `weight_kg NUMERIC(8, 3) NOT NULL` — non-negative weight in kilograms.
- `reps INTEGER NOT NULL` — positive rep count.
- A workout cannot contain duplicate set numbers for the same exercise.

### `run_details`

- `workout_id TEXT` — both primary key and foreign key to `workouts.id`; deleting a workout deletes its run details.
- `distance_km NUMERIC(8, 3) NOT NULL` — positive distance in kilometers.
- `pace_seconds_per_km INTEGER NOT NULL` — positive pace in seconds per kilometer.
- `calories INTEGER NOT NULL` — non-negative calories.

Because `workout_id` is the primary key, a workout can have at most one run-details row.

### `goals`

- `id TEXT` — primary key.
- `user_id TEXT NOT NULL` — foreign key to `users.id`; deleting a user deletes their goals.
- `goal_type TEXT NOT NULL` — `strength` or `run`.
- `exercise_name TEXT` — required for strength goals; null for run goals.
- `target_weight_kg NUMERIC(8, 3)` — strength target, non-negative.
- `target_reps INTEGER` — strength target, positive.
- `target_distance_km NUMERIC(8, 3)` — run target, positive.
- `target_pace_seconds_per_km NUMERIC(10, 4)` — run target, positive; fractional precision preserves entered pace.
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

The table constraint requires the strength fields for a strength goal and the run fields for a run goal; fields for the other goal type must be null.

### `templates`

- `id TEXT` — primary key.
- `user_id TEXT NOT NULL` — foreign key to `users.id`; deleting a user deletes their templates.
- `name TEXT NOT NULL` — 1–100 non-whitespace characters.
- `activity_type TEXT NOT NULL` — `strength` or `run`.
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

### `template_items`

- `id TEXT` — primary key.
- `template_id TEXT NOT NULL` — foreign key to `templates.id`; deleting a template deletes its items.
- `position INTEGER NOT NULL` — positive order within the template; positions are unique per template.
- `exercise_name TEXT` — strength-template exercise name.
- `planned_sets INTEGER` — positive strength-template set count.
- `planned_reps INTEGER` — positive strength-template rep count.
- `planned_weight_kg NUMERIC(8, 3)` — non-negative planned strength weight in kilograms.
- `planned_distance_km NUMERIC(8, 3)` — positive planned run distance in kilometers.
- `planned_pace_seconds_per_km INTEGER` — positive planned run pace in seconds per kilometer.

Each item must contain either the strength-planning fields or the run-planning fields.

### `stars`

- `user_id TEXT NOT NULL` — foreign key to `users.id`.
- `template_id TEXT NOT NULL` — foreign key to `templates.id`.
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- The combined `(user_id, template_id)` is the primary key, so one user can star a template only once. Deleting the user or template deletes the star.

## Relationships

```text
users 1 ──── * workouts 1 ──── * lifting_sets
                    │
                    └─── 0..1 run_details

users 1 ──── * goals
users 1 ──── * templates 1 ──── * template_items
users * ──── * templates       (through the shared stars table)
```

`lifting_sets` and `run_details` inherit user ownership through their parent workout. Foreign keys cascade deletions from parent records.

## Comparison with `PLAN.md`, section 3

All eight planned tables are present: `users`, `workouts`, `lifting_sets`, `run_details`, `goals`, `templates`, `template_items`, and the shared `stars` junction table. The planned ownership, workout-child, template-item, and user-template-star relationships are implemented.

The implementation differs in a few column details:

- `users.created_at` and the other creation/update timestamps use `TIMESTAMPTZ`, rather than a date-only value.
- Goals use `goal_type` (the plan called this `activity_type`), and add `updated_at`.
- The plan included a goal `is_active` flag, but the database has no such column. Goals are edited or deleted; they are not archived with an active/inactive flag.
- Goal pace uses `NUMERIC(10, 4)` so fractional seconds are retained. Other planned entity and relationship fields are represented in the tables above.

The implementation therefore matches the planned table structure and relationships, with the goal active flag omitted and timestamp/goal-type details changed.
