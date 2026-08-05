# Milestones

A milestone = a themed slice of shipped features that, together, form a
cohesive step forward in the game. When `game-director` determines the current
milestone's criteria are met, it runs a full QA regression pass and, if that's
clean, merges `dev` into `master` and tags a release.

Edit the milestone definitions below to fit how you actually want the game to
grow — these are a reasonable starting default, not a fixed plan.

---

## Default cadence rule

If you don't want to hand-author every milestone, the simplest rule is:

> Every 5 features shipped to `dev` (from at least 2 different categories) =
> 1 milestone. Merge to `master`, tag `v0.X`.

`game-director` should follow this rule automatically unless a themed milestone
below is still open and closer to complete — themed milestones take priority
over the raw count when both could apply.

---

## Themed milestones (optional — fill in / reorder as you like)

### M1: Core Farming Loop Complete — status: DONE (v0.1, 2026-08-04)
Planting, growing, watering, harvesting, and selling all work end-to-end with
at least basic feedback and no known softlocks.
- QA regression PASS (e2e-full-loop.mjs 57/57, qa-harness 120/124 with only
  documented harness-gap probes, probe-daynight 57/57, prod gate PASS).
- Full screenshot catalog capture: 9/9 fixtures OK, 58.9s wall-clock (GPU
  path), 0 timeouts. Slot-machine PNG +22.6% size variance noted (RNG reel
  grid — covered by the slot-fixture-determinism backlog item; re-check next
  full capture).

### M2: Animals & Economy — status: NOT STARTED
At least one animal type with a care loop, plus a shop/upgrade system with a
real currency sink.

### M3: World & Atmosphere — status: NOT STARTED
Day/night cycle, at least basic weather, and a farm expansion mechanic.

### M4: Social & Story — status: NOT STARTED
At least one NPC with a relationship arc and one seasonal event.

### M5: Polish Pass — status: NOT STARTED
A dedicated milestone that ships zero new systems — only Polish & Game Feel,
UI/UX, and Tech & Performance backlog items, until the game feels as good as
its feature list suggests it should.

---

## History

### v0.1 — 2026-08-04 — M1: Core Farming Loop Complete
Features: day/night-cycle-slice-1, debug-test-harness-part-a, slot-machine,
mine-loop-fixes, harvest-to-hotbar, mine-exit-and-tutorials (dev history
e980f12..0695a04). Tag: v0.1. QA regression PASS; catalog capture 9/9 at
58.9s.
