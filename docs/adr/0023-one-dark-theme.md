# ADR 0023: One dark theme for the whole app

## Status

Accepted. Supersedes the last decision of ADR 0020 (workout-only token override).

## Context

After ADR 0020 the live workout was dark with an orange accent while every other screen stayed cream and lime, with a light/dark/system switch. The owner reported the app as visually inconsistent and asked for one look and for exercise movements that are easy to see. Downloaded ExerciseDB GIFs have white or light grey backgrounds; bundled animation frames are white line art.

## Decision

- The app has a single theme: the style chosen for the workout screen (near-black neutrals, one orange accent). The tokens live once in `:root` in `apps/web/src/styles.css`; the `.workout-page` override and the `:root[data-theme="dark"]` block are removed.
- The Appearance setting (light / dark / system) is removed. `@gym/storage/device` keeps `getThemePreference` / `setThemePreference` and the stored value is left untouched, so nothing is migrated and a light theme can return later.
- Token names are unchanged (`--lime` now holds the orange accent) to keep the diff reviewable and avoid touching every feature stylesheet. Renaming is a follow-up.
- Every exercise picture sits on the same white plate (`--plate`): bundled line art is inverted to dark lines, and ExerciseDB GIFs keep their own white background. No image is recoloured or filtered beyond that, and no media is added.
- On phones the movement picture takes the full width and the muscle map moves underneath it, on the exercise page and in the workout technique dialog.
- Secondary buttons are tinted, not filled, so each screen has one filled orange action.

## Consequences

- No contract, database or backup change.
- Users who had chosen the light theme get the dark one.
- Light grey ExerciseDB GIFs still show a faint edge against the white plate.
