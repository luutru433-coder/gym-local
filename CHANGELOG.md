# Changelog

## Unreleased — Type a workout set's weight

- Tap the weight in the workout focus panel to type an exact number, including decimals. The plus and minus buttons still work.

## Unreleased — Experimental iPhone lock-screen workout timer

- Opt in from Settings and tap the workout screen to try starting and ending sets, skipping rest, and hearing the rest bell from iPhone's Now Playing controls. This is best-effort: iOS can suspend the web app or its background audio.

## Unreleased — The next set starts from the set you just finished

- On the workout screen the weight and reps offered for the next set now start from the set you just finished in this workout, so you only adjust up or down. Before, they could come from last time's workout, and a drop or failure set, or the first working set after a warm-up with no history, started from 0.
- Order used: the set finished just above in this workout, then the same set last time, then last time's final set, then this workout's warm-up (weight and reps only). A value the finished set does not have, such as a weight you left empty, still comes from last time. Exact equipment variants still never share values, and anything you type is kept.

## Unreleased — Technique figures

- Exercise pages have a new Technique section for 30 main movements (chest press, incline press, push-up, dip, chest fly, squat, leg press, split squat, lunge, deadlift, Romanian deadlift, hip thrust, leg curl, leg extension, calf raise, overhead press, lateral raise, rear delt fly, face pull, pull-up, lat pulldown, barbell/dumbbell row, one-arm row, biceps curl, hammer curl, triceps pushdown, overhead triceps extension, close-grip press, plank, crunch). Equipment variants without a record show no Technique section yet.
- Each one shows a jointed figure that moves between positions, with numbered cues for setup (hands, feet, shoulder blades, back) and for each phase, joint angles measured from the figure, and common mistakes drawn as a wrong figure beside the right one with the fix. Vietnamese and English, offline.
- The figure is a simple schematic; the existing drawings stay as the illustrative loop. Cue text and angle ranges are original guidance marked as draft until reviewed (ADR 0019).
- No database or backup change; the section loads only when an exercise is opened.
- The offline download budget for the app goes from 3.5 MiB to 3.75 MiB to fit the technique data; the 220 KiB startup budget is unchanged.

## Unreleased — Weekly set changes, block weeks and deload in the next-session plan

- The home screen's next-session plan now follows a 5-week block: each week you train in a row the target effort gets one rep closer to failure (about 4, 3, 2, then 1 reps left), and the fifth week is a deload with half the sets (ADR 0027). A week off restarts the block.
- Set counts follow your feedback: a muscle you rated "not sore" or "gone early" and trained on target gets one more set next time; "still sore" takes one away; missed rep targets halve its sets for one session. Without a soreness answer the set count stays as it is.
- For weight × reps exercises with history, the plan no longer prefills last time's weight on these sessions; the per-set suggestion picks weight and reps for the week's target effort. Other exercises are prefilled as before.
- Two weeks of missed targets for the same muscle on the same equipment, or two muscles in one week, bring the deload forward.
- Fixed: reopening a workout during a rest briefly showed too much rest time left (for example 1:53 of a 1:30 rest) until the next second; the rest itself was never extended.
- These changes apply to the new session only, through the existing "apply adjustments on start" switch. Routines, history, the database and backups are unchanged.

## Unreleased — Soreness feedback and one recovery estimate

- The muscle recovery map on the home screen now asks how sore each main muscle of your last workout got: not sore, gone early, gone just in time, or still sore. Answering is optional and you can change or clear an answer (ADR 0026).
- "Still sore" gives that muscle 10% longer to recover from then on; "not sore" 5% less. The other two answers change nothing.
- The map now shows the same recovery estimate the workout screen uses for set suggestions: harder sets tire a muscle more, secondary muscles count half, and fatigue fades by the hour. It replaces the fixed 36 h + 4 h per set rule, so the map can look different for the same history.
- A carry or other full-body exercise now tires every muscle a little on the map, as before, instead of none.
- During a workout, if you type a weight that is too heavy for today's estimate, the suggestion line now says so and names a weight that fits the rep range, instead of showing last time's reps.
- The pre-workout check-in now sits above the set panel, so the Start button no longer covers it.
- Sessions gain an optional `soreness` field, kept in backups. Older backups and sessions without it work as before; no database migration.

## Unreleased — Pre-workout check-in and warm-up feel

- A workout now opens with three optional questions: last night's sleep, energy right now and muscle soreness, each 1-5 with 3 as a normal day. The answers move the suggested weights of that workout by at most 3% either way (ADR 0025). Skip it and nothing changes; you can answer, edit or clear it until the workout ends.
- After a warm-up set of an exercise you can say whether it felt heavier, as usual or lighter. Lighter raises that exercise's suggested weights by 1.3%, heavier lowers them by 2.6%.
- The reason under a suggestion now says which of these moved it. What you type still wins, and nothing is logged for you.
- Sessions gain two optional fields (`checkIn`, and `warmupFeel` on an exercise), kept in backups. Older backups and sessions without them work as before; no database migration.

## Unreleased — Set suggestions from today's estimated strength

- During a workout, the suggested weight and reps for a set now come from your estimated strength today instead of repeating last time's numbers: your recent sessions of the exact variant, how recovered the main muscles are, and the sets you have already done in this workout (ADR 0024). After each set the next one is planned again; correcting a set's RIR during the rest updates it.
- The focus panel shows the suggestion with about how many reps it should leave and why; during the rest it shows the plan for the next set.
- It applies to exercises logged as weight × reps with a rep target, once the exact variant has history. Other exercises, and a first-ever exercise, keep the previous suggestion. What you type always wins, and nothing is logged for you.
- A set with no RIR logged is read as 2 reps in reserve. Logging RIR makes the estimate follow you more closely.
- No change to history, records, routines, the database or backups.

