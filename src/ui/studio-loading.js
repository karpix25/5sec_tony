export function renderStudioLoading(root, status = {}) {
  if (!root) return;
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card loading">
        <div class="auth-brand">
          <span class="brand-mark">A5</span>
          <div><strong>ANTON 5 SEC</strong></div>
        </div>
        <h1>Загружаем студию</h1>
        <p>${escapeLoadingText(status.message || "Синхронизируем данные проекта.")}</p>
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
