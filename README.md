# Sandbox Royale

A browser-based first-person battle royale built with Three.js, React, and Vinext. Play solo against 15 AI rivals, or create a friend room for 2–8 human players.

## Play with friends

1. Select **Play with friends**, enter a callsign, and create a room.
2. Use **Copy invite link**, or send your friends the six-character room code.
3. Each friend opens the game, enters a callsign, and joins the room.
4. The host selects **Start match**. Everyone selects **Enter match** to capture their mouse. After a five-second countdown, everyone descends under a steerable parachute. Use WASD or the touch stick to choose a landing spot; glowing loot is visible below.
5. Eliminated players see a short death sequence, then automatically spectate their killer. Use [ / ] or Previous / Next to follow another survivor. Open Results to see the scoreboard. The last surviving player wins. Everyone can ready up from Results; when all connected players are ready, the next countdown begins in the same room.

The game website must be shared with friends before they can open it. Room codes control which match they join. Opening the in-game menu does not pause an online match. A dropped connection automatically retries; players have 20 seconds to reconnect before elimination. Rooms expire after two hours. Refreshing the page leaves the current session; reconnect is intended for interruptions within the open page.

## Run locally

```sh
npm install
npm run dev
```

Open the URL printed by the server. WebGL 2 is required. WASD moves, mouse aims, left click fires, right click zooms, Shift sprints, Space jumps, R reloads, E collects supplies, Q uses a medkit, F uses a shield cell, X cancels healing, and 1–3 or the scroll wheel switches collected weapons. Escape opens the menu. Touch controls are available in Settings.

Room creation and joins use the same-origin `/api/multiplayer` endpoint. Live gameplay connects directly to the Neon WebSocket endpoint in `lib/game/network-config.ts`. Set `MULTIPLAYER_DATABASE_URL` in an ignored `.dev.vars` file for local development and in Sites secrets for deployment. Apply `server/schema.sql` to the dedicated multiplayer database. Its identifiers are in `server/deployment.json`.

## Multiplayer architecture

The browser sends movement and actions over a persistent authenticated WebSocket. Each server process batches all inputs for a room every 50 ms, advances the authoritative match under a Postgres row lock, and broadcasts snapshots with per-player sequence acknowledgments. The database and WebSocket server run in the same region. Separate processes share the same room state, retries cannot fire a shot twice, and clients predict local movement and interpolate opponents.

The server validates inventory ownership, movement, cover, weapon cooldowns, ammo, damage, exclusive loot collection, capacity, starts, storm timing, and winners. Every player starts with no guns or ammo. Collecting the first AR, shotgun, or sniper loads its magazine and equips it; duplicate pickups add reserve ammo. Gamertags with numeric health and shield bars appear above opponents, and weapon selection skips uncollected slots.

Medkits and shield cells are stored separately, with a maximum of three each. A medkit restores up to 75 health over four seconds; a shield cell restores up to 50 shields over 2.5 seconds. Walking is allowed at half speed while healing. Incoming damage, firing, reloading, weapon switching, or canceling interrupts use without spending the item. Health and shields cap at 100. All recovery timers, pickups and inventory changes are resolved by the server.

The HUD includes damage totals, headshot and shield-break feedback, a directional warning for hits and nearby gunfire, a kill feed, and safe-zone distance and direction. Deaths trigger a falling avatar animation and killer identification. Killer identity persists in room snapshots so spectating still works after a delayed update. The match results list everyone's placement and eliminations, with per-player ready indicators and a shared ready-up button.

Parachutes start 42 meters above the ground and descend at six meters per second after the countdown. Players can steer, but cannot heal, fire, or claim ground loot until landing. The server controls altitude and resolves landings over buildings to nearby clear ground.

Static island geometry is combined into spatial batches instead of hundreds of individual draw calls. Live shadows are disabled, weapon, recovery-item and parachute models use one draw call each, resolution adapts on slow devices, rendering stops behind forms, and high-frequency movement does not drive React on every frame. These changes target small friend matches, with basic abuse prevention rather than competitive anti-cheat.

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

