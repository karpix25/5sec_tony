import { statusLabels } from "../domain/entities.js";
import { escapeHtml } from "./infographic.js";

const queueStageLabels = {
  brief: "Готовим идею",
  prompt: "Собираем хук",
  image: "Генерируем картинку",
  approval: "Проверка",
  assembly: "Собираем видео",
  export: "Готово"
};

export function renderQueuePanel(state, context) {
  const projectJobs = state.jobs.filter((job) => job.projectId === context.project.id);
  return `
    <section class="embedded-panel queue-panel">
      <div class="panel-head">
        <div><span class="eyebrow">Очередь генерации</span><h2>Статус задач</h2></div>
      </div>
      <div class="queue-list">
        ${projectJobs.map(renderQueueJob).join("") || "<p class='empty'>Пока нет задач. Запустите генерацию из вкладки «Генерация».</p>"}
      </div>
    </section>
  `;
}

function renderQueueJob(job) {
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
          <span>${escapeHtml(job.topic || job.title)}</span>
          <span>${escapeHtml(job.music || "аудио проекта")}</span>
          <span>${Number(job.inputUrls?.length || 0)} реф.</span>
        </div>
        ${renderQueueSteps(job.stage)}
        <div class="queue-actions">
          ${renderQueueAction(job, ready, failed)}
          ${renderDiskStatus(job)}
        </div>
      </div>
      ${renderQueuePreview(job, ready, failed, preview)}
    </article>
  `;
}

function renderDiskStatus(job) {
  if (!job.diskStatus) return "";
  const label = {
    uploading: "Яндекс.Диск: сохраняем",
    done: `Яндекс.Диск: ${job.diskPath || "сохранено"}`,
    failed: `Яндекс.Диск: ${job.diskMessage || "ошибка сохранения"}`
  }[job.diskStatus] || job.diskMessage || "";
  return label ? `<span>${escapeHtml(label)}</span>` : "";
}

function renderQueueAction(job, ready, failed) {
  if (job.finalVideoUrl) return `<span>Финальный mp4 на 5 секунд${job.finalVideoHasAudio ? " с аудио" : ""} готов</span>`;
  if (failed) return `<span>${escapeHtml(humanizeQueueMessage(job.failMsg || "Генерация завершилась ошибкой"))}</span>`;
  if (isFinalVideoJob(job) && (job.imageData || job.imageUrl)) return "<span>Картинка готова, собираем финальное видео</span>";
  if (ready) return "<span>Кликните по превью, чтобы открыть полностью</span>";
  return `<span>Результат появится автоматически</span>`;
}

function renderQueuePreview(job, ready, failed, preview) {
  if (job.finalVideoUrl) {
    return `
      <div class="queue-preview">
        <video src="${escapeHtml(job.finalVideoUrl)}" controls muted loop playsinline></video>
      </div>
    `;
  }
  if (isFinalVideoJob(job)) {
    return `
      <button class="queue-preview" type="button" disabled>
        ${renderQueueLoader(failed, job.failMsg, job.imageData || job.imageUrl ? "video" : "image")}
      </button>
    `;
  }
  return `
    <button class="queue-preview" data-preview-asset="${escapeHtml(preview)}" data-preview-title="${escapeHtml(job.title)}" type="button" ${ready ? "" : "disabled"}>
      ${ready ? `<img src="${escapeHtml(preview)}" alt="">` : renderQueueLoader(failed, job.failMsg, "image")}
    </button>
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

function renderQueueLoader(failed, failMsg, pendingType = "image") {
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
      <small>${pendingType === "video" ? "Картинка готова, сейчас накладываем аватара и аудио." : "Результат появится здесь автоматически после этапа генерации."}</small>
    </div>
  `;
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
  return String(message)
    .replaceAll("Kie.ai", "Сервис генерации")
    .replaceAll("GPT Image 2", "Основной способ")
    .replaceAll("Nano Banana 2", "резервный способ")
    .replaceAll("taskId", "номер задачи");
}
