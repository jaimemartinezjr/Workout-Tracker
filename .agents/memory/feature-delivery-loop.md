---
name: Feature delivery loop
description: The user's required GitHub workflow for feature work in Workout Tracker.
---

For each feature:
1. Open a GitHub Issue and include the feature's user story from the plan.
2. Create a feature branch from `main`, named for the feature.
3. Build the feature on that branch and save key prompts in `prompts/<feature>.md`.
4. Push the branch and open a PR into `main`, describing the changes and including `Closes #N`.
5. The user merges the PR; no formal review is needed in solo mode.
6. Publish the updated app after the merge.

**Why:** the user asked us to remember this workflow for the team project.

**How to apply:** follow these steps for each feature, keeping related extensions together in the feature PR when appropriate.
