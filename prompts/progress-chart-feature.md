# Progress charts

## User story
As a user, I want to view progress charts over time against my goals, so I can see how my training is changing and how close I am to each target.

## Key implementation prompt
Build the progress-chart feature on `11-progress-chart-feature` and link it to GitHub Issue #11. Show one strength chart per lift goal for top weight against target weight; keep target reps visible in the goal summary, but do not chart reps. Show run progress for each run goal (distance and pace), with a visible goal reference line on each chart. Use the existing canonical kg/km data and the user's current display units. Match lift names without case sensitivity, scope all progress queries to the authenticated user, show clear loading/error/empty states, and refresh charts when workouts or goals change. Use the project's Recharts plan, keep the existing Clerk auth unchanged, and do not add placeholder workout data or unrelated dashboard statistics.
