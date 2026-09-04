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

Open the URL printed by the server. WebGL 2 is required. WASD moves, mouse aims, left click fires, right click zooms, Shift sprints, Space jumps, R reloads, E collects supplies, and 1–3 or the scroll wheel switches collected weapons. Escape opens the menu. Touch controls are available in Settings.

Room creation and joins use the same-origin `/api/multiplayer` endpoint. Live gameplay connects directly to the Neon WebSocket endpoint in `lib/game/network-config.ts`. Set `MULTIPLAYER_DATABASE_URL` in an ignored `.dev.vars` file for local development and in Sites secrets for deployment. Apply `server/schema.sql` to the dedicated multiplayer database. Its identifiers are in `server/deployment.json`.

## Multiplayer architecture

The browser sends movement and actions over a persistent authenticated WebSocket. Each server process batches all inputs for a room every 50 ms, advances the authoritative match under a Postgres row lock, and broadcasts snapshots with per-player sequence acknowledgments. The database and WebSocket server run in the same region. Separate processes share the same room state, retries cannot fire a shot twice, and clients predict local movement and interpolate opponents.

The server validates inventory ownership, movement, cover, weapon cooldowns, ammo, damage, exclusive loot collection, capacity, starts, storm timing, and winners. Every player starts with no guns or ammo. Collecting the first AR, shotgun, or sniper loads its magazine and equips it; duplicate pickups add reserve ammo. Gamertags appear above opponents and weapon selection skips uncollected slots.

Static island geometry is combined into spatial batches instead of hundreds of individual draw calls. Live shadows are disabled, weapon models use one draw call each, resolution adapts on slow devices, rendering stops behind forms, and high-frequency movement does not drive React on every frame. These changes target small friend matches, with basic abuse prevention rather than competitive anti-cheat.

Map collision data comes from the same geometry rendered in the browser. After changing the island, run `npm run map:export` and commit the generated data.

The live WebSocket server lives in `server/index.ts` and deploys to the Neon project in `server/deployment.json`. Build its bundle with `npm run server:build`. For a local server, set `DATABASE_URL` and run `npm run server:dev`; point `REALTIME_URL` at `ws://localhost:3001/ws`. The HTTP synchronization path remains available for integration and fallback diagnostics.

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

Set `MULTIPLAYER_TEST_URL` to the full API endpoint to test another deployment. The two-player WebSocket test runs with `npm run test:websocket`; `SECONDARY_TEST_URL` can point to a second WebSocket server process backed by the same database to test cross-process consistency. The integration test creates a temporary room and leaves it on completion; expired rooms are cleaned up by the server.

`npm run test:realtime` runs eight simultaneous live sockets, reports movement latency, verifies unarmed spawning and a weapon pickup, rejects a ninth player, and checks command idempotency. Use `MULTIPLAYER_TEST_URL` to choose the WebSocket service HTTP origin.
