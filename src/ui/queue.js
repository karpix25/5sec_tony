import { statusLabels } from "../domain/entities.js";
import { isNoAvatarCharacterId } from "../domain/avatar-selection.js";
import { humanizeProviderErrorMessage } from "../domain/provider-error-message.js";
import { escapeHtml } from "./infographic.js";
import { renderPreviewTrigger } from "./preview-modal.js";
import { renderJobAiTrace } from "./job-ai-trace.js";
import { renderQueuePagination, renderQueuePaginationError } from "./queue-pagination.js";
import { getVisibleLocalQueueJobs, mergeQueueJobs } from "./queue-local-jobs.js";

const queueStageLabels = {
  brief: "Готовим идею",
  prompt: "Собираем хук",
  image: "Генерируем картинку",
  approval: "Проверка",
  assembly: "Собираем видео",
  export: "Готово"
};

export function renderQueuePanel(state, context, options = {}) {
  const pagination = options.pagination;
  pagination?.ensure(context, getQueueProductFilter(state));
  return `
    <section class="embedded-panel queue-panel">
      ${renderQueuePanelHead(state, context)}
      <div class="queue-filter-wrap">${renderQueueProductFilter(state, context, pagination?.getState())}</div>
      <div class="queue-list">${renderQueueList(state, context, pagination?.getState())}</div>
    </section>
  `;
}

export function updateQueuePanel(root, state, context, store, options = {}) {
  const panel = root.querySelector(".queue-panel");
  if (!panel) return false;
  const filter = panel.querySelector(".queue-filter-wrap");
  const list = panel.querySelector(".queue-list");
  if (!list) return false;
  const head = panel.querySelector(".queue-panel-head");
  if (head) head.outerHTML = renderQueuePanelHead(state, context);
  const pagination = options.pagination;
  pagination?.ensure(context, getQueueProductFilter(state));
  if (filter) filter.innerHTML = renderQueueProductFilter(state, context, pagination?.getState());
  list.innerHTML = renderQueueList(state, context, pagination?.getState());
  bindQueuePanelEvents(root, store, { ...options, context });
  return true;
}

function renderQueueProductFilter(state, context, paginationState) {
  const filter = getQueueProductFilter(state);
  const projectJobs = getProjectQueueJobs(state, context);
  const currentProductJobs = projectJobs.filter((job) => job.productId === context.product?.id);
  const currentCount = paginationState?.key && paginationState.filter === "current"
    ? paginationState.total
    : paginationState?.key ? paginationState.currentTotal : currentProductJobs.length;
  const projectCount = paginationState?.key ? paginationState.allTotal : projectJobs.length;
  return `
    <div class="queue-filter" role="group" aria-label="Фильтр очереди по продукту">
      ${renderQueueFilterButton("current", `Текущий продукт (${currentCount})`, filter)}
      ${renderQueueFilterButton("all", `Все продукты проекта (${projectCount})`, filter)}
    </div>
  `;
}

function renderQueuePanelHead(state, context) {
  const failedCount = getProjectQueueJobs(state, context).filter(isQueueJobFailed).length;
  return `
    <div class="panel-head queue-panel-head">
      <div><span class="eyebrow">Очередь генерации</span><h2>Статус задач</h2></div>
      ${failedCount ? `<button class="secondary-btn" data-retry-project="${escapeHtml(context.project.id)}" type="button">Повторить ошибки (${failedCount})</button>` : ""}
    </div>
  `;
}

function renderQueueFilterButton(value, label, selected) {
  return `<button class="queue-filter-btn ${value === selected ? "active" : ""}" data-queue-product-filter="${value}" type="button">${escapeHtml(label)}</button>`;
}

