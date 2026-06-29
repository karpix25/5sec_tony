export const JOB_QUEUE_SCHEMA_DDL = `
  alter table studio_jobs add column if not exists queue_name text not null default 'default';
  alter table studio_jobs add column if not exists queue_status text not null default '';
  alter table studio_jobs add column if not exists queue_priority integer not null default 0;
  alter table studio_jobs add column if not exists queue_attempts integer not null default 0;
  alter table studio_jobs add column if not exists queue_max_attempts integer not null default 1;
  alter table studio_jobs add column if not exists queue_scheduled_at timestamptz;
  alter table studio_jobs add column if not exists queue_locked_at timestamptz;
  alter table studio_jobs add column if not exists queue_lock_owner text not null default '';
  alter table studio_jobs add column if not exists queue_last_error text not null default '';
  alter table studio_jobs add column if not exists queue_idempotency_key text not null default '';
  alter table studio_jobs add column if not exists queue_provider_task_id text not null default '';
  alter table studio_jobs add column if not exists queue_metadata jsonb not null default '{}'::jsonb;

  create table if not exists studio_job_queues (
    app_state_key text not null,
    queue_name text not null,
    queue_status text not null default 'active',
    queue_concurrency integer not null default 1,
    queue_paused boolean not null default false,
    queue_metadata jsonb not null default '{}'::jsonb,
    queue_created_at timestamptz not null default now(),
    queue_updated_at timestamptz not null default now(),
    primary key (app_state_key, queue_name)
  );

  create table if not exists studio_job_queue_events (
    app_state_key text not null,
    event_id text not null,
    job_id text not null,
    queue_name text not null default 'default',
    event_type text not null,
    event_status text not null default '',
    event_actor text not null default '',
    event_message text not null default '',
    event_payload jsonb not null default '{}'::jsonb,
    event_created_at timestamptz not null default now(),
    primary key (app_state_key, event_id)
  );

  create index if not exists idx_studio_jobs_queue_status_priority
    on studio_jobs(app_state_key, queue_name, queue_status, queue_priority, queue_scheduled_at);
  create index if not exists idx_studio_jobs_queue_lock
    on studio_jobs(app_state_key, queue_status, queue_locked_at);
  create unique index if not exists idx_studio_jobs_queue_idempotency
    on studio_jobs(app_state_key, queue_idempotency_key)
    where queue_idempotency_key <> '';
  create index if not exists idx_studio_job_queues_status
    on studio_job_queues(app_state_key, queue_status, queue_paused);
  create index if not exists idx_studio_job_queue_events_job
    on studio_job_queue_events(app_state_key, job_id, event_created_at);
  create index if not exists idx_studio_job_queue_events_type
    on studio_job_queue_events(app_state_key, queue_name, event_type, event_created_at);
`;

export async function ensureJobQueueSchema(query) {
  await query(JOB_QUEUE_SCHEMA_DDL);
}
