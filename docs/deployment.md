# Hosting and automatic deployment

**Public game: [sandbox-royale.reactjack7.workers.dev](https://sandbox-royale.reactjack7.workers.dev)**

Cloudflare Workers hosts the Vinext website and its static assets. Neon Postgres and a Neon Function host multiplayer in AWS us-east-2. Both use free plans; do not enable paid upgrades. Assets under `public/` ship with the website; no separate object storage is needed. Source stays in the private GitHub repository.

## Production configuration

Automatic deployment is configured in `.github/workflows/deploy.yml`. The Worker is `sandbox-royale`. The current Neon project, branch, Function slug and public backend origin are in `server/deployment.json`; the browser, API proxy and scenario tests share that origin through `lib/game/network-config.ts`.

The following steps document how to recreate the setup.

1. Create or sign into a Cloudflare Free account. Enable its workers.dev subdomain in Workers & Pages. The worker name is `sandbox-royale`, so the website URL will be `https://sandbox-royale.<your-subdomain>.workers.dev`. A custom domain is optional.
2. Create a Cloudflare API token with **Account > Workers Scripts > Edit**, scoped to that account. Copy the account ID from the dashboard.
3. Create a Neon API key with access to the project identified in `server/deployment.json`. Use that project's existing multiplayer database connection string, not a new empty database. The production branch and Function slug are recorded in `server/deployment.json`.
4. In GitHub, open **Settings > Environments**, create `production`, and restrict deployment branches to `main`. Leave required reviewers off for automatic deployment. Add these environment secrets:

   | Secret | Value |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | Scoped Workers deployment token |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
   | `NEON_API_KEY` | Key allowed to deploy the existing Function |
   | `MULTIPLAYER_DATABASE_URL` | Connection string for the existing multiplayer database |

   Add the environment variable `PRODUCTION_URL` with the exact HTTPS website origin, without a trailing slash. Never paste credentials into code, chat, or a workflow file.
5. Merge the deployment changes into `main`. Check **Actions > Check and deploy**. Later merges run the same workflow automatically. To retry, use **Run workflow** on `main`.

The workflow checks tests, TypeScript, lint and both builds before deployment. Pull requests only run checks. It uploads the checked artifacts, deploys the Neon Function first, then the Cloudflare website with its runtime database secret, waits for the website to respond over HTTPS, and runs the room-join integration test against the website. That test now sends the website's Origin header on its WebSocket connections to catch a missing allowlist entry. It creates a temporary test room.

`ALLOWED_ORIGINS` on the Neon Function is set from `PRODUCTION_URL`. Local development origins on port 3000 remain supported. If you add more domains, update the deployment script to pass all intended origins, comma-separated.

GitHub Actions owns deployment. Do not also enable Cloudflare Git builds for the same worker. Protect `main` with the `check` status check if you want GitHub to require passing checks before merging.

## Cost and performance

Published limits checked September 23, 2026:

| Service | Free allowance | What matters here |
| --- | --- | --- |
| Cloudflare Workers | 100,000 dynamic requests/day, 10 ms CPU per invocation; static asset requests are free | Game assets use the global CDN. SSR and the room API consume Worker requests. Measure SSR CPU on the first live deployment. |
| Neon Postgres | 100 CU-hours/project/month, 0.5 GB storage/project, 5 GB public transfer/project | The server updates room state every 50 ms. Active matches consume compute and transfer. Idle scale-to-zero reduces compute usage. |
| Neon Functions | 10 active and 400 waiting Capacity-Hours, 1 million invocations/month | Persistent WebSockets consume runtime. Free hosting depends on actual play time and traffic. |

Sources: [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/), [Neon pricing](https://neon.com/pricing). GitHub Actions also has a monthly included allowance for private repositories; usage depends on the GitHub account's plan and build frequency.

Free hosting is limited. The previous multiplayer project exhausted its quota in September 2026 and the database rejected room requests. A fresh project was initialized with the schema; old room codes were not migrated. Device-local settings and solo personal bests are unaffected. This is a one-time backend replacement, not automatic project rotation.

Watch compute and transfer usage in Neon after real matches. A new project can reach the same limits. The app does not upgrade plans automatically. Scale-to-zero reduces idle compute but can delay the first room request. Players far from Ohio have higher gameplay latency even though website assets are served nearby.

## Recovery and database changes

Deployments are serialized and never cancel an in-progress rollout. The two providers cannot publish atomically: a website deployment failure can leave the new backend with the previous frontend. Keep protocol changes backward compatible. Existing sockets can reconnect during a backend redeploy; avoid promising uninterrupted matches.

To roll back both components, revert the bad commit through a pull request and merge it to `main`. Re-running an old workflow can publish old code over newer changes, so prefer a revert. A failing post-deployment integration test marks the run failed but does not automatically roll back either service.

The workflow does not apply database schema changes. The existing database already has `server/schema.sql`. For a new database, apply that schema once before deployment. Review future migrations separately and apply backward-compatible migrations before merging code that requires them.

Share the public Cloudflare URL above. The former ChatGPT Sites URL is retired and does not receive these deployments.

## Replacing the multiplayer backend

1. Create a project in the existing free Neon organization, in `aws-us-east-2`, with a `lastlight` database and `lastlight_owner` role. Keep the free plan and minimum compute.
2. Apply `server/schema.sql` to the new database. This creates empty room, command and rate-limit tables.
3. Update the project and branch in `server/deployment.json`. Build and deploy the Function using `npm run server:build` and `SITE_TEST_URL=https://sandbox-royale.reactjack7.workers.dev npm run server:deploy`. This requires an authenticated Neon CLI or `NEON_API_KEY`.
4. Set `url` in `server/deployment.json` to the actual invocation URL returned by Neon, without a trailing slash. Do not guess the cluster hostname.
5. Test the new backend. Replace the GitHub production secrets `NEON_API_KEY` with a key scoped to the new project and `MULTIPLAYER_DATABASE_URL` with its connection string before merging. Update any ignored local `.dev.vars` separately.
6. Merge and verify the GitHub deployment and public-site integration test. Existing rooms do not carry over; players must refresh the website and create new rooms. Keep the previous project until the switch is verified.

If a deployment publishes successfully but the integration test fails, inspect the Neon Function logs and GitHub job output. A quota-exceeded database error requires waiting for the allowance to reset or a separately approved hosting change. Retrying deployment alone will not restore the allowance.
