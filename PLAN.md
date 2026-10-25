# Strength & Performance Tracker - Plan

## 1. Pitch

I'm building a strength and performance tracker because I work out five times a week and want to see how my training changes over time. For strength sessions, I want to log each exercise, the weight used, and repetitions completed. For running sessions, I want to log distance, pace, and calories burned. Reviewing these records will help me visualize increases in the weight I lift and make progress toward my goals.

## 2. Features - build order

1. As a new visitor, I want to sign up, log in, and log out, so my workout data is private to my account.
2. As a user, I want to add a dated strength or running workout, open its details, edit it, and delete it with confirmation, so I can maintain an accurate workout history.
3. As a user, I want required fields checked with a friendly message, so I know how to correct an incomplete workout, goal, or template.
4. As a lifter or runner, I want to set a target weight and reps for a lift or target distance and pace for a run, so I have a specific goal to work toward.
5. As a user, I want to view progress charts over time against my goals, so I can see how my training is changing and how close I am to each target.
6. As a user, I want to create and reuse strength or running workout templates, so I don't have to enter each workout from scratch.
7. As a user, I want to star templates and see a Starred view, so I can quickly find routines I reuse.
8. As a user, I want to search and filter my workouts by date, activity, or exercise and sort them (newest first, or by weight/distance), so I can find a past session quickly.
9. As a user, I want charts showing a selected lift's weight and reps over time and running distance and pace over time, plus stats for workouts this week, heaviest set, and longest run distance, so I can check my training at a glance.

By the due date, I will enter at least five real workouts from my own training; I will not use placeholder entries.

## 3. Database

All IDs are text UUIDs except the Clerk account ID, which is stored as text. Weight and distance values are stored canonically in kilograms and kilometers; the app converts them to each user's chosen display units.

- **users** - id (text, primary key; Clerk user ID), email (text), weight_unit (text), distance_unit (text), created_at (date). One user has many workouts, goals, and templates.
- **workouts** - id (text, primary key), user_id (text, foreign key to users.id), title (text), activity_type (text: strength or run), performed_on (date), notes (text), created_at (date). One workout belongs to one user.
- **lifting_sets** - id (text, primary key), workout_id (text, foreign key to workouts.id), exercise_name (text), set_number (number), weight_kg (number), reps (number). One strength workout has many sets.
- **run_details** - workout_id (text, primary and foreign key to workouts.id), distance_km (number), pace_seconds_per_km (number), calories (number). A run workout has one run-details row.
- **goals** - id (text, primary key), user_id (text, foreign key to users.id), activity_type (text), exercise_name (text), target_weight_kg (number), target_reps (number), target_distance_km (number), target_pace_seconds_per_km (number), is_active (true/false). One user has many goals; lift-only and run-only target fields are left blank as appropriate.
- **templates** - id (text, primary key), user_id (text, foreign key to users.id), name (text), activity_type (text), created_at (date). One user has many templates.
- **template_items** - id (text, primary key), template_id (text, foreign key to templates.id), position (number), exercise_name (text), planned_sets (number), planned_reps (number), planned_weight_kg (number), planned_distance_km (number), planned_pace_seconds_per_km (number). One template has many items; fields apply according to the template's activity type.
- **stars** - user_id (text, foreign key to users.id), template_id (text, foreign key to templates.id), created_at (date); the combined user_id and template_id form the primary key. Users and templates have a many-to-many relationship through this one shared junction table.

A Clerk account is linked to one row in users. Workouts, goals, and templates are scoped to their owner; child records inherit ownership through their parent.

## 4. Tests

- **Data isolation:** Given User A has a workout, when User B logs in and opens their workout list or requests that workout's details, then User B cannot see or access User A's workout.
- **Dashboard:** Given a user has exactly three workouts dated in the current week, when the dashboard loads, then the "Workouts this week" stat displays 3.

In the PR for each test, I will include a plain-English explanation, screenshots of the test failing and then passing, and one sentence explaining a code change that would make it fail.

