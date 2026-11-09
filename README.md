# Crystal Cluster

A mobile-first idle/tap game. You tend a glowing crystal cluster floating in a dark cavern: tap it to chip off shards, plant growths that produce shards on their own, and eventually shatter the whole thing into Prisms to start again stronger.

Built for iPhone and iPad as an installable web app. No build step and no dependencies: it is plain HTML, CSS and JavaScript modules.

## How to play

- **Tap the cluster** to collect shards. Tapping quickly builds **Resonance**, which makes taps worth up to ×3 and speeds up your growths.
- **Grow**: spend shards on ten kinds of growth, from Glow Moss to the Singing Void. Each one adds crystals to the cluster you see. Owning 25, 50, 100 and so on of a growth doubles its output.
- **Carve**: one-off upgrades that appear as you progress.
- **Glimmers**: a golden wisp drifts across the screen every minute or two. Tap it for a shard rain or a short, powerful boost.
- **Shatter**: once you have earned enough, break the cluster into **Prisms**. Each Prism gives +5% to everything forever, and can be spent on permanent **Facets** such as auto-tapping and longer away earnings.
- The cluster keeps growing while the game is closed (50% speed for up to 4 hours to begin with).

## Run it locally

```sh
npm start          # serves the folder at http://localhost:8080
npm test           # unit tests for the game logic
```

Any static file server works. Opening `index.html` straight from disk will not, because browsers block JavaScript modules on `file://`.

## Put it on a phone

Host the folder on any static host over HTTPS, open it in Safari, then Share > Add to Home Screen. It then runs full screen and works offline.

This repo includes a GitHub Pages workflow. To use it, set Settings > Pages > Source to "GitHub Actions"; every push to `main` then publishes the game.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css` | Page shell and styling, including safe-area and landscape/iPad layouts |
| `js/data.js` | Growths, carvings and facets: names, costs and effects |
| `js/game.js` | All game rules, as pure functions with no DOM access |
| `js/scene.js` | Canvas rendering of the procedural cluster, particles and glimmers |
| `js/ui.js` | Lists, tabs, toasts and dialogs |
| `js/audio.js` | Synthesised chimes (Web Audio, no sound files) |
| `js/main.js` | Wires everything together: input, game loop, saving |
| `sw.js`, `manifest.webmanifest`, `icons/` | Install and offline support |
| `tools/make-icons.mjs` | Regenerates the icons from the in-game art (needs Playwright) |
| `tests/` | `node --test` unit tests |

When you change any shipped file, bump `CACHE` in `sw.js` so installed copies pick up the new version cleanly.
