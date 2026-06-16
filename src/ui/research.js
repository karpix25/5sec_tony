import { defaultResearchAccounts, getStoredResearch, storeResearch } from "../domain/reels-research.js";
import { analyzeReelsResearch } from "../services/reels-research.js";
import { escapeHtml } from "./infographic.js";
import { renderPreviewTrigger } from "./preview-modal.js";

export function renderResearchPanel() {
  const result = getStoredResearch();
  return `
    <section class="embedded-panel research-panel">
      <div class="panel-head">
        <div><span class="eyebrow">Референсы</span><h2>Анализ конкурентов</h2></div>
        <button id="run-reels-research" class="primary-btn" type="button">Изучить видео</button>
      </div>
      <div class="research-controls">
        <label class="stacked-field">
          <span>Аккаунты Instagram</span>
          <textarea id="research-accounts" class="textarea editor-textarea">${escapeHtml(defaultResearchAccounts.join("\n"))}</textarea>
        </label>
        <div class="research-status" id="reels-research-status">
          Система найдет свежие видео, прочитает первые кадры и выделит темы, хуки и приемы.
        </div>
      </div>
      <div id="reels-research-output">
        ${result ? renderResearchResult(result) : renderEmptyState()}
      </div>
    </section>
  `;
}

export function bindResearchEvents(root) {
  root.querySelector("#run-reels-research")?.addEventListener("click", () => runResearch(root));
}

async function runResearch(root) {
  const status = root.querySelector("#reels-research-status");
  const output = root.querySelector("#reels-research-output");
  const accounts = root.querySelector("#research-accounts")?.value || "";
  try {
    status.textContent = "Собираем видео и анализируем темы, хуки и первые кадры. Это может занять несколько минут.";
    output.innerHTML = renderLoading();
    const result = await analyzeReelsResearch({ accounts, limit: 10 });
    storeResearch(result);
    status.textContent = `Готово: изучено ${result.videos.length} видео.`;
    output.innerHTML = renderResearchResult(result);
  } catch (error) {
    status.textContent = error.message || "Не удалось выполнить анализ.";
    output.innerHTML = renderError(error.message || "Ошибка анализа Reels");
  }
}

function renderResearchResult(result) {
  return `
    <div class="research-summary">
      ${summaryCard("Паттерны хуков", result.summary.hookPatterns)}
      ${summaryCard("Сценарные схемы", result.summary.scenarioPatterns)}
      ${summaryCard("Визуальные приемы", result.summary.visualPatterns)}
      ${summaryCard("Правила для генератора", result.summary.generatorRules)}
    </div>
    <div class="research-hooks">
      <span class="eyebrow">Готовые формулы</span>
      <div>${result.summary.reusableHooks.map((hook) => `<b>${escapeHtml(hook)}</b>`).join("")}</div>
    </div>
    ${renderResearchErrors(result.errors || [])}
    <div class="research-grid">
      ${result.videos.map(renderVideoInsight).join("")}
    </div>
  `;
}

function renderResearchErrors(errors) {
  if (!errors.length) return "";
  return `
    <div class="research-error muted">
      <strong>Часть аккаунтов пропущена</strong>
      <span>${errors.map((item) => `@${item.account}: ${item.error}`).map(escapeHtml).join(" · ")}</span>
    </div>
  `;
}

function summaryCard(title, items) {
  return `
    <article class="research-card">
      <h3>${escapeHtml(title)}</h3>
      <ul>${items.slice(0, 8).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  `;
}

function renderVideoInsight(video) {
  return `
    <article class="research-video">
      ${video.frame ? renderPreviewTrigger({
        src: video.frame,
        title: video.hook || video.topic,
        className: "research-frame-preview"
      }) : `<div class="research-thumb">Reel</div>`}
      <div>
        <span>@${escapeHtml(video.account)}</span>
        <h3>${escapeHtml(video.hook || video.topic)}</h3>
        <p>${escapeHtml(video.topic)}</p>
        <small>${escapeHtml(video.scenarioPattern || video.reusableTemplate || video.visualPattern)}</small>
      </div>
    </article>
  `;
}

function renderLoading() {
  return `
    <div class="research-loading">
      <i></i><i></i><i></i>
      <span>Собираем референсы и читаем первые кадры...</span>
    </div>
  `;
}

function renderEmptyState() {
  return `<div class="empty research-empty">После анализа здесь появятся темы, хуки, визуальные приемы и сценарные паттерны.</div>`;
}

function renderError(message) {
  return `<div class="research-error"><strong>Ошибка анализа</strong><span>${escapeHtml(message)}</span></div>`;
}
