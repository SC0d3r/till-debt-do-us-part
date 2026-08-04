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

### M1: Core Farming Loop Complete — status: OPEN
Planting, growing, watering, harvesting, and selling all work end-to-end with
at least basic feedback and no known softlocks.

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

`game-director` appends completed milestones here, each with the date, the
features included, and the git tag.

<!-- example:
### v0.1 — 2026-08-10 — M1: Core Farming Loop Complete
Features: crop-planting-mvp, watering-can, harvest-and-sell, tool-durability, hud-inventory-panel
-->
