# ADR 0015: Modular mobile and offline meal-planning UI

## Status

Accepted for checkpoint N5.

## Context

The personal app must be easy to maintain with Codex, usable on 320–390 px screens, and continue working without an account or server.

## Decision

- The nutrition page composes isolated planner controller, filters, day card, swap/rebalance control, shopping list, and saved-plan components. Components receive data and callbacks; only the app store coordinates storage and the pack provider.
- Rich media remains online-only. Food search, targets, pantry, recipes, generated/saved plans, diary history, and backup work locally.
- A swap request rebalances the entire week with a deterministic seed and states that scope in the UI, preserving week-wide constraints.
- The PWA never activates an update during an active workout. GitHub Pages stages the manifest-named release pack only after verification.

## Consequences

Future UI changes can be reviewed and tested per component without introducing direct IndexedDB/API access or coupling planner internals to React.
