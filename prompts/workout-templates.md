# Workout templates

## User story
As a user, I want to create and reuse strength or running workout templates, so I don't have to enter each workout from scratch.

## Key implementation prompt
Build the workout-template feature on `13-workout-templates` and link it to GitHub Issue #13. Support both creating a template directly and saving a completed workout as a template. Strength templates store an ordered exercise list with planned sets, reps, and weight; running templates store distance and pace. When a user chooses a template, prefill a new workout form for review and editing instead of immediately saving a workout. Use today's date, the account's current kg/lb and km/mi preferences, and leave run calories for the user to enter for that actual session. Persist templates and ordered items in PostgreSQL, scope all reads and writes to the authenticated Clerk user, validate input on the server, and create template/item rows transactionally. Allow users to remove templates without changing logged workouts. Keep existing auth and workout behavior unchanged; do not add template starring, search, or dashboard features.
