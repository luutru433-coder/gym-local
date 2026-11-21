# Changelog

## Unreleased — Dark theme

- Added a dark theme. The app follows the device's light/dark setting by default; Settings → Appearance switches between System, Light and Dark. The choice is stored on the device only and is not part of backups.

||||||| 0840100

## Unreleased — Weekly nutrition trends

- The Nutrition page now shows weekly trends: average daily calories for the last six Monday–Sunday weeks against your target, and the chosen week's average protein, carbs, and fat with the gap to each target. Averages count only days with logged food, so empty days are not treated as zero. No stored data or formula changed.

## Unreleased — Timed routine targets

- Fixed the routine editor saving a hidden 8–12 rep target for timed and distance-tracked exercises (plank, farmer carry): new exercises and added sets now save the 30-second duration target the editor shows, so the workout screen displays it. Existing routines are not rewritten.

## Unreleased — Rest alert and workout summary

- The rest timer now beeps and, where the device supports it (not iPhone), vibrates when the rest ends; a bell button in the rest bar turns the alert off. The alert needs the app open in the foreground.
- The screen stays awake during a live workout on browsers that support the Screen Wake Lock API.
- A completed set that beats the exact-variation record (estimated 1RM, heaviest load, or least assistance) gets a “New record” badge straight away. Variations without earlier history get no badge.
- Finishing a workout now shows a summary (duration, sets done, volume, new records, exercises) instead of jumping to Progress.

## Unreleased — Custom exercises

- You can now create your own exercises from the exercise library (name, primary and secondary muscles, equipment, how sets are logged, optional note), then edit or delete them. They appear first in the library, the routine editor, and the workout exercise picker, and are logged, charted, and given records like catalog variations.
- Deleting a custom exercise keeps every logged workout and its place in muscle totals; it is blocked while a routine or the workout in progress still uses it. Once an exercise has logged sets, its equipment and load entry can no longer be changed, so old loads are never reused for a different setup.
- The workout CSV export now writes text that a spreadsheet would run as a formula as plain text.
- Schema: database v6 and backup v6 add a `customMovements` collection (ADR 0017). Backups v1–v5 still restore; catalog updates never touch custom exercises.

## Unreleased — Bug fixes and phone/desktop polish

- Finishing onboarding now confirms the calorie and macro estimate shown on its last step, so the nutrition target is usable straight away instead of asking for a review in Settings. Targets that were never confirmed now say so instead of claiming the body details changed.
- The home screen's weekly stat cards no longer overlap on phones.
- Raised the smallest text across the app (navigation labels, stat captions, chart notes) to a readable 10–11px floor on phone and desktop.
- A new rest countdown starts at the planned time instead of one second over (02:01 for a 120s rest).
- The next-workout goal and "working sets" label on the home screen follow the selected language.

## Unreleased — Editable history

- Past workouts can now be corrected from Progress → Recent workouts: change the date, start time, duration, notes, and each logged set (type, load, reps/RIR, time, distance), add a forgotten set, or remove a set or exercise. Charts, records, and load suggestions recalculate from the corrected numbers; an exercise's equipment variant never changes.
- Past workouts and body measurements can be deleted after a confirmation. A workout that is still in progress cannot be edited or deleted from history.
- Body measurements are listed under the trend chart and can be edited in place; the workout history list can load older workouts beyond the latest eight.

## Unreleased — Muscle recovery map

- Added a muscle recovery map to the home screen: the front/back body diagram colours each muscle group as fatigued, recovering, or ready, with the estimated time left and this week's working sets per muscle. It works offline from finished sessions only.
- Recovery estimate: each finished session gives a muscle a window of 36 h + 4 h per completed working set (secondary muscles and full-body movements count half a set), capped at 96 h. Under half the window is fatigued, under the full window recovering. Warm-ups and unfinished sessions are ignored; it is a guide, not programming advice.

## Unreleased — Self-adjusting training plan

- Added an offline self-adjusting training plan on the home screen: the week's remaining sessions reflow around missed days, and the next session shows per-exercise adjustments with a bilingual reason.
- The next session raises the load after the existing double-progression streak, holds it otherwise, lowers it about 10% after two sessions below the minimum target, and eases back about 10% after a 10-day break or 20% with one fewer set after 21 days.
- Adjustments use exact equipment-variant history only and prefill the new session's working-set loads; routines and history are never rewritten, no set is auto-completed, and the prefill can be switched off before starting.

## Unreleased — Faster set logging

- Faster workout logging: unfinished sets now show the weight and reps (or time/distance) from the last session of the same exact variation, and one tap on ✓ logs them. Typed values always win, warm-ups never borrow working-set history, and nothing is written until the set is completed.

## Unreleased — Accent-insensitive exercise search

- Exercise catalog search now ignores Vietnamese diacritics and letter case, so `keo xa` finds “Kéo xà” and `day nguc` finds “Đẩy ngực ngang”.

## Unreleased — Faster meal logging

- The add-food dialog now searches the installed offline food pack while you type (accented or unaccented), replacing the separate “Tìm offline” button.
- Recently logged foods are listed first, ahead of unused favorites, and each has a one-tap button that logs the last amount again.
- Saved-food search now ignores Vietnamese accents.

