# Final fix wave

1. js/store.js load(): getItem throw returns recovered:true, kept:false (line ~91). Test: "load treats a throwing getItem as unreadable and blocks overwrite".
2. sw.js: skipWaiting removed from install; image rule is /img/ex/ only; icons served by shellFirst (`/icons/` added to the shell rule). Tests: "a new worker never skips waiting", "icons come from the versioned shell cache, not the image cache"; harness stub for skipWaiting removed.
3. js/store.js isValidState: active, session id/startedAt, entry exerciseId, customExercises.secondary checks. Readers already tolerate missing secondary (app.js lookup uses `?? []`). Tests: "isValidState accepts empty, fresh-plan and in-progress states", "importJson rejects a bad active, a session without id and a string secondary". Note: active sets also allow reps null (exercise.js saves null reps while a field is cleared); finished sessions still require numbers.
4. js/session.js applyGoal; js/screens/plan.js goal click uses confirmSheet (Apply to all / Only new exercises); note reworded. Tests: two applyGoal tests in tests/session.test.mjs.
5. js/logic.js parseNum returns null for non-finite. Test in tests/logic.test.mjs.
6. js/app.js render guard also requires no active workout; today.js already renders resume/discard without touching workouts when active.
7. js/screens/plan.js importFile confirmation adds "The workout in progress will be lost." when active.
8. js/screens/plan.js: module-level current/applyField/syncAll/flush, listeners for pagehide, visibilitychange (hidden), hashchange (capture); click handler syncs first; flush uses ctx.save({render:false}); invalid numbers do not overwrite. importFile clears `current` so old fields are never copied into imported data.
9. js/app.js: navigator.storage?.persist?.() once after startup, errors ignored.
10. tools/serve.mjs: listen on 127.0.0.1 (running server not restarted).

## Browser checks (430x932)
(a) PASS: sheet text "Apply 4-6 reps x 3 sets..."; Apply to all set every item to 3 x 4-6 and kept steps 5/1.25/2.5; "Only new exercises" changed goal to endurance only.
(b) PASS: typed name with focus kept, tab-bar link .click(); stored name updated; shown after return.
(c) PASS: active workout, both workouts deleted, Today shows Resume and Discard, no errors.
(d) PASS: import confirm says "...The workout in progress will be lost."
(e) PASS: active:5 file refused with "This file is not a Gym Tracker backup."; storage unchanged.
(f) PASS: no console errors on Today, Plan, workout, exercise, History, Muscles, Progress (only a 404 I caused on purpose to seed storage).

npm test: tests 79, pass 79, fail 0.
