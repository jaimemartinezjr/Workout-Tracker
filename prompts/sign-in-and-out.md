# Sign in and out feature

Issue: [#3 — Sign in and out feature](https://github.com/jaimemartinezjr/Workout-Tracker/issues/3)

## User story

As a new visitor, I want to sign up, log in, and log out, so my workout data is private to my account.

## Key implementation prompt

Build the sign-up, sign-in, and sign-out feature for this strength and performance tracker on the current feature branch. Follow `PLAN.md`: use React and TypeScript, Clerk for authentication, PostgreSQL for user records, and a dark charcoal interface with bright green accents. Use Clerk's in-app sign-in/sign-up components and account menu. Create a `users` table whose primary key is the verified Clerk user ID; on an authenticated request, upsert only the current Clerk user's email and return that user's profile. Protect the profile endpoint with Clerk middleware and never accept a user ID from the browser to select a row. Add a concise setup guide and `.env.example` containing placeholders only. Do not commit credentials, implement later workout features, open a pull request, or merge anything.

## Follow-up prompt

Save the key prompt in `prompts/sign-in-and-out.md` on this branch. Run the available type checks and production build; report any steps that require the user's Clerk or PostgreSQL configuration rather than pretending to test a live sign-in.

## Verification notes

The sign-in flow requires a Clerk application, and profile persistence requires a PostgreSQL database. Their keys and connection string must be configured locally or in Replit Secrets; they do not belong in this repository.