`npm run test:realtime` runs eight simultaneous live sockets, reports movement latency, verifies shared parachute drops, unarmed landings and all three weapon pickups, rejects a ninth player, and checks command idempotency. Use `MULTIPLAYER_TEST_URL` to choose the WebSocket service HTTP origin.

`npm run test:recovery` exercises a complete two-player drop, healing pickup, timed recovery, damage interruption, persistent killer identity, and rematch reset over real WebSockets. It uses the same `MULTIPLAYER_TEST_URL` option.

## Branding

The interface uses the supplied Sandbox logo, the black and white palette from https://web.sandbox.ing/, and its Affairs and Edu Diatype font assets. The existing multiplayer endpoint and local high-score storage key stay compatible with previous releases.

## Aim and combat balance

Right-click to aim, or toggle the aim button on touch screens. The sniper's physical model hides while scoped so its transparent 3× reticle has a clear sightline. AR and shotgun aim views keep the model below the center dot. Damage is 14 per AR bullet, 10 per shotgun pellet, and 50 per sniper round. Headshots multiply damage by 1.5. A fresh player with 100 health and 50 shields survives any single weapon blast, including a full shotgun headshot.


### Active games, duos, and the sandbox

The homepage lists up to 50 rooms with a recent player heartbeat, refreshing every 10 seconds while visible. Room summaries expose only names, codes, mode, phase, and counts. Waiting rooms accept players; late arrivals spectate and reserve a seat for the next round. Full rooms are disabled and joins recheck capacity transactionally. The homepage proxies room creation, joining, and discovery to the live server so membership changes use row locks instead of racing high-frequency snapshots. `node scripts/test-site-join.mjs` verifies the homepage API against live sockets; set SITE_TEST_URL to target a deployed site.

Hosts choose free-for-all or Duos. Each player can select a team of up to two; a match needs at least two teams. Friendly fire is disabled. A lethal hit downs a player for 20 seconds if a teammate is still standing. Press E within 3m to revive for four seconds, restoring 50 health. Damage to either player, leaving range, another combat action, or X cancels the revive. Losing the last standing teammate eliminates the duo. Victory is shared by the winning team.

G or middle-click marks an enemy, loot, or location for eight seconds. The touch HUD has a ping button. Duo pings are filtered per authenticated player, never sent to opposing teams. Nearby moving enemies produce stereo footsteps and a directional ring around the crosshair; Visual footsteps can be toggled independently from audio in Settings.

The arena uses sandy ground, wooden sandbox edges, sandcastle cover, and oversized toy buckets. Static geometry still batches down to roughly 60 draw submissions.

The sandbox is 363 meters across its playable circle, with horizontal terrain scale 1.65. Player size, cover heights, weapon ranges, and movement speeds stay unchanged. Every room uses the full opening circle: 55 seconds to explore before the first closure, followed by off-center phases reaching the final circle after 335 seconds. Eliminations can end a round earlier. `node scripts/test-large-map.mjs` checks expanded movement, outer loot, and opening timings over real sockets.

Treasure chests replace sixteen loose floor pickups: each round has 31 floor items and eight active chests chosen from twelve locations. Both central castle halls always contain a chest. Press E nearby to open it; a Rare, Epic, or Legendary gun with ammo and one healing item appear as shared, individually claimable loot. Opening is atomic on the server and cannot happen through walls, from the roof, or during the parachute drop. Chests use three instanced drawing batches, animated lids, and quiet proximity chimes. Weapon bodies, saturated beacons, and wide colored ground rings make rarity visible without overhead item labels.

Sandcastle Square and Bucket Town now have four doorways, separate roof collision, interior partitions, and exterior mantle ledges leading to the roof. Results fade in after the death sequence or final elimination. Connected players can ready up or cancel without leaving the scoreboard; late arrivals can join that next drop too. The existing host room reset command remains available for older clients.

`node scripts/test-chests.mjs` checks entering a castle, shared chest opening and pickup, a late join, and ready-up into a fresh round using real WebSockets. Headless geometry checks cover the open halls, wall/roof blocking, mantle ledges, shared loot ownership, and the render budget with every chest opened.
