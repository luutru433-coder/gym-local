# ADR 0020: Per-set timer and dark live workout

## Status

Accepted.

## Context

A set had one timestamp, `completedAt`, written by the single ✓ button, which also started the rest countdown. Nothing recorded when a set began, so neither the time under the bar nor the rest actually taken could be shown or kept. The owner asked for an explicit start and end per set, a rest countdown that starts by itself and an alert when it ends, and picked a dark, one-accent, large-number look for the workout screen.

## Decision

- `SetLog` gains three optional fields: `startedAt` (timestamp), `workSeconds` (start to end) and `restBeforeSeconds` (end of the session's previous finished set to this start). A set with `startedAt` and no `completedAt` is the running set; at most one exists per session.
- No database or backup version bump. Sessions are stored as whole records, the fields are optional, and backup validation accepts them (set logs were already `passthrough`, so earlier builds keep them through a restore). The backup schema now also checks their types. Sets without the fields behave as before.
- `workSeconds` is separate from `durationSeconds`, which stays the logged effort of a timed exercise. Ending a timed set with no seconds typed copies the stopwatch into `durationSeconds`.
- Timer logic lives in `@gym/workouts/set-timer`, loaded with the workout page; `updateSet` is unchanged. Ending a set is `updateSet(..., true)` followed by `stampWorkSeconds` and the existing superset advance, so the rest rules (including no rest inside a superset round) are the same. Starting a set clears `restTimerEndsAt`. Undoing a completed set clears its timing.
- Ending a set never blocks on typing: missing reps come from the suggestion, else from the set's target; they can be corrected during the rest.
- The ✓ button in the set list keeps working and logs a set with no timing.
- The live workout screen overrides the theme tokens on `.workout-page` (dark neutrals, orange accent) regardless of the app theme. Dialogs opened from it are portalled and keep the app theme.

## Consequences

- The default rest alert is foreground-only on iPhone. There is no vibration on iOS, and screen wake lock needs iOS 18.4+. The screen flashes, counts time past rest, and catches up on return to the foreground.
- An experimental, device-only Settings switch enables Media Session while the workout screen is open. A tap in that screen starts a quiet bundled audio loop; Now Playing shows set targets or rest progress. Next (or seek forward) ends a valid running set or starts the next set, and Previous (or seek back) skips rest. Play/Pause controls the media only; the workout and rest still measure wall-clock time. Now Playing stops when the workout ends or you leave its screen.
- When the web app detects rest expiry, it tries to play the bell through the same audio element, then returns to the loop. The mute preference applies to the bell. This is not a push notification, and if iOS suspends JavaScript or playback, the countdown display, controls, or bell may not work until the app returns. The loop can also interrupt other audio. The two audio clips are generated sine tones, bundled for offline use.
- History and records ignore the new fields; only the finish summary reads them.
- Nothing is added to the startup entry chunk.
