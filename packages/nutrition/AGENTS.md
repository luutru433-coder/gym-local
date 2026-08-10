# Nutrition module rules

- Nutrition guidance is informational and editable, never a diagnosis or medical prescription.
- Store nutrient snapshots with diary entries; later provider changes cannot rewrite history.
- External food search only runs after explicit submit and must handle offline, missing, and rate-limited responses.
- Formula changes require a new `nutritionFormulaVersion` and golden tests.