## 2026-11-21 — Detailed progress charts

- Added a 4-week / 3-month / 1-year / all-time range filter to the progress page.
- The exact-variation trend can now chart e1RM, load, assistance, duration, distance, session volume, best reps, or total reps, marks each new record for the chosen metric, and shows latest value, record, and change in range. History is still never mixed between equipment variants.
- Added weekly charts for external-load volume, working sets, workouts, and duration (local Monday weeks), plus weekly working sets per primary muscle group.
- Body measurements can chart weight, waist, chest, hips, arm, or thigh.

## 2026-11-21 — Nutrition pack 2026.11.1: accurate names, no duplicate foods

- Removed the generic `… (mã USDA <id>)` display names that 10,260 foods carried. Such a name was taken from any dictionary word in the description, so an apple pie was listed as "Táo" and an egg bagel as "Trứng". A food is now named in Vietnamese only when the whole USDA description translates; otherwise the Vietnamese part names the leading USDA term or its food category and the exact USDA description follows in brackets, e.g. `Thịt gà (Chicken, back)`.
- Removed 1,003 duplicate USDA foods: 210 listed under the same description in more than one dataset (Foundation is kept over SR Legacy over FNDDS) and 793 FNDDS/SR Legacy copies with identical values for all 20 nutrients under a longer name. Curated recipe ingredients are always kept. The pack now holds 13,332 foods instead of 14,335.
- Corrected energy for 180 Foundation foods by preferring Atwater specific factors over general factors (walnuts 730 → 679 kcal/100 g, Brussels sprouts 60 → 49), and filled fibre for 17 Foundation foods that only report the AOAC 2011.25 value.
- Fixed dictionary translation: plural forms now match (`Strawberries` → `Dâu tây`), compound terms follow Vietnamese word order (`Strawberry milk` is `Sữa dâu tây`, not `Dâu tây sữa`), and leftover English such as `and`, `NFS`, or `oil` no longer appears inside a Vietnamese name. The dictionary grew from 126 to 364 terms.
- Meat-free and imitation foods are labelled `Món không thịt (…)` or `Thực phẩm thay thế (…)` and never after the food they replace, and roasted nuts, seeds, and beans read `rang`, not `quay`.
- Food search now lists names that begin with the typed words first, then names containing them in order, then other matches, with single foods ahead of composed dishes. This also applies to an already installed pack.
- Installed packs are unchanged until **Cập nhật kho** is used. Diary history keeps its stored nutrient snapshots.

## 2026-11-21 — Offline exercise animations

- Every reviewed exercise variant (199) now has a bundled three-frame drawn animation that plays without a network connection, in the exercise library and in the in-workout quick guide. Variants without a drawing for their exact equipment show the closest drawing and name it.
- Added a front/back muscle diagram that highlights the primary and secondary muscles of each movement.
- Removed the 14 remote reference photos; no exercise image needs the network any more.
- Library cards show the movement drawing instead of a generic dumbbell icon.
- Rich-media policy changed (ADR 0016): licensed drawings are bundled and precached; YouTube guides remain optional and online-only.

## 2026-08-22 — Nutrition planner algorithm 2

- Scale recipe portions deterministically from 0.5 to 2.5 servings so confirmed high-energy targets can be approached with three meals.
- Keep saved nutrient, ingredient, pantry, shopping, and diary snapshots consistent with the selected portion.

## 0.7.0

- Replaced the synthetic 300-recipe catalog with nutrition pack schema 3: 800 source-traceable project-authored Việt–Á dishes, 480 Vietnamese and 320 from other Asian cuisines, each with real ingredient quantities, four Vietnamese preparation steps, meal/diet/allergen metadata, and immutable redirects for all 300 legacy IDs.
- Added 11,373 reviewed Vietnamese food display names and 47,328 Vietnamese search aliases from pinned CC0 USDA datasets; normal schema-3 search excludes the remaining unreviewed translations and supports accented or unaccented Vietnamese queries.
- Added deterministic offline seven-day meal planning with three main meals, optional snacks, confirmed-target gating, hard dietary/allergen filters, no repeated recipe or consecutive main protein, weekly pantry allocation, target-range warnings, and a non-mutating shopping list.
- Added IndexedDB schema 5 and backup v5 for saved meal-plan snapshots, while preserving v1–v4 imports, personal nutrition history, custom recipes, pantry data, and the independently installed nutrition pack.
- Added append-only, idempotent day/week diary logging from saved plans and kept missing micronutrients unknown instead of converting them to zero.
- Added a modular Vietnamese-only nutrition planner UI with independent filters, day cards, week rebalance, shopping list, and saved-plan controls, including automated 320 px and 390 px layout coverage.
- Updated the GitHub Pages release pipeline to stage and verify `gym-local-nutrition-2026.08.1.sqlite3` before deployment.
- Added an in-place “Cập nhật kho” action when a newer manifest is available; a failed update immediately restores the ready UI state for the still-valid active pack.
- Fixed weekly planning so a confirmed estimated target remains valid while its saved body inputs still match.

## 0.6.1

