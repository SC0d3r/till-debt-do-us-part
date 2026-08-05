# Design Notes — Till Debt Do Us Part

Permanent design constraints for the game. If code and these notes disagree,
the notes state design intent — file the discrepancy in the backlog or dev log,
don't silently keep the old behavior.

---

## Camera & presentation

### The game is isometric — the sky is not part of the picture

- The camera is a fixed, angled top-down view (default position (8,12,14)
  looking at (8,0,6)). Players never look up at the sky.
- **Consequence: celestial bodies are never designed to be visible.** Do not
  add sun discs, moon discs, starfields, or sky-level clouds for visual
  flavor — the camera cannot frame them, and any such object placed "in the
  sky" is wasted work that risks clipping the horizon scenery.
- **Time of day is conveyed by LIGHT and AMBIENT only:**
  - sky/fog clear color (visible at the horizon edges of the frame),
  - the sun/moon directional light's direction, color, and intensity
    (the sun DirectionalLight doubles as moonlight at night),
  - ambient light color/intensity, and the fill light.
- The day/night cycle (src/core/DayCycle.ts) is the canonical implementation
  of this: keyframes drive sky/fog/light colors and intensities; the
  sun/moon arc only matters for shadow direction and light color feel, never
  for on-screen visibility of the bodies themselves.
- The moon mesh that exists in the farm scene is decorative and may be kept,
  hidden, or removed freely — it is never a design requirement and never needs
  repositioning to be "visible".

### Other consequences

- Weather (future slice) should be conveyed through light/color/particles that
  the isometric camera can actually show: overcast tint, rain streaks,
  puddles — not sky-dome clouds.
- Anything designed for the sky (aurora, shooting stars, flying NPCs) must be
  planned around the horizon band the camera actually sees, or not at all.
