# Incomplete correction message

## User story

As a user, I want required fields checked with a friendly message, so I know how to correct an incomplete workout, goal, or template.

## Scope clarification

Apply this story to the existing workout create and edit forms only. Goal and template forms do not exist in the app, and should not be added as part of this feature.

## Key prompt

Validate required fields together on submit, show a friendly summary and a specific inline correction beside each invalid workout field, mark invalid inputs accessibly, and focus the first field that needs attention. Cover session name, date, strength exercise name/sets/reps/load, and running distance/pace/calories. Allow zero weight and zero calories where valid. Keep server-side validation in place.

## Verification

Run `npm run test:data-isolation` and `npm run build`. Check field-level errors for both strength and run forms in the signed-in preview when available.
