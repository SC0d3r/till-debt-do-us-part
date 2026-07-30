# Till Debt Do Us Part

A compact Harvest Moon-style life-sim that runs fully in the browser with WebGL (Three.js).

## How to Play

- **WASD / Arrows**: Move
- **Space**: Action (clear debris, till, plant, water, harvest, dig in mine)
- **E**: Interact (open shop, enter/exit mine)
- **Enter**: Sleep (must be on house tile) - advances day, restores stamina
- **1-8**: Select inventory slot

### Goal
You inherited a run-down farm with 5,000 gold in debt. Pay it off by day 21 or lose the farm.

### Tips
- Clear debris → till soil → plant seeds → water daily → harvest when ripe
- Visit the shop (blue tile) to buy seeds and sell crops/minerals
- Enter the mine (dark tile) to dig for ores and gems; find the ladder to go deeper
- Upgrade tools at the shop to reduce stamina costs
- Mr. Grimes visits every 5 days to collect payment

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
- Saves to localStorage
