# LASTLIGHT

A browser-based first-person battle royale built with Three.js, React, and Vinext. Play a solo match against 15 AI rivals on a coastal island. Includes a shrinking storm, cover, three weapons, ammo and healing pickups, spatial minimap, procedural audio, and touch controls. Opponents run locally; this version does not include online multiplayer.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by the server. Use a browser with WebGL 2. Click **Drop in** to capture the mouse. WASD moves, mouse aims, left click fires, right click zooms, Shift sprints, Space jumps, R reloads, E collects supplies, and 1–3 switches weapons. Escape pauses the simulation. The lobby includes the full control guide and settings.

## Check

```sh
npm run build
npx tsc --noEmit
npm test
npm run lint
```