## 5. Technologies

- **Replit Agent:** I'll use it to build and iterate from this plan.
- **React + TypeScript:** They support a responsive web interface and reusable workout, goal, and dashboard components.
- **PostgreSQL:** Its relational tables and foreign keys fit the users, workouts, sets, goals, templates, and stars data.
- **Clerk:** It will provide signup, login, and logout without custom password handling; each Clerk ID will map to a row in users.
- **Replit Deployments:** I'll host the web app there so it is accessible from a phone or computer.
- **Recharts:** I'll use it to display lift and running progress over time.

## 6. Design

A dark charcoal interface with bright green accents, clear high-contrast workout cards, and compact progress charts. I'll take inspiration from Hevy's lifting logs and Strava's running-progress views.

## 7. Risks and cuts

The feature I'm least sure I can build correctly is data isolation across workouts and all their related records, so one user can never access another user's data. If time runs short, I'll cut optional chart controls such as custom date ranges and animation polish first; I'll keep the required features and basic goal-progress charts.

## Plan vs. Reality

| Planned feature | Shipped / Changed / Cut | Status (Done/Backlogged) | Learning | What changed and why (one line) |
|---|---|---|---|---|
| Sign up, log in, log out, and user data isolation | Shipped: Clerk account controls, a PostgreSQL user row on first signed-in load, and owner-scoped data routes. | Done | Using the verified Clerk ID as the ownership key keeps identity and data access aligned. | Kept Clerk-managed authentication and synced each signed-in account to `users`. |
| Database model: users and related workout tables | Shipped: `users`, `workouts`, `lifting_sets`, `run_details`, `goals`, `templates`, `template_items`, and the shared `stars` table with foreign-key relationships. | Done | Separate child tables fit variable lifting sets and the one-to-one run details. | Store weights and distances canonically in kg/km, then convert using each user's saved units. |
| Create, view, edit, and delete strength and running workouts | Shipped: create/list/detail-panel/edit/delete flows for both activities, with a delete confirmation. | Done | A list plus a detail panel supports reviewing and editing a session in one view. | Strength sets and run details remain attached to their parent workout. |
| Required-field validation with friendly messages | Shipped: required-field and value checks for workout, goal, and template forms, with friendly correction messages. | Done | Server-side validation is needed even when forms also provide immediate feedback. | Validate at both the form and API so incomplete records are not saved. |
| Goal targets for lifts and runs | Shipped: multiple strength and running goals, including lift weight/reps and run distance/pace. | Done | Pace needs exact minute-and-second handling to avoid rounding a goal unexpectedly. | Added goal types and input handling specific to each activity. |
| Progress charts for lifts and running | Shipped: goal comparisons for lift weight and run distance/pace; strength-goal reps are not charted. | Done | Target lines make historical measurements useful for assessing a specific goal. | Kept goal comparisons while adding separate history trends. |
| Create and reuse workout templates | Shipped: strength/run templates can be created directly or saved from a logged workout, then reused. | Done | Supporting both creation methods avoids re-entering a session that already exists. | Templates store ordered planned items and can populate a new workout. |
| Star templates and view starred templates | Shipped: users can star/unstar templates and filter to a Starred view; all links use one shared `stars` junction table. | Done | A composite user/template key prevents duplicate stars while keeping each user's view private. | Use one many-to-many table instead of per-user star records or tables. |
| Search, filter, and sort workouts | Shipped: search by workout/exercise text, filter by date and activity, and sort newest/oldest, longest/shortest distance, and highest/lowest weight. | Done | Sort options need to match the activity and metric being compared. | Added activity-aware sorting so run distances and lift weights rank correctly. |
| Dashboard with charts and summary stats | Shipped: weekly workout count, heaviest set, longest run, selectable lift weight/reps charts, and run distance/pace charts with 30-day, 90-day, and all-time ranges. | Done | Local calendar dates keep weekly totals and date windows intuitive for the user. | Added a training overview alongside the existing goal-comparison charts. |
