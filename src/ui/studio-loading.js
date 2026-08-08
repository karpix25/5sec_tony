export function renderStudioLoading(root, status = {}) {
  if (!root) return;
  const failed = status.status === "error";
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card loading">
        <div class="auth-brand">
          <span class="brand-mark">A5</span>
          <div><strong>ANTON 5 SEC</strong></div>
        </div>
        <h1>${failed ? "Не удалось загрузить студию" : "Загружаем студию"}</h1>
        <p>${failed ? "Сохранённые проекты не потеряны. Повторите загрузку." : escapeLoadingText(status.message || "Синхронизируем данные проекта.")}</p>
        ${failed ? '<button class="primary-btn" data-retry-hydration type="button">Повторить загрузку</button>' : ""}
      </section>
    </main>
  `;
}

function escapeLoadingText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
