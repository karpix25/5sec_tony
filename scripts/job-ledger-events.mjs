import { randomUUID } from "node:crypto";

const appStateKey = process.env.APP_STATE_KEY || "default";

export async function appendJobQueueEvent(query, event, deps = {}) {
  const eventId = event.eventId || deps.randomId?.() || randomUUID();
  await query(
    `insert into studio_job_queue_events (
       app_state_key, event_id, job_id, queue_name, event_type, event_status,
       event_actor, event_message, event_payload
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      event.appStateKey || appStateKey,
      eventId,
      event.jobId,
      event.queueName || "default",
      event.type,
      event.status || "",
      event.actor || "",
      event.message || "",
      JSON.stringify(event.payload || {})
    ]
  );
  return eventId;
}
