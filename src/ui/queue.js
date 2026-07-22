import { statusLabels } from "../domain/entities.js";
import { isNoAvatarCharacterId } from "../domain/avatar-selection.js";
import { humanizeProviderErrorMessage } from "../domain/provider-error-message.js";
import { escapeHtml } from "./infographic.js";
import { renderPreviewTrigger } from "./preview-modal.js";
import { renderJobAiTrace } from "./job-ai-trace.js";

const queueStageLabels = {
  brief: "Готовим идею",
  prompt: "Собираем хук",
  image: "Генерируем картинку",
  approval: "Проверка",
  assembly: "Собираем видео",
  export: "Готово"
};

export function renderQueuePanel(state, context) {
  return `
    <section class="embedded-panel queue-panel">
      <div class="panel-head">
        <div><span class="eyebrow">Очередь генерации</span><h2>Статус задач</h2></div>
      </div>
      <div class="queue-filter-wrap">${renderQueueProductFilter(state, context)}</div>
      <div class="queue-list">${renderQueueList(state, context)}</div>
    </section>
  `;
}

export function updateQueuePanel(root, state, context, store) {
  const panel = root.querySelector(".queue-panel");
  if (!panel) return false;
  const filter = panel.querySelector(".queue-filter-wrap");
  const list = panel.querySelector(".queue-list");
  if (!list) return false;
  if (filter) filter.innerHTML = renderQueueProductFilter(state, context);
  list.innerHTML = renderQueueList(state, context);
  bindQueuePanelEvents(root, store);
  return true;
}

function renderQueueProductFilter(state, context) {
  const filter = getQueueProductFilter(state);
  const projectJobs = getProjectQueueJobs(state, context);
  const currentProductJobs = projectJobs.filter((job) => job.productId === context.product?.id);
  return `
    <div class="queue-filter" role="group" aria-label="Фильтр очереди по продукту">
      ${renderQueueFilterButton("current", `Текущий продукт (${currentProductJobs.length})`, filter)}
      ${renderQueueFilterButton("all", `Все продукты проекта (${projectJobs.length})`, filter)}
    </div>
  `;
}

function renderQueueFilterButton(value, label, selected) {
  return `<button class="queue-filter-btn ${value === selected ? "active" : ""}" data-queue-product-filter="${value}" type="button">${escapeHtml(label)}</button>`;
}

function renderQueueList(state, context) {
  const projectJobs = getVisibleQueueJobs(state, context);
  const productNames = new Map((state.products || []).map((product) => [product.id, product.name]));
  return projectJobs.map((job) => renderQueueJob(job, job.productName || productNames.get(job.productId))).join("")
    || `<p class='empty'>${escapeHtml(getEmptyQueueMessage(state, context))}</p>`;
}

export function bindQueuePanelEvents(root, store) {
  root.querySelectorAll("[data-queue-product-filter]:not([data-queue-bound])").forEach((button) => {
    button.dataset.queueBound = "true";
    button.addEventListener("click", () => store.selectQueueProductFilter?.(button.dataset.queueProductFilter));
  });
  root.querySelectorAll("[data-delete-job]:not([data-queue-bound])").forEach((button) => {
    button.dataset.queueBound = "true";
    button.addEventListener("click", () => store.deleteJob(button.dataset.deleteJob));
  });
}

function getVisibleQueueJobs(state, context) {
  const projectJobs = getProjectQueueJobs(state, context);
  if (!context.product?.id) return projectJobs;
  if (getQueueProductFilter(state) === "all") return projectJobs;
  return projectJobs.filter((job) => job.productId === context.product?.id);
}

function getProjectQueueJobs(state, context) {
  return (state.jobs || []).filter((job) => job.projectId === context.project.id);
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
  const ready = isQueueJobReady(job);
  const preview = job.imageData || job.imageUrl || "";
  const failed = job.status === "failed";
  return `
    <article class="queue-job ${ready ? "ready" : "loading"} ${failed ? "failed" : ""}">
      <div class="queue-job-main">
        <div class="queue-job-head">
          <div>
            <span class="queue-status">${escapeHtml(statusLabels[job.status] || "В работе")}</span>
            <h3>${escapeHtml(job.title)}</h3>
          </div>
          <button class="danger-icon" data-delete-job="${job.id}" type="button" aria-label="Удалить задачу">×</button>
        </div>
        <div class="queue-progress">
          <i style="width:${Math.max(6, Number(job.progress || 0))}%"></i>
        </div>
        <div class="queue-meta">
          <span>${escapeHtml(queueStageLabels[job.stage] || job.stage)}</span>
          ${renderJobCreatedAt(job)}
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

function renderJobCreatedAt(job) {
  const createdAt = formatJobCreatedAt(job.createdAt);
  return createdAt ? `<span>Создано: ${escapeHtml(createdAt)}</span>` : "";
}

function formatJobCreatedAt(value) {
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

function renderQueueAction(job, ready, failed) {
  if (job.finalVideoUrl) return `<span>Финальный mp4 на 5 секунд${job.finalVideoHasAudio ? " с аудио" : ""} готов</span>`;
  if (failed) return `<span>${escapeHtml(humanizeQueueMessage(job.failMsg || "Генерация завершилась ошибкой"))}</span>`;
  if (isFinalVideoJob(job) && (job.imageData || job.imageUrl)) return "<span>Картинка готова, собираем финальное видео</span>";
  if (ready) return "<span>Кликните по превью, чтобы открыть полностью</span>";
  return `<span>Результат появится автоматически</span>`;
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
        ${renderQueueLoader(failed, job.failMsg, job.imageData || job.imageUrl ? "video" : "image", job)}
      </button>
    `;
  }
  return `
    <button class="queue-preview" data-preview-media="${escapeHtml(preview)}" data-preview-type="image" data-preview-title="${escapeHtml(job.title)}" type="button" ${ready ? "" : "disabled"}>
      ${ready ? `<img src="${escapeHtml(preview)}" alt="">` : renderQueueLoader(failed, job.failMsg, "image")}
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
