# Sandbox Royale

**[Play Sandbox Royale](https://sandbox-royale.reactjack7.workers.dev)**

A browser-based first-person shooter built with Three.js, React, and Vinext. Play solo against 15 AI rivals, practice with every weapon, or invite friends into a room for up to eight human players.

## Play

1. Open [the public game](https://sandbox-royale.reactjack7.workers.dev) in a browser with WebGL 2.
2. Choose **Drop in solo**, **Practice range**, or **Play with friends**.
3. For multiplayer, enter a callsign and create a room. Share its invite link or six-character code. Friends can also find recent rooms under **Active games**.
4. The host chooses a mode and starts the match. Use the on-screen entry/resume button to capture the mouse. Touch controls are available in Settings.
5. Between rounds, vote for the next mode and ready up. The room code stays the same.

| Mode | How it plays |
| --- | --- |
| Solo Royale | Battle royale with loot and a shrinking safe zone. Last survivor wins. |
| Duos | Teams of two, downed teammates and revives, no friendly fire. |
| Gun Game | Progress through weapons by earning eliminations, with respawns. |
| Team Deathmatch | Two teams race to 30 eliminations. Choose a loadout and respawn after elimination. |
| Practice range | Try weapons and inspect target damage without affecting a match. |

Battle royale rounds begin on a flying bus. Jump out and steer your parachute toward a landing spot. Collect weapons, ammo, healing items and chest loot. Eliminated players can spectate; late arrivals can watch and join the next round. Hosts can add bots in supported room settings.

The menu does not pause multiplayer. Connections retry after brief interruptions, but refreshing the page leaves your session. Rooms expire after two hours. Guests keep settings on their device. Signed-in players automatically sync settings and their Team Deathmatch loadout. Your solo personal best stays on this device.

## Accounts and leaderboard

Choose **Sign in / Stats & leaderboard** in the lobby to create an email/password account, sign in, or reset your password. Guests can still play. Sign in before joining a room; leave the room before changing accounts.

Your first sign-in imports this device's controls, crosshair, audio, visual footsteps, weapon order and Team Deathmatch loadout. Later sign-ins restore your saved setup, and changes save automatically. Check the account screen for save status and refresh your stats after a match.

The account screen shows rounds, wins, kills and deaths, plus the top 50 players ordered by wins, kills, then fewer rounds. Only completed multiplayer rounds count, including rounds with bots. Guests, spectators, local solo/practice and players who leave before the round finishes are excluded. Team wins credit each participating teammate. This is a casual leaderboard, not a competitive ranking; names need not be unique. Player names and totals are public; email addresses are not.

## Controls

| Action | Keyboard / mouse |
| --- | --- |
| Move / look | WASD / mouse |
| Fire / aim | Left click / right click or Z |
| Sprint / jump / crouch | Shift / Space / C |
| Reload / interact | R / E |
| Medkit / shield / cancel healing | Q / F / X |
| Switch weapon | Number keys or scroll wheel; practice supports 1–8 |
| Melee / ping | B / G or middle click |
| Menu | Escape |

Settings include sensitivity, crosshair, hold/toggle movement preferences, weapon order, audio and visual footsteps. Command stays available for browser shortcuts.

## Development

Use Node.js 24 and npm. Ask Jack for access to this private repository, then:

```sh
git clone https://github.com/jackelly7/sandbox-royale.git
cd sandbox-royale
npm ci
npm run dev
```

Open the URL printed by the dev server. Solo and practice require no database credentials. By default, friend rooms use the deployed multiplayer backend, including when the website runs locally.

For an isolated multiplayer backend, use a development database, apply `server/schema.sql`, export its connection string as `DATABASE_URL`, and run `npm run server:dev`. Temporarily set `url` in `server/deployment.json` to `http://localhost:3001` so both browser WebSockets and the website's room proxy use that server. Do not commit that local URL. If Vite uses a port other than 3000, set `ALLOWED_ORIGINS` on the server to that exact local origin.

Authentication needs a random `NEON_AUTH_COOKIE_SECRET` of at least 32 characters in `.dev.vars` (generate with `openssl rand -base64 32`). Neon Auth must be enabled on the configured branch, with the website origin trusted and localhost allowed for development.

The legacy HTTP synchronization endpoint also needs `MULTIPLAYER_DATABASE_URL` in an ignored `.dev.vars` file, pointing at the same database. Use `.dev.vars.example` as a template. Never commit connection strings, API keys, or local environment files.

## How it works

Cloudflare Workers serves the website, static assets, `/api/multiplayer`, the Neon Auth SDK proxy at `/api/auth/*`, and `/api/account/*`. Room discovery, creation and joining proxy to the Neon Function. The browser connects directly to that Function over an authenticated WebSocket for gameplay. Neon Postgres and the Function run together in AWS us-east-2.

The server batches room inputs every 50 ms and updates authoritative state under a Postgres row lock. It checks movement, inventory, shots, damage, loot, match rules and results. Clients predict local movement and interpolate other players; command sequences protect against replayed actions after reconnecting. The database shares state across server processes.

Neon Auth manages passwords and session cookies. Account requests and room entry use short-lived signed tokens, verified against this branch’s JWKS, issuer and audience. The server binds account identity to the room member. A database trigger atomically saves server-produced round results with the room update; a match/account primary key prevents double counting. Browser-supplied scores and account IDs are never trusted.

`server/deployment.json` holds the production project, branch, Function slug and public backend origin. `lib/game/network-config.ts` supplies that origin to the browser, website proxy and live tests. Secrets live in GitHub's `production` environment and the deployed runtime.

Map collision data comes from the rendered geometry. After changing the island, run `npm run map:export` and commit the generated data. Geometry tests cover collision layout and rendering budgets, not real-device frame rates.

## Deployments

Merges to `main` automatically run checks, apply the idempotent database schema, and deploy the Neon Function, then the Cloudflare website. The workflow waits for HTTPS and tests room discovery, joining and live WebSockets through the public site. No separate manual publish is needed.

Both hosting accounts remain on free plans. Multiplayer can stop when Neon's monthly quota is exhausted; deployments do not reset quotas or enable paid upgrades. See [deployment setup, limits and recovery](docs/deployment.md).

## Checks and contributions

Branch from `main` using a `jack/` prefix, then open a pull request. Run:

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run server:build
```

To test the public website and its configured backend together:

```sh
SITE_TEST_URL=https://sandbox-royale.reactjack7.workers.dev node scripts/test-site-join.mjs
```

For account integration tests, run a local website and server, then run `MULTIPLAYER_DATABASE_URL=... node scripts/test-accounts.mjs`. The script uses reserved test email addresses, checks signup/login/logout, settings isolation, token validation and result deduplication, then removes its test users. `SITE_TEST_URL` and `ACCOUNT_SERVER_URL` can target a deployed environment. Never put credentials in a committed script.

Live tests create temporary rooms and consume backend quota. `npm run test:realtime` checks eight simultaneous sockets, movement and replay protection. Other scenario tests live in `scripts/test-*.mjs`.

`MULTIPLAYER_TEST_URL` overrides the backend HTTP origin for WebSocket/scenario tests. `npm run test:websocket` defaults to `http://localhost:3001`; the other deployed-backend scenario tests use `server/deployment.json`. `npm run test:multiplayer` tests the legacy HTTP protocol and expects a full API URL, defaulting to `http://localhost:3000/api/multiplayer`.

## Assets

The fonts and logo under `public/brand` are licensed Sandbox assets. Keep them in this private repository and do not redistribute them. The interface uses the supplied Sandbox logo, black and white palette, and Affairs and Edu Diatype fonts.
