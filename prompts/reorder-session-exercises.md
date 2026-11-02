# Reorder exercises during session logging

## User request

While waiting for managed AI support, open another issue and add drag reordering
to the session logger. A session opened from a template should allow moving
Squat to the top or middle according to the order performed that day.

## Implementation prompt

Build on a separate branch from main without the unfinished AI coach. Support
mouse and touch dragging plus accessible keyboard/up/down controls. Preserve
exercise identity, sets, reps, weight, and field corrections during moves.
Persist the chosen session order without modifying the original template.
Cover template-based logging, editing, saved ordering, and narrow screens.
Push the feature branch and open a PR for the user to merge; do not publish.
