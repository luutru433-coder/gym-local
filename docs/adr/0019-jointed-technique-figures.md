# ADR 0019: Jointed technique figures

## Status

Accepted.

## Context

The catalog generates its instructions from one cue sentence per movement plus templates, and every variant shares the same two common mistakes. Nothing states a setup position, a phase or a joint angle. The bundled Workout Guide drawings (ADR 0016) are flat traced outlines in a three-quarter view with no joints, so a joint angle cannot be read or measured on them and no wrong-form drawing exists.

The owner asked for form cues on a moving figure: setup position, per-phase cues with joint angles, and common mistakes shown as a wrong figure beside the right one. He chose a drawn annotated figure over a rotatable 3D model, and, after seeing the chest press, kept the simple jointed figure rather than buying a licensed realistic set (those forbid redistribution, which a public repository does) or rendering an anatomical model.

## Decision

- `@gym/contracts` gains `ExerciseTechnique` and its parts (`TechniqueStep`, `TechniqueCue`, `TechniqueMistake`, `TechniqueFigure`, `TechniquePose`, `TechniqueMark`, `TechniqueLimb`). A figure is a view (side, front, back, top), one or more poses given as joint angles, and simple props (bar, dumbbell, handle, pads, lines, cable).
- Technique content is catalog data, not user data. It is looked up by variant ID (`movementId__equipment`) through `loadExerciseTechnique`, which loads only the group of movements that holds the record. Nothing is stored in IndexedDB or in backups, so there is no database, backup or migration change, and custom exercises simply have no technique section.
- The content and the pose maths live behind a separate entry point, `@gym/catalog/technique`, imported only by the lazily loaded Technique section of the exercise page. Nothing is added to the startup entry chunk, and each group stays under the 80 KiB route budget.
- Angles shown on a figure are measured from the resolved pose (`measureAngle`) and rounded to 5°; they are never stored as numbers beside the drawing. A wrong pose is the same figure with different joint angles.
- The figure is drawn as inline SVG by the app, so it works offline and bundles no third-party media. The Workout Guide drawings stay as the illustrative loop above it.
- Each record carries `sourceId` (`gym-local-original`), `reviewStatus` and `reviewedAt`. The first 30 movements ship as `draft`: the cue text and angle ranges are original coaching guidance written for this app and wait for the owner's review.

## Consequences

- The figure is a schematic mannequin. Shoulder-blade actions are shown with an arrow and a label, not as anatomy.
- A technique record is shared by the equipment listed on it; equipment not listed (for example cable chest press) shows no Technique section until a record is written for it.
- The remaining movements are added as further records in the same shape, with no contract change.
- `packages/catalog/src/catalog.test.ts`, which `pnpm content:validate` runs, checks that every record points at an existing variant, is bilingual, resolves every pose and mark, and has wrong poses that differ from the right ones.
- The technique records (about 90 KiB for 30 movements) are precached so they work offline. With the features merged since, that passes the 3.5 MiB app-shell precache budget by a few KiB, so the budget is raised to 3.75 MiB. The 220 KiB entry budget is unchanged.
