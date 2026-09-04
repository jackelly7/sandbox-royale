# LASTLIGHT

A browser-based first-person battle royale built with Three.js, React, and Vinext. Play solo against 15 AI rivals, or create a friend room for 2–8 human players.

## Play with friends

1. Select **Play with friends**, enter a callsign, and create a room.
2. Use **Copy invite link**, or send your friends the six-character room code.
3. Each friend opens the game, enters a callsign, and joins the room.
4. The host selects **Start match**. Everyone selects **Enter match** to capture their mouse. The match begins after a five-second countdown.
5. The last surviving player wins. The host can prepare a rematch in the same room.

The game website must be shared with friends before they can open it. Room codes control which match they join. Opening the in-game menu does not pause an online match. A dropped connection automatically retries; players have 20 seconds to reconnect before elimination. Rooms expire after two hours. Refreshing the page leaves the current session; reconnect is intended for interruptions within the open page.

## Run locally

```sh
npm install
npm run dev
```

Open the URL printed by the server. WebGL 2 is required. WASD moves, mouse aims, left click fires, right click zooms, Shift sprints, Space jumps, R reloads, E collects supplies, and 1–3 switches weapons. Escape opens the menu. Touch controls are available in Settings.

Multiplayer uses the same-origin `/api/multiplayer` endpoint. Set `MULTIPLAYER_DATABASE_URL` in an ignored `.dev.vars` file for local development and in Sites secrets for deployment. Apply `server/schema.sql` to the dedicated multiplayer database. Its identifiers are in `server/deployment.json`.

## Multiplayer architecture

The browser sends batches of commands and receives server snapshots through the game host. The server validates movement, cover, weapon cooldowns, ammo, damage, loot collection, room capacity, match starts, storm timing, and winners. Each player has a random session credential; only its hash is stored, and credentials are excluded from snapshots and URLs.

Postgres stores room state. An authenticated command queue batches inputs from all players. A short database lease gives one request at a time authority to advance a room; revision checks prevent stale workers from overwriting newer state. This keeps separate server processes consistent. Command sequence numbers make retries safe. Clients exchange state up to ten times per second, coalesce movement, and interpolate remote players. There is only one request in flight per player. This architecture targets small friend matches, with basic abuse prevention; it is not a competitive anti-cheat system.

Map collision data comes from the same geometry rendered in the browser. After changing the island, run `npm run map:export` and commit the generated data.

The optional WebSocket transport lives in `server/index.ts` and can run locally with `DATABASE_URL` and `npm run server:dev`. Its Neon Functions deployment is currently unavailable due to a provider build-service error. The published game uses the same-origin HTTP transport and does not depend on that function. `npm run server:build` produces a bundle for a future WebSocket deployment.

## Check

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Run the two-player integration test against the running game:

```sh
npm run test:multiplayer
```

Set `MULTIPLAYER_TEST_URL` to the full API endpoint to test another deployment. The optional WebSocket test runs with `npm run test:websocket`; `SECONDARY_TEST_URL` can point to a second WebSocket server process backed by the same database to test cross-process consistency. The integration test creates a temporary room and leaves it on completion; expired rooms are cleaned up by the server.
