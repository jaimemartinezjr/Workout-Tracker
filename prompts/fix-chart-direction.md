# Progress chart ordering

## Key prompt

I want to fix the progress charts. The dates are not properly arrayed from oldest to newest. I want to read it from left to right so as I increase weight I want the chart to have a positive slope. Right now my latest workout on Oct 23 is sitting in between Oct 9 and 15, creating a bell shape.

## Acceptance criteria

- Strength and running trend charts display workout dates from oldest to newest, left to right.
- PostgreSQL date values are normalized to calendar dates before the chart code sorts them.
- Goal charts, date-range controls, units, and summary stats continue to work.
- Regression tests cover unsorted lift/run inputs and database `DATE` values parsed as JavaScript `Date` objects.
