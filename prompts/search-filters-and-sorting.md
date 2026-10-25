# Search, filter, and sort workouts

## User story
As a user, I want to search and filter my workouts by date, activity, or exercise and sort them (newest first, or by weight/distance), so I can find a past session quickly.

## Key implementation prompt
Add workout history search across exercise names, session titles, and notes; date-range and activity filters; and six clear sort choices: newest, oldest, farthest distance, shortest distance, highest recorded set weight, and lowest recorded set weight. Keep weight sorts available for Strength sessions and distance sorts available for Running sessions, so incompatible units are never compared. Keep newest-first as the default, support clearing all controls, show a helpful no-match state, preserve owner-scoped queries and the existing Clerk sign-in code, and test all sort modes plus mobile layout.
