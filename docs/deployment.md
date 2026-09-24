# Hosting and automatic deployment

Use Cloudflare Workers for the Vinext website and its static assets. Keep the existing Neon Postgres database and Neon Function for multiplayer in AWS us-east-2. The game already uses these runtimes, so this avoids a backend rewrite. Assets under `public/` ship with the website; no separate object storage is needed. Source stays in the private GitHub repository.

## One-time setup

1. Create or sign into a Cloudflare Free account. Enable its workers.dev subdomain in Workers & Pages. The worker name is `sandbox-royale`, so the website URL will be `https://sandbox-royale.<your-subdomain>.workers.dev`. A custom domain is optional.
2. Create a Cloudflare API token using the **Edit Cloudflare Workers** template, scoped to that account. Copy the account ID from the dashboard.
3. Create a Neon API key with access to the existing `winter-base-44302343` project. Use that project's existing multiplayer database connection string, not a new empty database. The production branch and Function slug are recorded in `server/deployment.json`.
4. In GitHub, open **Settings > Environments**, create `production`, and restrict deployment branches to `main`. Leave required reviewers off for automatic deployment. Add these environment secrets:

   | Secret | Value |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | Scoped Workers deployment token |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
   | `NEON_API_KEY` | Key allowed to deploy the existing Function |
   | `MULTIPLAYER_DATABASE_URL` | Connection string for the existing multiplayer database |

   Add the environment variable `PRODUCTION_URL` with the exact HTTPS website origin, without a trailing slash. Never paste credentials into code, chat, or a workflow file.
5. Merge the deployment changes into `main`. Check **Actions > Check and deploy**. Later merges run the same workflow automatically. To retry, use **Run workflow** on `main`.

The workflow checks tests, TypeScript, lint and both builds before deployment. Pull requests only run checks. It uploads the checked artifacts, deploys the Neon Function first, then the Cloudflare website with its runtime database secret, and runs the existing two-player integration test against the website. That test now sends the website's Origin header on its WebSocket connections to catch a missing allowlist entry. It creates a temporary test room.

`ALLOWED_ORIGINS` on the Neon Function is set from `PRODUCTION_URL`. The original Sites URL and local development origins remain supported. If you add more domains, update the deployment script to pass all intended origins, comma-separated.

GitHub Actions owns deployment. Do not also enable Cloudflare Git builds for the same worker. Protect `main` with the `check` status check if you want GitHub to require passing checks before merging.

## Cost and performance

Published limits checked September 23, 2026:

| Service | Free allowance | What matters here |
| --- | --- | --- |
| Cloudflare Workers | 100,000 dynamic requests/day, 10 ms CPU per invocation; static asset requests are free | Game assets use the global CDN. SSR and the room API consume Worker requests. Measure SSR CPU on the first live deployment. |
| Neon Postgres | 100 CU-hours/project/month, 0.5 GB storage/project, 5 GB public transfer/project | The server updates room state every 50 ms. Active matches consume compute and transfer. Idle scale-to-zero reduces compute usage. |
| Neon Functions | 10 active and 400 waiting Capacity-Hours, 1 million invocations/month | Persistent WebSockets consume runtime. Free hosting depends on actual play time and traffic. |

Sources: [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/), [Neon pricing](https://neon.com/pricing). GitHub Actions also has a monthly included allowance for private repositories; usage depends on the GitHub account's plan and build frequency.

This is a sensible $0 starting configuration for light use, not a promise of unlimited free multiplayer. The existing Neon project reports about 90 MB of storage and about 7.0 GB of data transfer for its September billing period. That transfer counter alone does not establish billable public egress, but it warrants checking the Neon usage dashboard before relying on the 5 GB allowance. The project currently reports the Free plan.

Cloudflare's next step is Workers Paid, starting at $5/month. Neon paid usage depends on runtime, storage and transfer. Keep free plans initially and inspect usage after real matches; do not upgrade automatically. Neon's scale-to-zero can add a delay to the first room request after inactivity. Players far from Ohio will also have higher gameplay latency even though website assets are served nearby.

## Recovery and database changes

Deployments are serialized and never cancel an in-progress rollout. The two providers cannot publish atomically: a website deployment failure can leave the new backend with the previous frontend. Keep protocol changes backward compatible. Existing sockets can reconnect during a backend redeploy; avoid promising uninterrupted matches.

To roll back both components, revert the bad commit through a pull request and merge it to `main`. Re-running an old workflow can publish old code over newer changes, so prefer a revert. A failing post-deployment integration test marks the run failed but does not automatically roll back either service.

The workflow does not apply database schema changes. The existing database already has `server/schema.sql`. For a new database, apply that schema once before deployment. Review future migrations separately and apply backward-compatible migrations before merging code that requires them.

The old Sites deployment is separate and will not update from this workflow. Share the new Cloudflare URL after the first successful deploy, or attach a custom domain in Cloudflare.
