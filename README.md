# NIAD Test

A phone tracker for the NIAD Test: a 6-hour gym session scored on Hans Florine's
"Gym workout score card" (version January 2008), plus five added exercises.
Tap what you climb or do; the app does the math, bonuses included.

Live: https://robdhyman.github.io/niad-test/

## Scoring

- Routes 5.6 to 5.14 and boulders V0 to V10 use Hans's first-go and repeat values,
  with at most five repeats per route or problem.
- Exercises use Hans's rates. Added: Stairmaster, rowing machine and SkiErg
  (1 point per 3 calories, pooled), burpees and banded pull-ups (1 per 2),
  3-5-7s (15 points per 15-minute block).
- Bonuses for different routes, different problems and variety, as on the sheet.
- One wall clock: entries after the window are kept but do not score.
- Stop a session to save it to History or discard it. Discard deletes it from the
  phone and its file from GitHub.
- Hardcore: no stop and no discard. It ends on its own at the planned time. With an
  optional target score, a session short of the target at the planned time goes
  into overtime: the clock reads T+, taps keep scoring, and it ends at the tap that
  reaches the target or 24 h after the start. The tier ladder counts real elapsed
  time for an overtime session. The only early end is an injury abort, which saves
  the session with the week-after flare set to Yes.
- Tier ladder 500, 750, 1,000, 1,500, 2,000: a tier passes on two sessions at or
  above it with no injury flare or red flag in the week after each.

Sources: [score card](http://web.archive.org/web/20190529151326/http://fitnessrank.com/workoutsheets/blankscoresheet.pdf),
[Florine's explanation](http://web.archive.org/web/20080704112309/http://fitnessrank.com/workoutsheets/Workoutsheet_explained.pdf).

## Data

Every tap is saved on the phone first. With a GitHub token set in Settings, each
session is also saved as `sessions/<id>.json` in a private repo (default
`robdhyman/niad-log`). The token needs only Contents read and write on that one
repo and is stored only in the phone's browser. No analytics, no server.

## Develop

No build step. `npm test` runs the scoring and sync tests (Node 20+).
Serve the folder with any static server, e.g. `python3 -m http.server`.
