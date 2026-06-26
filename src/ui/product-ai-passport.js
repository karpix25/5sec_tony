import { escapeHtml } from "./infographic.js";

export function renderProductAiPassport(product = {}) {
  const passport = product.aiPassport || {};
  const facts = Array.isArray(passport.safeFacts) ? passport.safeFacts.slice(0, 4) : [];
  const forbidden = Array.isArray(passport.forbiddenClaims) ? passport.forbiddenClaims.slice(0, 3) : [];
  return `
    <section class="product-step ai-memory-panel">
      <div class="product-step-head"><b>AI</b><div><h3>Паспорт продукта</h3><p>${escapeHtml(passport.updatedAt ? "Сохранен в памяти продукта" : "Еще не рассчитан")}</p></div></div>
      <button class="secondary-btn" data-refresh-product-passport type="button">Обновить паспорт</button>
      <small id="product-passport-status">${escapeHtml(passport.category || "Паспорт появится здесь и будет использоваться в генерациях.")}</small>
      ${renderList("Safe facts", facts)}
      ${renderList("Нельзя обещать", forbidden)}
    </section>
  `;
}

function renderList(label, items) {
  if (!items.length) return "";
  return `<dl class="ai-memory-list"><dt>${escapeHtml(label)}</dt>${items.map((item) => `<dd>${escapeHtml(item)}</dd>`).join("")}</dl>`;
}
