# Till Debt Do Us Part

A compact Harvest Moon-style life-sim that runs fully in the browser with WebGL (Three.js).

## 🎮 [Play Now](https://sc0d3r.github.io/till-debt-do-us-part/)

## How to Play

- **WASD / Arrows**: Move
- **Space**: Action (clear debris, till, plant, water, harvest, dig in mine)
- **E**: Interact (open shop, enter/exit mine, refill watering can at well)
- **Enter**: Sleep (must be on house tile) - advances day, restores stamina
- **B**: Ship items (drop sellable held item into shipping bin)
- **1-8**: Select inventory slot

### Goal
You inherited a run-down farm with 5,000 gold in debt. Pay it off by day 21 or lose the farm.

### Tips
- Clear debris → till soil → plant seeds → water daily → harvest when ripe
- Visit the shop to buy seeds, repair tools, and upgrade equipment
- Enter the mine to dig for ores and gems; find the ladder to go deeper
- Refill your watering can at the well (press E near it)
- Ship crops and minerals via the shipping bin (press B while holding an item)
- Upgrade tools at the shop to reduce stamina costs
- Mr. Grimes visits every 5 days to collect payment
- Tools have durability — repair them at the shop before they break

## Development

```bash
npm install
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
```

## Tech Stack
- TypeScript + Three.js + Vite
- Pure client-side, no backend required
- Procedural textures and meshes (no external model files)
- Saves to localStorage
