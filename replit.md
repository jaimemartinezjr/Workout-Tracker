# Project Feature Workflow

Follow this loop for every feature. In the solo project, the user is both the creator and the approver:

1. **Issue:** Open a GitHub Issue describing the feature. Paste its user story from `PLAN.md`.
2. **Branch:** Create a branch from `main` named for the feature, such as `feature/stars`.
3. **Prompt:** Build the feature on that branch. Save key prompts in `prompts/<feature>.md` on the same branch.
4. **Pull request:** Push the branch and open a PR into `main`. Describe what changed and include `Closes #N` to link the Issue.
5. **Merge:** The user merges the PR. No formal review is needed in solo mode.
6. **Deploy:** Publish the updated app so the live URL stays current.
