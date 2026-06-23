const defaultMaxText = 180;
const sensitiveKeys = new Set(["authorization", "token", "apiKey", "api_key", "password"]);

export function createOperationLogger(scope, options = {}) {
  const sink = options.sink || console;
  const enabled = options.enabled ?? process.env.ANTON_VERBOSE_LOGS !== "0";

  function log(event, details = {}) {
    if (!enabled) return;
    const payload = {
      ts: new Date().toISOString(),
      scope,
      event,
      ...sanitizeLogValue(details)
    };
    sink.log(`[${scope}:${event}] ${JSON.stringify(payload)}`);
  }

  return {
    log,
    child(extra = {}) {
      return {
        log(event, details = {}) {
          log(event, { ...extra, ...details });
        },
        time(event, details = {}) {
          return createTimer(log, event, { ...extra, ...details });
        }
      };
    },
    time(event, details = {}) {
      return createTimer(log, event, details);
    }
  };
}

export function sanitizeLogValue(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return summarizeText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth > 3) return `[array:${value.length}]`;
    return value.slice(0, 12).map((item) => sanitizeLogValue(item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth > 3) return "[object]";
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeys.has(key) ? "[redacted]" : sanitizeLogValue(item, depth + 1)
    ]));
  }
  return String(value);
}

export function summarizeJobForLog(job = {}) {
  return {
    id: job.id || "",
    projectId: job.projectId || "",
    productId: job.productId || "",
    characterId: job.characterId || "",
    status: job.status || "",
    stage: job.stage || "",
    progress: Number(job.progress || 0),
    outputType: job.outputType || "",
    title: job.title || "",
    imageProvider: job.imageProvider || "",
    imageTaskId: job.imageTaskId || "",
    hasImageUrl: Boolean(job.imageUrl || job.imageData),
    hasFinalVideoUrl: Boolean(job.finalVideoUrl),
    diskStatus: job.diskStatus || "",
    failMsg: job.failMsg || ""
  };
}

export function summarizeServerJobContext(context = {}) {
  const project = context.project || {};
  return {
    projectId: project.id || "",
    projectName: project.name || "",
    productCount: Array.isArray(project.products) ? project.products.length : 0,
    characterCount: Array.isArray(project.characters) ? project.characters.length : 0,
    audioCount: Array.isArray(context.audioLibrary) ? context.audioLibrary.length : 0,
    selectedAudioId: context.selectedAudioId || "",
    selectedCharacterId: context.selectedCharacterId || "",
    hasYandexDiskFolder: Boolean(project.yandexDiskFolder)
  };
}

function createTimer(log, event, details) {
  const startedAt = Date.now();
  log(`${event}:start`, details);
  return {
    done(extra = {}) {
      log(`${event}:done`, { ...details, ...extra, durationMs: Date.now() - startedAt });
    },
    fail(error, extra = {}) {
      log(`${event}:fail`, {
        ...details,
        ...extra,
        durationMs: Date.now() - startedAt,
        error: error?.message || error || "unknown error"
      });
    }
  };
}

function summarizeText(value) {
  if (value.startsWith("data:")) return `[data-url:${value.slice(5, 32)} chars=${value.length}]`;
  if (value.length <= defaultMaxText) return value;
  return `${value.slice(0, defaultMaxText)}... [chars=${value.length}]`;
}
