# Crystal Cluster

A mobile-first idle/tap game. You tend a glowing crystal cluster floating in a dark cavern: tap it to chip off shards, plant growths that produce shards on their own, and eventually shatter the whole thing into Prisms to start again stronger.

Built for iPhone and iPad. It runs as an installable web app with no build step and no runtime dependencies (plain HTML, CSS and JavaScript modules), and the same files are wrapped with Capacitor as a native iOS app for the App Store.

## How to play

- **Tap the cluster** to collect shards. Tapping quickly builds **Resonance**, which makes taps worth up to ×3 and speeds up your growths.
- **Grow**: spend shards on fourteen kinds of growth, from Glow Moss to First Light. Each one adds crystals to the cluster you see. Owning 25, 50, 100 and so on of a growth doubles its output.
- **Carve**: one-off upgrades that appear as you progress.
- **Glimmers**: a golden wisp drifts across the screen every minute or two. Tap it for a shard rain or a short, powerful boost.
- **Shatter**: once you have earned enough, break the cluster into **Prisms**. Each Prism gives +5% to everything forever, and can be spent on permanent **Facets** such as auto-tapping and longer away earnings.
- **Descend**: with 1,000 Prisms earned, leave for a deeper cavern and carry out **Heartstones** (+200% each) to spend on **Veins**.
- **Trove**: a **Daily Geode** with a modifier for the day and a goal to crack it, a **collection book** of 20 rare crystals that turn up now and then, and 24 **achievements**. Finds and achievements give small permanent bonuses.
- **Look and sound**: crystal skins, backdrops, tap effects and ambient soundscapes. Some are earned by playing; the rest come in cosmetic packs in the iOS app. Nothing for sale changes how fast the game goes, and there are no ads.
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

## The iOS app

The `ios/` folder is a Capacitor 8 Xcode project (Swift Package Manager, no CocoaPods). It adds what a web page cannot do: haptics, Game Center achievements and leaderboards, In-App Purchase for the tip jar and cosmetic packs, iCloud save sync, a "your cluster is full" notification and an alternate app icon. On the web each of those quietly does nothing.

On a Mac with Xcode:

```sh
npm install        # Capacitor and its plugins
npm run ios:sync   # copies the game into www/ and updates the Xcode project
npm run ios:open   # opens ios/App in Xcode
```

Run `npm run ios:sync` again after any change to the game. Signing, App Store Connect setup and submission are covered step by step in the App Store checklist; the ids to type in are in `store/app-store-connect.md`.

To try the shop screens in a browser, open `http://localhost:8080/?devstore`. Purchases there are pretend.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css` | Page shell and styling, including safe-area and landscape/iPad layouts |
| `js/data.js` | Growths, carvings, facets, veins, rare crystals, daily geodes, achievements and leaderboards |
| `js/game.js` | All game rules, as pure functions with no DOM access |
| `js/scene.js` | Canvas rendering of the procedural cluster, particles and glimmers |
| `js/ui.js` | Lists, tabs, toasts and dialogs |
| `js/audio.js` | Synthesised chimes (Web Audio, no sound files) |
| `js/main.js` | Wires everything together: input, game loop, saving, iCloud |
| `js/cosmetics.js` | Skins, backdrops, tap effects, soundscapes, and the products for sale |
| `js/native.js` | Bridge to the iOS app (haptics, Game Center, purchases, iCloud, notifications); a no-op on the web |
| `js/store.js` | Tip jar and cosmetic packs: what is owned, buying and restoring |
| `native/crystal-native/` | The app's own Swift plugin: Game Center, StoreKit 2, iCloud key-value saves, app icon |
| `ios/` | The Xcode project |
| `store/` | App Store Connect ids, Game Center achievement images and App Store screenshots |
| `tools/make-store-assets.mjs` | Regenerates the iOS icons, launch screen, achievement images and screenshots (needs Playwright) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Install and offline support |
| `tools/make-icons.mjs` | Regenerates the icons from the in-game art (needs Playwright) |
| `tests/` | `node --test` unit tests |

When you change any shipped file, bump `CACHE` in `sw.js` so installed copies pick up the new version cleanly.