- Fixed offline nutrition-pack installation from hosts that gzip the SQLite response. Transfer `Content-Length` is now treated as compressed size while decoded bytes and SHA-256 remain mandatory before activation.

## 0.6.0

- Added nutrition pack schema 2 with ten bilingual food groups, 1,200 structured recipe-ingredient relationships, meal/dietary/allergen tags, and pinned USDA source food IDs for reproducible offline menus.
- Added local pantry records for exact foods or broad food groups, optional available amounts, additive IndexedDB schema v4 migration, recovery-point preservation, and backup v4 round trips.
- Added deterministic offline menu ranking with exact-food/group matching, quantity coverage, meal/dietary/allergen filters, per-serving nutrition, and explicit missing-ingredient explanations.
- Added a bilingual, mobile-first pantry and menu workspace with offline food search, group chips, optional gram amounts, editable pantry rows, explainable recipe cards, and one-tap immutable diary snapshots.
- Added an in-app iPhone/PWA installation guide with standalone-mode detection and a one-time offline food-pack setup reminder.
- Corrected estimated-recipe micronutrients so a nutrient stays unknown when any contributing ingredient lacks that value, instead of publishing a misleading partial total.
- Kept already installed schema 1 packs compatible while adding manifest, foreign-key, relationship, and source-metadata validation for schema 2.
- Kept backup v1/v2/v3 imports compatible by migrating them to an empty pantry without modifying historical nutrition or workout snapshots.

## 0.5.0

- Added fast recent/favorite/default-serving food flows, editable meal entries, water tracking, custom recipe CRUD and serving-based recipe logging with immutable nutrient snapshots.
- Added explicit nutrition-target provenance and confirmation, exact saved-barcode fallback, micronutrient completeness warnings, and a store-owned boundary for all nutrition pack and provider operations.
- Added measured bundle/PWA budgets, route/vendor splitting, lazy barcode scanning, complete offline-route checks, deterministic media auditing, scheduled online video health checks, and full SQLite pack verification before deployment.

## 0.4.0

- Added multi-day programs, full routine editing, freestyle and editable live workouts, and explicit save recovery while preserving completed history.
- Added explainable exact-variant double progression, plate-loading guidance, progress calendar, exact-variant trends and PRs, and accessible data alternatives.

## 0.3.0

- Added personal-data schema v3 for programs, recipes, water entries, food preferences, and local recovery points without rewriting existing records.
- Added backup v3 metadata and validation, v1/v2 migration, consistent transactional export, pre-restore recovery, active-workout restore protection, and one-click undo; a failed workout write no longer blocks later export or restore operations.
- Hardened offline nutrition-pack compatibility, failure recovery, worker request handling, and network-provider boundaries so an installed usable pack survives failed updates.
- Improved small-screen workout usability, keyboard navigation, localized accessibility labels, selection state, chart summaries, and mobile dialog behavior.
- Added an executable module-boundary audit plus a release roadmap and Codex change/checkpoint templates for safer incremental updates.

## 0.2.1

- Corrected workout tracking semantics for per-hand, bodyweight-added, assisted, timed, distance, and reps-only variants; sessions now snapshot reviewed tracking behavior.
- Corrected assisted pull-up requirements, timed plank targets, exact-variant previous values, completed-set history, RIR/RPE bounds, and misleading aggregate progress metrics.
- Added transactional onboarding persistence and visible workout autosave status with rollback on a failed browser-storage write.
- Added locale-aware nutrition validation, stopped treating missing provider macros as zero, and require completion of missing core nutrients before diary logging.
- Validate backup data before creating a ZIP and reject invalid active-session relationships.
- Added keyboard-safe dialogs, exposed selection/progress accessibility state, synchronized the document language, and re-prompted deferred PWA updates after a workout ends.

## 0.2.0

- Added one direct, click-to-load instructional video for all 199 reviewed equipment variants; removed search-result guidance links.
- Added privacy-enhanced YouTube playback, creator attribution, offline/text fallback, and direct-video content gates.
- Added the optional SQLite/OPFS nutrition pack with 13.835 foods, 24.907 Vietnamese aliases, 300 Vietnamese recipe estimates, FTS5 search, progress, checksum verification, and safe retry after interrupted installs.
- Expanded meal nutrient snapshots to macros plus available vitamins and minerals without silently treating missing values as zero.
- Added explicit persistent-storage permission, nutrition-pack removal, provider/source metadata, and offline food search UI.
- Migrated IndexedDB, contracts, catalog, and backup to v2 with v1 import/migration and round-trip coverage; backups deliberately exclude the reproducible pack.
- Updated the GitHub Pages workflow to verify the release pack before deployment.

## 0.1.0

- Initial local-first PWA foundation.
- Modular catalog, workout, nutrition, progress, media, storage, backup, and UI boundaries.
- Added public-domain reference images for key equipment variants with explicit source/license metadata.
- Added custom routines, live set logging, barcode food lookup, progress charts, and checksummed backup/restore.
- Added installable PWA icons, branded social preview, safe deferred updates, and a GitHub Pages workflow.
- Locked the release to metric input and preserved routine targets in live sessions.
