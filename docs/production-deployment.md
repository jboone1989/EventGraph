# LivingRuntime production · VM09 (single current deployment)

Official source: `main`. Current release source: `/home/ubuntu/livingruntime-prod-source` on VM09. The domain `livingruntime.com` and `www.livingruntime.com` stay on VM09. VM13 (`43.133.185.154`) is **not a production target**; its separate EventGraph development Web preview is documented in [vm13-preview.md](vm13-preview.md). Ferro is deployed independently.

## One-stack architecture and single-command releases

Production is **only** VM09 and the `livingruntime` Docker Compose project. Cloudflare Tunnel forwards to `127.0.0.1:3000`. Web, API, one worker, PostgreSQL, Graphiti and Neo4j run in the same Compose project. The independent VM13 development preview must never share these production volumes or release commands.

**For every ordinary software release, from VM09:**

```bash
cd /home/ubuntu/livingruntime-prod-source
bash scripts/deploy-prod.sh
```

That one command fetches the exact `main` commit, builds **only changed** application/Graphiti images on cn-dev using a clean `git archive`, streams only the changed images to VM09, advances VM09's Git checkout, sets `LRSITE_RELEASE`, reconciles application service image/config hashes **without any build or database/Neo4j restart on VM09**, and runs a substantive production smoke check. The PostgreSQL and Neo4j named volumes are **not replaced or re-imported**. AdSense and model inference retain their configured flags.

For a safe environment check before deploying:

```bash
bash scripts/deploy-prod.sh --check
```

The release uses `docker-compose.yml`, `docker-compose.production.yml`, `docker-compose.knowledge.yml`, and `docker-compose.release.yml` in that order. The final overlay selects prebuilt `livingruntime-app:<sha>` and `livingruntime-knowledge:<sha>` images; `--no-build --pull never` prevents accidental image builds on VM09. The development host must be SSH-reachable from VM09 and have working Docker, and both hosts access the same internal Git remote. Image transport requires no paid registry.

**Initial migration is a separate one-time task, not part of ordinary deployment.** The old host application, three app systemd units and old `lrsite` host PostgreSQL database have been removed. Never revive them or copy legacy databases into production.

## Data ownership

Development's current dataset was imported into the production PostgreSQL volume; production has **its own writable dataset** thereafter. Do not repeatedly overwrite the live production database with a development snapshot. A consistent Neo4j 5.26.2 offline dump was imported into production's graph volume.

Archive copies of the new source snapshot (`from-cn-dev-latest.dump`, `neo4j-from-dev.dump`) are private and are **recovery artifacts**, not running databases. Regular independent production backups should be configured before substantial new traffic.

To restore PostgreSQL into a freshly provisioned, stopped `livingruntime` stack, use `scripts/production-db-restore.py --archive <archive> --compose docker-compose.yml --compose docker-compose.production.yml --replace --confirm-destination livingruntime`. This resets **the isolated Compose database only**, including public and pgboss schemas. Never run it on a running API, web or worker; the script checks for that. Apply migrations after import.

To restore Neo4j, stop the knowledge/Neo4j services and use the official matching-version `neo4j-admin database load` utility with a consistent backup. Do not import an old VM09 graph or configure production to query a development database.

## Credentials, costs, and service policy

The host's private `.env` is mode 0600 and must not enter Git. Site URL is `https://www.livingruntime.com`. `LRSITE_PORT=3000`, `GRAPHITI_API_URL=http://knowledge:8000`, `GRAPHITI_INGEST_ENABLED=false`, and `MODEL_CALLS_ENABLED=false` are used to serve the migrated graph without paid inference. Enabling new AI graph extraction requires separately verified credentials, cost controls and explicit approval. A placeholder inference key is only a boot-time read-only compatibility value; never treat it as a functioning model key.

AdSense is pending approval: verification, ad scripts and ad tracking stay disabled. `/ads.txt` intentionally returns 404 until a real publisher ID is configured and ownership verification is intentionally enabled.

## Operations and acceptance

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.knowledge.yml --profile knowledge ps
docker compose -f docker-compose.yml -f docker-compose.production.yml -f docker-compose.knowledge.yml --profile knowledge logs --tail=100
python3 scripts/production-smoke.py
```

Production smoke must verify actual news content, a nonempty hot ranking, positive graph entity/relationship counts, canonical pages, and default-off AdSense. A 200 response by itself is not proof of a deployed graph.

VM09 memory is about 3.6 GiB plus 2 GiB swap. Keep only one worker and watch RAM/swap. Never run `docker compose down -v`: it deletes production database/graph data.

## Production/development configuration contract

Each environment owns its own private `.env` and secrets; never copy the development database or secrets into production. The deploy preflight now validates explicit boolean flags and required NVIDIA credentials with `python3 scripts/production-env-check.py .env --role production`. It fails rather than silently inheriting the production Compose default `MODEL_CALLS_ENABLED=false`. To compare **only feature flags** (not credentials): `python3 scripts/production-env-check.py .env.production --role production --compare .env.development` (on a host where both sanitized local files exist). Decide any intentional dev/prod differences explicitly. This check does not enable model calls without credentials or bypass provider rate limits.

Routine changes: no code change means no rebuild; application code changes update only web/API/worker; `knowledge_service/` changes update only Graphiti; database migrations run only when new migration files change. Docker Compose reconciles changed config hashes without `--force-recreate`, and PostgreSQL and Neo4j are omitted from the normal `up` command. Initial provisioning remains separate.

The version-controlled `config/environments/production.flags.env.example` is the target feature-state contract, not a credential file. Production preflight compares it with private `.env` using `--enforce` and **blocks** undeclared drift (for example, dev-enabled NVIDIA vs production-disabled NVIDIA). Any intentional difference must be committed to its corresponding per-environment flag template; confidential keys stay in host-only `.env`. The first rollout of this stricter contract requires configuring the production flags and NVIDIA credentials before invoking the release script.
