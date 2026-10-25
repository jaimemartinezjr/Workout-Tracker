# Workout stats and progress charts

## User story
As a user, I want charts showing a selected lift's weight and reps over time and running distance and pace over time, plus stats for workouts this week, heaviest set, and longest run distance, so I can check my training at a glance.

## Key implementation prompt
Add a progress overview with weekly workout count, all-time heaviest set, and longest run distance. Add a selectable lift trend with strongest set weight and its reps per workout, plus running distance and pace trends. Convert weight, distance, and pace using the user's selected display units. Calculate the week from the user's local Monday, keep all progress queries scoped to the signed-in user, preserve the existing goal-comparison charts and Clerk authentication, and test API normalization, empty states, conversions, and mobile layout.
