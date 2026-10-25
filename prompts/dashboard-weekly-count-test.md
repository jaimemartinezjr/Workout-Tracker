# Dashboard weekly workout-count test

## User story
Given a user has exactly three workouts dated in the current week, when the dashboard loads, then the “Workouts this week” stat displays 3.

## Key prompt
Write an integration test that creates a unique test user and workouts in the development PostgreSQL database, then loads the dashboard against the real progress overview route and verifies the weekly stat displays 3. Include dates just outside the week to verify the date boundaries. Always delete the test user's records, including when an assertion fails. Keep Clerk sign-in code unchanged.

## Red/green proof
Temporarily move the weekly query's start boundary forward by one day, run `npm run test:dashboard-stat`, and capture the failing dashboard. Restore the query and rerun the same test for the passing screenshot. Set `DASHBOARD_TEST_SCREENSHOT` to the image path for each run.

## Regression explanation
If the weekly count query starts one day late or otherwise excludes a workout within the selected week, this test no longer displays 3.
