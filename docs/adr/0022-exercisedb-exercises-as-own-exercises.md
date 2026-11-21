# ADR 0022: Downloaded ExerciseDB exercises become the owner's own exercises

## Status

Accepted.

## Context

The owner downloads the free ExerciseDB set onto his device (ADR 0021). About 1,350 of its 1,500 exercises have no counterpart in the app's catalog, and he wants them in the exercise list so routines can use them. His permission from AscendAPI covers download and use in his project, not redistribution, and the repository and Pages site are public, so the bundled catalog cannot contain ExerciseDB names, steps or images.

## Decision

- The download also keeps each exercise's body parts, equipment, target and secondary muscles and steps with its image record in the device-only image database (`details`, an optional unindexed field: no version bump).
- The exercise library has "Add from ExerciseDB": a searchable list, filtered by body part, of downloaded exercises that no exercise in the app shows yet. One exercise, or everything listed, is added on request.
- An added exercise is an ordinary custom exercise (ADR 0015 path, `buildCustomExercise`): its muscles, equipment and load entry are mapped from ExerciseDB's vocabulary to the app's, its steps are stored as instructions, and its image is linked and saved for offline use. Nothing is added automatically.
- No ExerciseDB data is in the repository, the build or the site; everything is fetched by the device and stored in the owner's data.

## Consequences

- Added exercises live in the personal database and therefore in his backups (names and steps as text, no images). After a restore on another device the exercises are there; the images return after downloading the set again.
- Names and steps are English only; the app does not translate them.
- The mapping is a heuristic (e.g. "upper arms" → biceps, "leverage machine" → machine, total weight). The edit form corrects an exercise; editing replaces the downloaded steps with the note typed there.
- A download made before this change has no details; pressing download again adds them.
- Adding hundreds of exercises at once makes the library long; that is the owner's choice per body part or search.
