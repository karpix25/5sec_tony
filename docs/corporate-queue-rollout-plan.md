# Corporate Queue Rollout Plan

## Goal

Move generation work from in-process Node state to a corporate-grade job platform without deleting existing projects, products, media, avatars, references, audio, or historical jobs.

Postgres remains the source of truth. Redis/BullMQ becomes the execution dispatcher. `state.jobs` remains the UI read model.

## Non-Negotiable Data Rules

- All migrations are additive-first: `create table if not exists`, `alter table add column if not exists`, and indexes only.
- No queue migration may run `drop`, `truncate`, or broad `delete`.
- Workers must update jobs through patch-only job APIs, not full-state snapshot saves.
- Existing `/api/jobs/run`, `/api/jobs/status`, and `state.jobs` contracts stay compatible until the new queue is proven in production.
- Existing projects/products can disappear only with explicit tombstones: `deletedProjectIds` and `deletedProductIds`.
- Before enabling BullMQ in production, take a Postgres dump and asset-link manifest, then run count/parity checks.
- Yandex Disk, S3, and local media folders are not duplicated by this rollout. The backup stores only existing URLs/paths from Postgres state.

## Current Risks To Remove First

- `saveNormalizedState()` rewrites normalized tables by clearing rows and reinserting the full state.
- `serverJobs = new Map()` is runtime-only and cannot be the source of truth for multi-worker execution.
- Server workers must not call full state save paths.
- Redis must not become the only place where a job exists.

## Phase 0: Safety Gates

1. Run `npm run backup:postgres` with the production `DATABASE_URL` in the process environment.
2. Verify `postgres.dump`, `table-counts.json`, `asset-links.json`, and `manifest.json` are created under `backups/postgres/<timestamp>/`.
3. Add project-loss guard to `/api/state`, matching the existing product-loss guard.
4. Add explicit `deletedProjectIds` tombstone when the UI intentionally deletes a project.
5. Add additive queue schema with queue metadata/events and no destructive DDL.
6. Add tests that prove queue DDL is additive-only and deletion guards block accidental data loss.

Exit criteria:
- `npm run check` passes.
- `npm test` passes.
- Deleting a project intentionally still works.
- Losing a project from a save payload without `deletedProjectIds` returns `409`.
- Backup manifest includes Postgres table counts and existing asset links only.

## Phase 1: Postgres Job Ledger

Add dedicated job ledger modules:

- `scripts/job-ledger-store.mjs`
- `scripts/job-ledger-events.mjs`
- `scripts/job-queue-schema.mjs`

The ledger stores:

- public job snapshot for UI mirroring
- queue name/status/priority
- idempotency key
- provider task id
- attempts and retry schedule
- worker lock/heartbeat
- result/error payload
- append-only events

Every job patch must:

1. update ledger data;
2. append an event;
3. mirror the public job into `studio_jobs`.

Exit criteria:
- Existing UI still reads from `state.jobs`.
- Job patch tests prove projects/products/audio are untouched.
- Status endpoint can read ledger first and fallback to legacy `studio_jobs`.

## Phase 2: Queue Abstraction

Create queue driver abstraction:

- `scripts/job-queue-dispatcher.mjs`
- `scripts/job-worker.mjs`
- `scripts/server-job-runner.mjs`

Environment:

- `JOB_QUEUE_MODE=inline|bullmq`
- `REDIS_URL`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` as an alternative to `REDIS_URL`
- `JOB_QUEUE_NAME`
- `JOB_WORKER_CONCURRENCY`

Default remains `inline` for local/test. BullMQ is opt-in.

Exit criteria:
- `/api/jobs/run` is idempotent by `job.id` and `queue_idempotency_key`.
- Repeated launch does not double-spend provider calls.
- Inline mode matches current behavior.

## Phase 3: Worker Processes

Split `scripts/server-jobs.mjs` into:

- API facade
- pipeline runner
- worker entrypoint

The web process creates jobs. Worker processes execute jobs.

Exit criteria:
- Web process can restart without losing running jobs.
- Worker can restart and recover jobs from Postgres.
- Stale `running` jobs with `provider_task_id` resume polling instead of creating duplicate provider tasks.

## Phase 4: BullMQ Production Rollout

Deployment services:

- `web`
- `worker-image`
- `worker-video`
- `worker-disk`
- `redis`
- `postgres`

Start with low concurrency:

- image: 1
- video: 1
- disk: 2

Then raise after observing provider limits and failure rates.

Runbook:

1. Deploy web with Postgres env and `JOB_QUEUE_MODE=inline`.
2. Run `npm run backup:postgres`.
3. Verify `/api/jobs/run` and `/api/jobs/status` still work.
4. Start Redis.
5. Run `npm run queue:readiness`.
6. Start one worker with `npm run worker:jobs`.
7. Switch web and worker env to `JOB_QUEUE_MODE=bullmq`, `JOB_QUEUE_STRICT=true`, and `REDIS_URL`.
8. Run `npm run queue:smoke -- --file <prepared-job-payloads.json> --count 20 --concurrency 3 --base-url <studio-url>`.
9. Raise `JOB_WORKER_CONCURRENCY` only after provider errors and retry counts are stable.

Required production env:

- `JOB_QUEUE_MODE=bullmq`
- `JOB_QUEUE_STRICT=true`
- `REDIS_URL=<redis-url>` or `REDIS_HOST`/`REDIS_PORT`
- `JOB_WORKER_CONCURRENCY=2` at first rollout
- `JOB_QUEUE_NAME=generation`

Exit criteria:
- Jobs complete under BullMQ with the same UI statuses.
- Killing/restarting a worker does not lose or duplicate work.
- Redis outage can be reconciled from Postgres ledger.

## Phase 5: Automation And Operators

Add scheduling controls:

- project concurrency
- operator concurrency
- global provider concurrency
- manual priority over automation
- daily/project limits
- duplicate topic/idempotency protection

Queue priorities:

- manual: 100
- automation: 50
- retry: 30

Exit criteria:
- Multiple operators can enqueue without overwriting each other.
- Automation cannot overrun project limits.
- Queue screen shows retry/recovering/waiting/provider states clearly.

## Phase 6: Avatar Video Queue

Move avatar video generation into the same ledger/queue model after render jobs are stable.

Exit criteria:
- Existing avatar records remain in project characters.
- New avatar-video jobs survive reload and worker restart.
- Alpha conversion is a separate retryable step.

## Rollback Plan

1. Set `SERVER_JOBS_QUEUE_DRIVER=inline`.
2. Stop BullMQ workers.
3. Keep ledger tables; do not delete them.
4. UI continues reading `state.jobs`.
5. Reconcile any active ledger jobs back into `studio_jobs`.

## Subagent Split

- Agent A: data-safety and migration audit.
- Agent B: queue architecture and compatibility plan.
- Agent C: additive schema and schema tests.
- Agent D: independent verification of no data-loss paths and queue recovery tests.
