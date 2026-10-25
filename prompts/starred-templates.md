# Starred templates

## User story
As a user, I want to star templates and see a Starred view, so I can quickly find routines I reuse.

## Key implementation prompt
Add per-user starring for workout templates and an All/Starred view in the templates panel. Persist stars in a PostgreSQL junction table with a unique user/template pair and cascading cleanup when either parent is deleted. Include each signed-in user's star state in their template list; add idempotent star and unstar actions that verify template ownership. Show a clear empty state when the Starred view has no entries, keep the existing create/edit/use/delete flows intact, and do not change Clerk authentication. Add migration 006 for development startup and check the schema on production startup, relying on Replit Publish to sync managed production schema.