## Unreleased — One look for the whole app, larger exercise movements

- Every screen now uses the look of the workout screen: dark background, one orange accent. The cream and lime colours are gone, and so is the Appearance (light / dark / system) setting (ADR 0023).
- Exercise pictures are easier to see: on a phone the movement fills the width of the exercise page and of the technique dialog during a workout, with the muscle map underneath.
- All exercise pictures (built-in drawings and ExerciseDB GIFs) sit on the same white plate, so they stand out from the dark screen instead of sinking into it.
- Only one filled orange button per screen; other buttons are tinted.

## Unreleased — Autoregulation engine (not yet in the app)

- New `@gym/workouts/autoregulation` module with the formulas for estimating strength on the day, fatigue within a session, muscle recovery, and weekly set changes (ADR 0024). Nothing in the app uses it yet, so workouts, suggestions, the database and backups are unchanged.
- `pnpm autoregulation:sample` runs the engine against a simulated lifter and writes `docs/autoregulation-sample-run.md`.

## Unreleased — Add exercises from the downloaded ExerciseDB set

- The exercise library has a new "Add from ExerciseDB" button. It lists the exercises of the downloaded set that the app does not have yet (search by name, filter by body part); add one, or everything listed. An added exercise joins your own exercises with its image, muscles, equipment and steps, and can be picked in routines.
- Names and steps are in English. If you downloaded the set before this update, press "Download free ExerciseDB images" once more to get the exercise details.
- Added exercises are saved like exercises you create yourself, so they are in your backups; their images are not, and come back after downloading the set again. Nothing from ExerciseDB is bundled with the app (ADR 0022).

## Unreleased — Free ExerciseDB images, saved on the device

- Settings → Exercise images has a new "Download free ExerciseDB images" button. The device downloads the free ExerciseDB list once, straight from their server, links a 180p GIF to each exercise in the app that has no image yet, and saves those GIFs on the device so they show offline. Used with AscendAPI's permission; the credit to AscendAPI.com is shown in Settings and under each GIF.
- Nothing from ExerciseDB is in the app, its repository or its website, and nothing is in backups: after a restore on another device, download again there.
- Only GIFs for exercises in the app are saved. "Change image" on an exercise page searches all 1,500 names; a GIF picked while online is saved too. Images you imported or chose yourself are never replaced.
- "Remove pack" also deletes the downloaded list and GIFs.
- No change to the personal database or the backup format (ADR 0021).

## Unreleased — Workout screen redesign and per-set timer

- The live workout screen is redesigned: always dark with one orange accent, and the current set sits at the top with its weight and reps as large numbers and one-tap −/+ buttons.
- Each set now has a Start and an End button. Start runs a set stopwatch; End logs the set (suggested or target reps are filled in and can be corrected during the rest) and the rest countdown starts by itself. Starting the next set stops the countdown.
- When rest ends the screen flashes, the three beeps play, and the timer keeps counting how far past the rest you are. The rest controls (±15s, restart, bell, skip) moved from the bottom bar into the rest panel. On iPhone the alert works only while the app is open on screen and the phone is not on silent; there is no vibration on iPhone, and the panel says so when the device cannot keep the screen awake.
- A timed set's seconds are taken from the stopwatch when none were typed. The ✓ button in the set list still logs a set without timing it.
- Sets now keep the optional start time, set duration and real rest before the set (ADR 0020); the finish summary shows the average set time and average real rest. No database or backup version change; older backups and sessions are unaffected.

## Unreleased — Your own exercise image pack

- Settings has a new "Exercise images" card: pick image files (GIF, WebP, PNG, JPG) you hold a licence for, with the pack's JSON file if it has one, or a ZIP of them. The images are stored on this device only; they are uploaded nowhere, are not in the app or its repository, and are not part of backups.
- After an import the app suggests an image for each exercise it can match by name and equipment. The exercise page shows that image above the drawing, with "Change image" (search the pack by name) and "Remove image" for each equipment variant. Your own choices are kept when the pack is imported again.
- "Remove pack" deletes every imported image from the device. Without a pack nothing changes.
- Stored in a separate on-device database (ADR 0020); no change to the personal database or the backup format.

## Unreleased — Weight trend and calorie target check

- The body weight chart now draws a smoothed trend line over the scale readings (each day moves the trend 10% toward the reading, several readings on one day are averaged), so day-to-day water swings stop hiding the direction.
- Progress has a new calorie target check: from the last 21 days of logged meals and the weight trend it estimates daily energy use (7,700 kcal per kg of trend change) and suggests a calorie target for the current goal. It needs at least 3 weigh-ins 14 days apart and 10 logged days, moves the target by at most 300 kcal at a time, never suggests under 1,200 kcal, and keeps protein and water unchanged (fat, then protein, is reduced only when the kept protein no longer fits the new calories).
- The suggestion is never applied on its own: "Use new target" saves it as a manual target, "Ignore" hides it for 7 days on this device. Changing body details in Settings afterwards asks for the estimate to be reviewed again.
- No database or backup schema change.

## Unreleased — Dark theme

- Added a dark theme. The app follows the device's light/dark setting by default; Settings → Appearance switches between System, Light and Dark. The choice is stored on the device only and is not part of backups.

## Unreleased — Supersets in live workouts

- Exercises that share a superset label in a routine now run as a superset during the workout: finishing a set moves straight to the next exercise in the group with no rest, and the rest timer starts only after the last exercise of the round. Each grouped exercise shows a "Superset" badge and what comes next.
- During a workout, "Superset next" in the exercise edit tools groups an exercise with the one after it, and "Ungroup" takes it out. This changes the current workout only, not the routine.
- Sessions now keep the optional superset label (ADR 0018). No database or backup version change; older backups and sessions are unaffected.

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
