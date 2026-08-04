# Feature Backlog

`game-director` reads and updates this file every cycle. Each entry:

`- [status] (category, size) Title — one-line pitch`

Status: `idea` -> `in-progress` -> `shipped`, or `blocked`.
Category: Core Loop / Animals & Husbandry / World & Exploration / NPCs & Story /
Economy & Progression / Events & Seasons / Polish & Game Feel /
UI/UX & Accessibility / Tech & Performance.
Size: S (few hours of an agent's time) / M (half a "cycle" worth) / L (should be
split before building).

Keep at least 3 un-started `idea` entries at all times — if the list gets thin,
the next cycle's Ideate step will top it back up.

---

## Seed ideas (edit/replace freely — these exist so cycle 1 isn't a cold start)

- [idea] (Core Loop, M) Crop cross-breeding — cross two crop types planted
  adjacent for a chance at a hybrid with blended traits. Adds a planning layer
  to plot layout.
- [idea] (Animals & Husbandry, M) Animal happiness meter — petting, feeding
  variety, and cleanliness affect produce quality/yield, not just quantity.
- [idea] (World & Exploration, L) Day/night lighting cycle with a real sky
  (split into: S — sun/moon position + color temperature shift; separate items
  for stars/weather later).
- [idea] (NPCs & Story, M) One rival farmer NPC with a simple relationship
  meter and 3-stage dialogue that reacts to your farm's progress.
- [idea] (Economy & Progression, S) Tool upgrade forge — spend currency + a
  material to upgrade a tool's range/speed, with a visible tool model change.
- [idea] (Events & Seasons, M) Harvest Fair — a seasonal event day where you can
  enter your best crop/animal for a prize and modest reputation bonus.
- [idea] (Polish & Game Feel, S) Harvest juice pass — squash/stretch on
  pickup, a satisfying pop/particle burst, and a short screen-space flash on
  a "perfect quality" harvest.
- [idea] (UI/UX & Accessibility, S) Remappable keybindings + a colorblind-safe
  palette toggle for quality/rarity indicators.
- [idea] (Economy & Progression, S) Farm expansion — purchase an adjacent plot
  of land to unlock more tillable tiles.
- [idea] (Tech & Performance, S) Instance identical crop meshes with
  `InstancedMesh` instead of one mesh per plant.
