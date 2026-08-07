# Till Debt Do Us Part

A browser game built on a procedural isometric tile world — currently in
active development on its tile-system foundation (the original farming-genre
concept was replaced per the project pivot; the final genre is TBD).

## 🎮 [Play Now](https://sc0d3r.github.io/till-debt-do-us-part/)

What exists today:
- **Procedural tile system** — data-driven `TileMapComposer` rendering
  instanced isometric tile maps (six plain-only biome families: grass, dirt,
  water, sand, lava, snow) with hover highlighting and outlines.
- **Pixel-art prop library** — 15 low-poly, camera-facing props (flower, rock,
  bush, cactus, torch, lantern, …) built from shared geometry builders with
  baked 3-tone pixel shading and contact rings.
- **Debug/QA harness** — `window.__debug` (dev-only, `?debug=1`) with fixture
  jumping, asset previews, and fast-mode for automated testing.

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

---

## 🇮🇷 بخش فارسی

# تا بدهکاری ما را جدا کند

یک بازی مرورگری که بر پایه دنیای کاشی‌ای ایزومتریک رویه‌پرداز ساخته می‌شود —
در حال حاضر روی سیستم کاشی‌پایه در حال توسعه است (مفهوم اولیه مزرعه‌داری طبق
بازنگری پروژه کنار گذاشته شد؛ ژانر نهایی هنوز مشخص نیست).

## توسعه

```bash
npm install
npm run dev      # راه‌اندازی سرور توسعه
npm run build    # ساخت نسخه تولید
npm run preview  # پیش‌نمایش نسخه تولید
```

## تکنولوژی‌ها
- TypeScript + Three.js + Vite
- کاملاً سمت کلاینت، بدون نیاز به سرور
- بافت‌ها و مش‌های رویه‌ای (بدون فایل مدل خارجی)
