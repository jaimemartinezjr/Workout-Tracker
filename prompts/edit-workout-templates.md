# Edit saved workout templates

## User story
As a user, I want to edit an existing workout template without deleting and rebuilding it, so I can keep routines current as my training changes.

## Key implementation prompt
Allow a user to open an existing strength or running template in the existing template builder, edit its name and ordered items, and save the changes in place. Keep all reads and writes scoped to the authenticated user. Validate the submitted data on the server and update the template and its items transactionally so a failed edit leaves the saved template intact. Preserve the existing unit conversions and ensure editing a template does not change logged workouts or workouts already created from that template. Keep the existing Clerk authentication unchanged.
