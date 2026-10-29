# Run session pace and optional fields

## User request

Logging a run session pace input should use `min:sec`, matching goal setting rather than decimal minutes. Session names should be optional for strength and run sessions, and run calories should be optional.

## Scope clarification

Calories remain a run-only field. Do not add calorie tracking to strength sessions. If a session name is blank, save it with an activity-specific default title. Keep the session date required.

## Acceptance criteria

- Enter run pace as minutes and seconds, such as `8:30`; a whole number such as `9` means `9:00`.
- Display and convert pace correctly when switching between kilometers and miles.
- Permit saving a run without calories; preserve zero as a valid explicitly-entered calorie value.
- Permit saving a strength or run session without a custom name, using an automatic default name.
- Keep existing workouts, authentication, and user data isolation intact.

## Follow-up request

Show the weekday in each session record's date, formatted as `Friday - Oct 23, 2026`. Keep the underlying date unchanged.