function renderQueueList(state, context, paginationState) {
  if (paginationState?.key) {
    const localJobs = getVisibleLocalQueueJobs(state, context, paginationState);
    if (paginationState.error) return `${renderQueueJobs(localJobs, state)}${renderQueuePaginationError(paginationState.error)}`;
    if (paginationState.loading && !paginationState.jobs) return `${renderQueueJobs(localJobs, state)}<p class='empty'>Загрузка истории генераций…</p>`;
    const jobs = mergeQueueJobs(paginationState.jobs || [], localJobs);
    return renderQueueJobs(jobs, state) + renderQueuePagination(paginationState) || `<p class='empty'>${escapeHtml(getEmptyQueueMessage(state, context))}</p>`;
  }
  const projectJobs = getVisibleQueueJobs(state, context);
  return renderQueueJobs(projectJobs, state) || `<p class='empty'>${escapeHtml(getEmptyQueueMessage(state, context))}</p>`;
}

function renderQueueJobs(jobs, state) {
  const productNames = new Map((state.products || []).map((product) => [product.id, product.name]));
  return jobs.map((job) => renderQueueJob(job, job.productName || productNames.get(job.productId))).join("");
}

export function bindQueuePanelEvents(root, store, options = {}) {
  root.querySelectorAll("[data-queue-product-filter]:not([data-queue-bound])").forEach((button) => {
    button.dataset.queueBound = "true";
    button.addEventListener("click", () => store.selectQueueProductFilter?.(button.dataset.queueProductFilter));
  });
  root.querySelectorAll("[data-delete-job]:not([data-queue-bound])").forEach((button) => {
    button.dataset.queueBound = "true";
    button.addEventListener("click", () => store.deleteJob(button.dataset.deleteJob));
  });
  root.querySelectorAll("[data-retry-project]:not([data-queue-bound]), [data-retry-job]:not([data-queue-bound])").forEach((button) => {
    button.dataset.queueBound = "true";
    button.addEventListener("click", () => retryFailedJobs(button, store));
  });
  root.querySelectorAll("[data-queue-page]:not([data-queue-bound])").forEach((button) => {
    button.dataset.queueBound = "true";
    button.addEventListener("click", () => options.pagination?.goToPage(
      Number(button.dataset.queuePage),
      options.context,
      getQueueProductFilter(store.getState?.() || {})
    ));
  });
  root.querySelectorAll("[data-queue-page-retry]:not([data-queue-bound])").forEach((button) => {
    button.dataset.queueBound = "true";
    button.addEventListener("click", () => options.pagination?.refresh(
      options.context,
      getQueueProductFilter(store.getState?.() || {})
    ));
  });
}

function getVisibleQueueJobs(state, context) {
  const projectJobs = getSortedQueueJobs(getProjectQueueJobs(state, context));
  if (!context.product?.id) return projectJobs;
  if (getQueueProductFilter(state) === "all") return projectJobs;
  return projectJobs.filter((job) => job.productId === context.product?.id);
}

function getProjectQueueJobs(state, context) {
  return (state.jobs || []).filter((job) => job.projectId === context.project.id);
}

function getSortedQueueJobs(jobs = []) {
  return [...jobs].sort((left, right) => getQueueSortTime(right) - getQueueSortTime(left));
}

