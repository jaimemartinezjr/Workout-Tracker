# Data isolation regression test

## User story
Data isolation: Given User A has a workout, when User B logs in and opens their workout list or requests that workout's details, then User B cannot see or access User A's workout.

## Key test prompt
Create one integration-style router test matching the story: seed a workout owned by User A, simulate requests authenticated as User B, check that the list is empty and a request for the known workout ID returns 404. Keep a passing owner-list test as a control. Demonstrate the regression by temporarily removing the owner filter from the workout-list query, run the data-isolation test and capture its failure, then restore the filter and capture the passing result. Do not commit the temporary regression.
