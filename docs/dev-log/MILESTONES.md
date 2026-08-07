# ⚠ PROJECT PIVOT — READ THIS FIRST, EVERY CYCLE, FOREVER
This project is no longer a Harvest-Moon-style farming game. See
`docs/dev-log/PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md` for the full,
authoritative statement of what this project now is. This banner
supersedes any conflicting description anywhere else in this repo,
including game-director.md's own agent description. Never remove this
banner or let new content get inserted above it.
---

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

### M1: Core Farming Loop Complete — status: VOID — superseded by project pivot, see PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md
Planting, growing, watering, harvesting, and selling all work end-to-end with
at least basic feedback and no known softlocks. (Historical record: this was
DONE at v0.1, 2026-08-04, before the pivot removed the farming game.)

### M2: Animals & Economy — status: VOID — superseded by project pivot, see PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md
At least one animal type with a care loop, plus a shop/upgrade system with a
real currency sink.

### M3: World & Atmosphere — status: VOID — superseded by project pivot, see PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md
Day/night cycle, at least basic weather, and a farm expansion mechanic.

### M4: Social & Story — status: VOID — superseded by project pivot, see PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md
At least one NPC with a relationship arc and one seasonal event.

### M5: Polish Pass — status: VOID — superseded by project pivot, see PROJECT_PIVOT_AND_IDENTITY_OVERRIDE.md
A dedicated milestone that ships zero new systems — only Polish & Game Feel,
UI/UX, and Tech & Performance backlog items, until the game feels as good as
its feature list suggests it should.

---

## Next milestone

TBD — will be defined by a future brief once gameplay direction exists on top
of the tile-based world foundation.

---

## History

### v0.1 — 2026-08-04 — M1: Core Farming Loop Complete (historical, farming game removed by pivot)
Features: day/night-cycle-slice-1, debug-test-harness-part-a, slot-machine,
mine-loop-fixes, harvest-to-hotbar, mine-exit-and-tutorials (dev history
e980f12..0695a04). Tag: v0.1. QA regression PASS; catalog capture 9/9 at
58.9s. The farming game this milestone described no longer exists in the
codebase as of the project pivot.