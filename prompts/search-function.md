# Search and filter workouts

## User story
As a user, I want to search and filter my workouts by date, activity, or exercise and sort them (newest first, or by weight/distance), so I can find a past session quickly.

## Key implementation prompt
Add search and filters to the workout history for exercise, workout title, and notes; a start/end date range; and activity type. Keep newest-first as the default. When Strength is selected, allow sorting by the heaviest lift in each session; when Running is selected, allow sorting by longest distance. Do not compare weight and distance across different activity types. Include a clear-filters action and a helpful empty state when no sessions match. Keep the user-scoped workout query and existing Clerk sign-in code unchanged. Add logic, API-summary, and narrow-screen UI tests.
