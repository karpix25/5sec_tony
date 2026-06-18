const modalSelector = "#product-fields-modal";
const formSelector = "#product-settings-form";
const modalTitleSelector = ".panel-head h2";
const syncFieldNames = ["description", "pains", "offer", "facts", "forbidden"];

export function syncProductDraftToFieldsModal(root) {
  const form = root?.querySelector?.(formSelector);
  const modal = root?.querySelector?.(modalSelector);
  if (!form || !modal) return;
  const draft = Object.fromEntries(new FormData(form).entries());

  syncFieldNames.forEach((name) => {
    const control = modal.querySelector?.(`[name="${name}"]`);
    if (!control || !Object.hasOwn(draft, name)) return;
    control.value = String(draft[name] || "");
  });

  const title = modal.querySelector?.(modalTitleSelector);
  if (title && Object.hasOwn(draft, "name")) {
    title.textContent = String(draft.name || "").trim() || title.textContent;
  }
}
