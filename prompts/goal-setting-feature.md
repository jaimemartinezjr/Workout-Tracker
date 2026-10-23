# Goal setting feature

## User story
As a lifter or runner, I want to set a target weight and reps for a lift or target distance and pace for a run, so I have a specific goal to work toward.

## Key implementation prompt
Build this feature on the `9-goal-setting-feature` branch. Support multiple goals per account. Let a signed-in user create, view, edit, and remove lift goals (exercise, target weight, target reps) and run goals (target distance, target pace). Store measurements in the app's canonical kg/km units and display them using the user's selected units. Keep goal data private to its owner, validate fields on the client and server, preserve the existing Clerk auth code, and follow the existing database schema/migration conventions. Don't add automatic workout-progress calculations unless requested.
