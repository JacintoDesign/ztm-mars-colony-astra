---
name: playtest
description: Run playtest scenarios from PLAYTEST_PLAN.md against the running colony in the browser and report expected vs observed results.
---

# Playtest

Run every scenario in [PLAYTEST_PLAN.md](../../PLAYTEST_PLAN.md) against the running colony.

Use browser automation for all of this, and record video of the session.

Sign in as the test account before setting up anything.

For each scenario:
- Set up the starting state described in the scenario.
- Advance the colony by the number of ticks specified, using the catch-up path rather than waiting in real time.
- Take a reading of oxygen, power, and colonist health at every tick.
- Check each "Then" claim against what happened.
- Wait for the app to finish loading before recording any reading — a loading state is not a result.
- Check the account shown on the page is the one you signed in as before recording any reading.

Report a table of expected versus observed for every tick where a claim failed. Do not fix anything.
