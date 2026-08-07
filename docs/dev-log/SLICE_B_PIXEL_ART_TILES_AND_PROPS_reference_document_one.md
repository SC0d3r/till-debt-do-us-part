**These are classic low-resolution pixel-art terrain tiles** (roughly 16×16 to 24×24 pixel base, rendered with a slight 3D bevel so the top face + front/side faces are visible). They are designed to tile into seamless maps. The overall style is retro 2D game art (think early RPG Maker, Game Boy Advance, or indie pixel tilesets) with:

- Strong but **not solid black** outlines
- Per-tile unique surface noise/patterns
- Meaningful light-to-dark shading that sells volume
- Jagged, organic edges instead of clean geometric cubes
- Distinct top-face vs. side-face color treatment so adjacent tiles of different types still read clearly

### Shared technical style rules (apply to every tile)
- **Palette discipline**: Very limited colors per tile (usually 4–7 including outline). No smooth gradients—only hard pixel steps.
- **Outline treatment**: Never a uniform 1-pixel black line. The outline is a dark version of the tile’s own hue (dark green, dark brown, dark blue, dark tan) and is broken/jagged. It thickens or thins, skips pixels, and follows the surface noise so the silhouette feels hand-drawn and organic.
- **Shading model**: Top face is the lightest. Front/side faces are 1–2 steps darker. A thin highlight row of slightly lighter pixels often sits just inside the top edge. Darker pixels concentrate toward the bottom of the side faces and in “recessed” texture areas.
- **Jaggedness**: Edges are deliberately irregular—pixels stick out or recess by 1–2 pixels so the tiles do not look like perfect cubes. When two identical tiles sit next to each other the shared edge still looks continuous because the outline pattern and surface noise continue across the seam.
- **Surface-to-side transition**: The top face always has more detailed noise/pattern. The side faces are simpler vertical or slightly diagonal color bands with less noise, just enough to show material.
- **Lighting assumption**: Light comes from above-left. Highlights sit on the upper-left of the top face; shadows pool on the lower-right of the top face and the entire lower half of the side faces.

### Tile-by-tile breakdown

**1 & 2 – Grass / verdant ground (left two tiles)**  
Almost identical but with slight variation so they can be mixed for visual interest.  
- **Top face**: Medium-bright lime-to-emerald green base. Scattered darker green pixels form short grass blades and clumps (1–3 pixels tall, irregular). Occasional almost-yellow highlights on the highest “blades.” The surface is uneven—some pixels are raised, creating a soft bumpy silhouette.  
- **Side faces**: One full step darker green, shifting toward olive or muted brown-green at the very bottom. Vertical or slightly stepped color bands. Minimal noise compared with the top.  
- **Outline**: Dark forest-green / near-black green that is broken and follows the grass clumps. The top edge is especially jagged where blades stick up.  
- **Shading**: Strong top-to-bottom darkening on the sides; subtle left-to-right highlight on the top face.  
- **Map behavior**: When placed next to each other the grass blades and outline pattern continue, giving a continuous meadow. Next to dirt the green edge remains sharp and organic.

**3 – Dirt / soil / earth**  
- **Top face**: Mid-brown base with lighter tan and darker chocolate-brown pixels. Soft irregular “clumps” and subtle cracks (1-pixel dark lines that meander). The surface looks packed but still uneven—small raised mounds of 1–2 pixels.  
- **Side faces**: Noticeably darker brown, almost umber at the bottom. Simple vertical shading with very little texture so the top face remains the focus.  
- **Outline**: Dark brown / near-black brown, jagged and slightly thicker in places where dirt clumps protrude.  
- **Shading**: Clear light top → dark sides. A few almost-black pixels in the deepest recesses of the top face give depth.  
- **Map behavior**: Transitions cleanly into grass (green edge sits on top of brown) or sand. The noise is low-frequency so large dirt areas still look natural.

**4 – Water / ice / crystal water**  
- **Top face**: Bright cyan-blue base. White and very light blue pixels form sparkles, small wave crests, or crystalline highlights (scattered 1–2 pixel clusters). Some darker cobalt or navy pixels create depth “pools.” The pattern feels wet and reflective rather than flat.  
- **Side faces**: Medium-to-dark blue, sometimes with a thin lighter blue band near the top edge to suggest a water surface line. Minimal noise—mostly smooth vertical shading so the sparkling top reads clearly.  
- **Outline**: Dark navy / deep blue that is broken and slightly wavy, matching the liquid feel. Never a hard black rectangle.  
- **Shading**: Strongest contrast of the set—bright top highlights against deep side shadows. The white pixels act as specular highlights.  
- **Map behavior**: When multiple water tiles meet, the sparkles and wave pattern should continue or slightly shift so the surface feels alive. Against land tiles the dark-blue outline creates a clean but organic shoreline.

**5 – Sand / sandstone / dry earth**  
- **Top face**: Warm beige / light tan base. Scattered darker tan and soft brown pixels form fine grain and small pebbles. Occasional almost-white highlights on the highest grains. Low-contrast noise that still feels textured.  
- **Side faces**: One to two steps darker warm brown, simple vertical bands with almost no extra noise.  
- **Outline**: Dark warm brown / muted chocolate that is irregular and follows the grain. Softer and less aggressive than the dirt outline.  
- **Shading**: Gentle overall—lighter top, softly darkened sides. Highlights are subtle so the tile stays bright and sandy.  
- **Map behavior**: Blends well with dirt; the color shift is gradual enough for natural beaches or paths. Against grass the contrast is clear but the outlines stay friendly.

### How the tiles interact on a map
- Same-type neighbors: surface patterns and outline “continue” across the seam so the eye reads one continuous material.
- Different-type neighbors: the darker outline of each tile stays intact, creating a crisp but pixel-art-friendly border. No anti-aliasing or soft blending.
- Height/volume: because every tile shows a side face, the whole map gains a subtle 3D relief even in pure top-down view.
- Variation: the two grass tiles already demonstrate the intended approach—keep 2–3 slight variants of each material so large areas never look stamped.

### Recreation checklist for an agent
1. Work at true pixel scale (no smoothing).  
2. Use a hard, limited palette per tile.  
3. Build the top face first with its unique noise pattern.  
4. Add the side faces one step darker with simpler texture.  
5. Draw the outline last, using a dark hue of the tile itself and deliberately breaking it to follow the surface noise.  
6. Ensure left/right and top/bottom edges can tile without obvious seams when the same material is repeated.  
7. Keep the overall silhouette slightly irregular so the tiles feel hand-crafted rather than geometric.

This level of description—color steps, noise character, outline behavior, shading direction, and inter-tile relationships—should let an agent generate matching tiles or entire maps that stay faithful to the exact visual language of the reference.