function getQueueSortTime(job) {
  const value = firstValidDate([
    job?.createdAt,
    job?.serverJobAcceptedAt,
    job?.queueScheduledAt,
    job?.briefStartedAt,
    job?.queueLockedAt,
    job?.updatedAt
  ]);
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function getQueueProductFilter(state) {
  return state.queueProductFilter === "all" ? "all" : "current";
}

function getEmptyQueueMessage(state, context) {
  if (getQueueProductFilter(state) === "all") {
    return "Пока нет задач. Запустите генерацию из вкладки «Генерация».";
  }
  const productName = context.product?.name || "выбранного продукта";
  return `Для продукта «${productName}» пока нет задач. Переключите фильтр на все продукты проекта или запустите генерацию.`;
}

function renderQueueJob(job, productName = "") {
  const failed = isQueueJobFailed(job);
  const ready = !failed && isQueueJobReady(job);
  const preview = job.imageData || job.imageUrl || "";
  return `
    <article class="queue-job ${ready ? "ready" : "loading"} ${failed ? "failed" : ""}">
      <div class="queue-job-main">
        <div class="queue-job-head">
          <div>
            <span class="queue-status">${escapeHtml(getQueueStatusLabel(job))}</span>
            <h3>${escapeHtml(job.title)}</h3>
          </div>
          <button class="danger-icon" data-delete-job="${job.id}" type="button" aria-label="Удалить задачу">×</button>
        </div>
        <div class="queue-progress">
          <i style="width:${Math.max(6, Number(job.progress || 0))}%"></i>
        </div>
        <div class="queue-meta">
          <span>${escapeHtml(queueStageLabels[job.stage] || job.stage)}</span>
          ${renderGenerationSourceTag(job)}
          ${renderJobTiming(job)}
          <span>Продукт: ${escapeHtml(productName || "не указан")}</span>
          ${renderProductVisualTag(job)}
          <span>${escapeHtml(job.topic || job.title)}</span>
          <span>${escapeHtml(job.music || "аудио проекта")}</span>
          <span>${Number(job.inputUrls?.length || 0)} реф.</span>
        </div>
        ${renderQueueSteps(job.stage)}
        ${renderJobAiTrace(job)}
        <div class="queue-actions">
          ${renderQueueAction(job, ready, failed)}
          ${renderDiskStatus(job)}
        </div>
      </div>
      ${renderQueuePreviewColumn(job, ready, failed, preview)}
    </article>
  `;
}

function renderJobTiming(job) {
  const startedAt = getJobStartedAt(job);
  const finishedAt = getJobFinishedAt(job);
  const createdAt = formatJobDate(startedAt || job.createdAt);
  const duration = formatJobDuration(startedAt, finishedAt || (isQueueJobTerminal(job) ? "" : new Date().toISOString()));
  return [
    createdAt ? `<span>Создано: ${escapeHtml(createdAt)}</span>` : "",
    duration ? `<span>${escapeHtml(isQueueJobTerminal(job) ? "Время генерации" : "В работе")}: ${escapeHtml(duration)}</span>` : ""
  ].filter(Boolean).join("");
}

function getJobStartedAt(job) {
  return firstValidDate([
    job.serverJobAcceptedAt,
    job.queueScheduledAt,
    job.createdAt,
    job.queueLockedAt
  ]);
}

function getJobFinishedAt(job) {
  return firstValidDate([
    job.serverJobCompletedAt,
    job.serverJobFailedAt,
    job.completedAt,
    job.finishedAt,
    job.updatedAt
  ]);
}

function firstValidDate(values = []) {
  return values.find((value) => Number.isFinite(new Date(value || "").getTime())) || "";
}

function isQueueJobTerminal(job) {
  return ["done", "review", "failed"].includes(job?.status) || ["completed", "failed"].includes(job?.queueStatus);
}

function isQueueJobFailed(job) {
  return job?.status === "failed" || job?.queueStatus === "failed";
}

function isQueueJobCompleted(job) {
  return job?.status === "done" || job?.queueStatus === "completed";
}

function getQueueStatusLabel(job) {
  if (isQueueJobFailed(job)) return statusLabels.failed;
  if (isQueueJobCompleted(job)) return statusLabels.done;
  if (job?.queueStatus === "retrying") return "Повторная попытка";
  if (job?.queueStatus === "queued") return statusLabels.queued;
  return statusLabels[job?.status] || "В работе";
}

function getQueueFailureMessage(job) {
  return job?.queueLastError || job?.failMsg || "Генерация завершилась ошибкой";
}

function formatJobDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatJobDuration(startValue, endValue) {
  const start = new Date(startValue || "").getTime();
  const end = new Date(endValue || "").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";
  const totalSeconds = Math.max(1, Math.round((end - start) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return `${hours} ч ${restMinutes} мин`;
  }
  if (minutes > 0) return `${minutes} мин ${seconds} сек`;
  return `${seconds} сек`;
}

function renderDiskStatus(job) {
  if (!job.diskStatus) return "";
  const diskUrl = getYandexDiskUrl(job);
  const label = {
    uploading: "Яндекс.Диск: сохраняем",
    done: `Яндекс.Диск: ${diskUrl ? "ссылка готова" : "сохранено, ссылка готовится"}`,
    failed: `Яндекс.Диск: ${job.diskMessage || "ошибка сохранения"}`
  }[job.diskStatus] || job.diskMessage || "";
  return label ? `<span>${escapeHtml(label)}</span>` : "";
}

function renderProductVisualTag(job) {
  const hasProductInput = (job.inputRefs || []).some((item) => item?.role === "product");
  if (job.productVisualMode === "exact-product" || hasProductInput) {
    return "<span>Продукт в кадре</span>";
  }
  if (job.productVisualMode === "no-package") {
    return "<span>Без продукта в кадре</span>";
  }
  return "<span>Продукт: не выводился отдельно</span>";
}

function renderGenerationSourceTag(job) {
  const source = getGenerationSource(job);
  if (source === "automation") return "<span>Авто</span>";
  if (source === "manual") return "<span>Ручная</span>";
  return "<span>Источник: старый запуск</span>";
}

function getGenerationSource(job) {
  if (job?.generationSource === "automation" || job?.source === "automation") return "automation";
  if (job?.generationSource === "manual" || job?.source === "manual") return "manual";
  if (job?.serverBatchSource === "automation") return "automation";
  if (job?.selectionSnapshot && !job.selectionSnapshot.productId) return "automation";
  if (job?.selectionSnapshot?.productId) return "manual";
  return "";
}

function renderQueueAction(job, ready, failed) {
  if (failed) return `<span>${escapeHtml(humanizeQueueMessage(getQueueFailureMessage(job)))}</span><button class="ghost-btn" data-retry-job="${escapeHtml(job.id)}" data-retry-project="${escapeHtml(job.projectId || "")}" type="button">Повторить генерацию</button>`;
  if (job.finalVideoUrl) return `<span>Финальный mp4 на 5 секунд${job.finalVideoHasAudio ? " с аудио" : ""} готов</span>`;
  if (isQueueJobCompleted(job) && !ready) return "<span>Генерация завершена, результат не найден</span>";
  if (isFinalVideoJob(job) && (job.imageData || job.imageUrl)) return "<span>Картинка готова, собираем финальное видео</span>";
  if (ready) return "<span>Кликните по превью, чтобы открыть полностью</span>";
  return `<span>Результат появится автоматически</span>`;
}

async function retryFailedJobs(button, store) {
  if (button.disabled) return;
  const projectId = button.dataset.retryProject || store.getState?.().selectedProjectId || "";
  const jobId = button.dataset.retryJob || "";
  const job = jobId ? (store.getState?.().jobs || []).find((item) => item.id === jobId) : null;
  const body = {
    projectId,
    ...(job?.serverBatchId ? { batchId: job.serverBatchId } : {}),
    ...(jobId && !job?.serverBatchId ? { jobIds: [jobId] } : {})
  };
  button.disabled = true;
  button.textContent = "Ставим в очередь...";
  try {
    const response = await fetch("/api/jobs/retry-failed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Не удалось повторить генерацию");
    if (payload.jobs?.length) store.mergeServerJobs?.(payload.jobs);
  } catch (error) {
    console.warn("[queue] failed job retry failed", error);
    button.disabled = false;
    button.textContent = jobId ? "Повторить генерацию" : "Повторить ошибки";
  }
}

function renderQueuePreviewColumn(job, ready, failed, preview) {
  return `
    <div class="queue-preview-column">
      ${renderQueuePreview(job, ready, failed, preview)}
      ${renderYandexDiskVideoLink(job)}
    </div>
  `;
}

function renderQueuePreview(job, ready, failed, preview) {
  if (failed) {
    return `
      <button class="queue-preview" type="button" disabled>
        ${renderQueueLoader(true, getQueueFailureMessage(job), "image", job)}
      </button>
    `;
  }
  if (job.finalVideoUrl) {
    return renderPreviewTrigger({
      src: job.finalVideoUrl,
      title: job.title,
      type: "video",
      className: "queue-preview",
      label: "Открыть финальное видео крупно",
      content: renderFinalVideoPoster(job)
    });
  }
  if (isFinalVideoJob(job)) {
    return `
      <button class="queue-preview" type="button" disabled>
        ${renderQueueLoader(false, getQueueFailureMessage(job), job.imageData || job.imageUrl ? "video" : "image", job)}
      </button>
    `;
  }
  return `
    <button class="queue-preview" data-preview-media="${escapeHtml(preview)}" data-preview-type="image" data-preview-title="${escapeHtml(job.title)}" type="button" ${ready ? "" : "disabled"}>
      ${ready ? `<img src="${escapeHtml(preview)}" alt="">` : renderQueueLoader(false, getQueueFailureMessage(job), "image", job)}
    </button>
  `;
}

function renderYandexDiskVideoLink(job) {
  if (job.diskStatus !== "done") return "";
  const diskUrl = getYandexDiskUrl(job);
  if (!diskUrl) return "";
  const label = "Ссылка на ролик на Яндекс.Диске";
  return `
    <a class="queue-disk-link" href="${escapeHtml(diskUrl)}" target="_blank" rel="noreferrer">
      <span>${label}</span>
      <strong>${escapeHtml(diskUrl)}</strong>
    </a>
  `;
}

function getYandexDiskUrl(job) {
  const candidates = [job.diskUrl, job.diskPublicUrl, job.yandexDiskUrl, job.diskPath];
  return candidates.find((value) => /^https?:\/\//i.test(String(value || ""))) || "";
}

function renderFinalVideoPoster(job) {
  const poster = job.imageData || job.imageUrl || "";
  if (!poster) return "";
  return `
    <span class="queue-video-poster">
      <img src="${escapeHtml(poster)}" alt="">
      <i aria-hidden="true"></i>
    </span>
  `;
}

function renderQueueSteps(activeStage) {
  const stages = Object.keys(queueStageLabels);
  const activeIndex = Math.max(0, stages.indexOf(activeStage));
  return `
    <div class="queue-steps">
      ${stages.map((stage, index) => `<span class="${getQueueStepClass(index, activeIndex)}">${escapeHtml(queueStageLabels[stage])}</span>`).join("")}
    </div>
  `;
}

function getQueueStepClass(index, activeIndex) {
  if (index === activeIndex) return "active";
  if (index < activeIndex) return "done";
  return "";
}

function renderQueueLoader(failed, failMsg, pendingType = "image", job = null) {
  if (failed) {
    return `
      <div class="queue-loader error">
        <strong>Ошибка генерации</strong>
        <small>${escapeHtml(humanizeQueueMessage(failMsg || "Не удалось получить картинку"))}</small>
      </div>
    `;
  }
  if (isQueueJobCompleted(job)) {
    return `
      <div class="queue-loader completed">
        <strong>Готово</strong>
        <small>Очередь завершила обработку, но результат не найден.</small>
      </div>
    `;
  }
  return `
    <div class="queue-loader">
      <span></span><span></span><span></span>
      <strong>${pendingType === "video" ? "Собираем видео" : "Ждем картинку"}</strong>
      <small>${getQueuePendingMessage(pendingType, job)}</small>
    </div>
  `;
}
function getQueuePendingMessage(pendingType, job) {
  if (pendingType !== "video") {
    if (job?.queueStatus === "retrying") return "Предыдущая попытка завершилась ошибкой, запускаем повторно.";
    if (job?.queueStatus === "queued") return "Задача стоит в очереди и будет запущена автоматически.";
    return "Результат появится здесь автоматически после этапа генерации.";
  }
  return job?.renderedWithoutAvatar || isNoAvatarCharacterId(job?.characterId)
    ? "Картинка готова, сейчас собираем mp4 из картинки и аудио."
    : "Картинка готова, сейчас накладываем аватара и аудио.";
}
function isQueueJobReady(job) {
  if (isFinalVideoJob(job)) {
    return Boolean(job.finalVideoUrl) && ["review", "done"].includes(job.status);
  }
  return Boolean(job.imageData || job.imageUrl) && ["review", "done"].includes(job.status);
}

function isFinalVideoJob(job) {
  return job?.outputType !== "image" && job?.requiresFinalVideo !== false;
}

function humanizeQueueMessage(message = "") {
  return humanizeProviderErrorMessage(message);
}
