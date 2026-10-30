---
name: PostgreSQL DATE normalization
description: Avoids chart and date-ordering bugs caused by node-postgres parsing DATE columns as JavaScript Date objects.
---

Do not sort or serialize PostgreSQL `DATE` values using `String(date).slice(0, 10)`. The default node-postgres parser returns a JavaScript `Date`, whose string form starts with a weekday (for example, `Fri Oct 23 ...`) rather than an ISO date.

**Why:** Workout progress dates appeared out of order because weekday text was being compared lexicographically instead of calendar dates.

**How to apply:** Cast database `DATE` columns to text in SQL when returning calendar dates, or normalize `Date` objects with a date-only helper before sending them to clients or sorting them.
