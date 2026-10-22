# Workout details feature

Issue: [#5 — Workout details](https://github.com/jaimemartinezjr/Workout-Tracker/issues/5)

## User story

As a user, I want to add a dated strength or running workout, view its details, edit it, and delete it with confirmation, so I can maintain an accurate workout history.

## Key implementation prompt

Build the workout create, list, detail, edit, and confirmed-delete flows for each signed-in user's own data in this existing React + TypeScript app. Follow `PLAN.md` for the relational model: workouts belong to Clerk-backed users; strength workouts have lifting-set rows, runs have one run-details row, and weight/distance are stored canonically in kg/km. Validate required data on the client and server, use transactions for parent/child writes, and never accept an owner ID from the browser. Derive ownership from the verified Clerk session, scope every parent and child query to that user, and make another user's workout inaccessible even when its ID is known. Add an idempotent development schema migration and describe safe production migration steps without connecting to or modifying production. Do not add goals, charts, templates, stars, search/sorting, or dashboard features. Do not publish, deploy, open a PR, or merge.

## Follow-up prompt

Run `npm run test:data-isolation` and `npm run build`. Verify in code that list, detail, update, delete, and child-record queries use the server-verified Clerk user ID; check the create/edit/delete UI and unit conversions. The isolation test must run without Clerk credentials and without connecting to the development or production database. Report failures honestly; do not claim a live sign-in or database test unless one was actually performed.

## Preview feedback prompt

Add a user-selectable, account-persisted weight unit switch between kg and lb. Keep stored loads canonical in kilograms and convert displayed values when switching units, including any workout draft currently being edited. Change strength entry to the conventional format of sets × reps at one load per exercise, such as 3 sets × 5 reps at 275 lb. Preserve existing workouts with different weights or rep counts across sets when editing them.

## Exercise-entry layout correction prompt

Correct the strength-entry layout after preview feedback: align each desktop column heading with its input, keep the exercise name in the Exercise field, and give sets, reps, and load fields enough room to show their full values on narrow screens. Show the field labels alongside the inputs on mobile instead of relying only on the desktop table header.

## Verification notes

- Exact isolated test command: `npm run test:data-isolation`.
- The test sends User B's request through the real Express workout router while a test-only in-memory SQL double holds User A's workout. User B should get an empty list and `404` for the known detail ID.
- A realistic regression is removing `AND user_id = $1` from the list query or `AND user_id = $2` from the workout-detail query; the corresponding isolation assertion must fail.
- Red/green demonstration steps: in `server/workouts.ts`, temporarily remove `WHERE user_id = $1` from the list query and change the detail lookup from `WHERE id = $1 AND user_id = $2` to `WHERE id = $1`. Run `npm run test:data-isolation` and confirm both tests fail. Restore both ownership predicates, run the same command again, and confirm both tests pass.
- Captured red output (owner predicates temporarily removed):

  ```text
  > workout-tracker@0.1.0 test:data-isolation
  > tsx --test server/workouts.test.ts

  ✖ a different user cannot see another user's workout in the list
  ✖ a different user cannot open another user's workout by its known ID
  ℹ tests 2
  ℹ pass 0
  ℹ fail 2

  List assertion: User B received User A's workout instead of an empty list.
  Detail assertion: 200 !== 404
  Exit code: 1
  ```

- Captured green output (both predicates restored):

  ```text
  > workout-tracker@0.1.0 test:data-isolation
  > tsx --test server/workouts.test.ts

  ✔ a different user cannot see another user's workout in the list
  ✔ a different user cannot open another user's workout by its known ID
  ℹ tests 2
  ℹ pass 2
  ℹ fail 0
  Exit code: 0
  ```

- This environment does not provide a screenshot capture of shell test output. No test-output screenshots are included; Jaime can run the exact command and capture terminal output before opening the feature PR.
- All database and Clerk values remain environment-provided placeholders. Production migration instructions are in `README.md`; production was not connected to or modified.
