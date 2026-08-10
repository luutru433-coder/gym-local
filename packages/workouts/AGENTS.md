# Workout module rules

- Routine items reference a movement and preferred variant; sessions snapshot the actual variant.
- Previous values, e1RM, and PRs are exact-variant only.
- Switching after a completed set creates a new exercise block.
- Persist after every set mutation and recover active sessions after interruption.
- Warm-up sets do not count toward weekly working-set totals.
