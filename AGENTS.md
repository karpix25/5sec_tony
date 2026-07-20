# Lessons
- Production DB diagnostics must select compact fields only; never dump large JSON payloads such as job extra unless explicitly needed.
- Yandex export paths must respect the UI-selected folder as the brand root and only append avatar/product segments.
- Scheduler logs must never serialize the full application state; log compact counters and ids only.
- Legacy brief rescue must cover old queued/stage=brief/progress-low jobs even when explicit placeholder flags are missing.
