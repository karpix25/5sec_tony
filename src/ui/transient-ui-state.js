const transientControlSelectors = [
  "#generation-count",
  "#generation-distribute-products",
  "#hook-version-title",
  "#hook-text-input"
];

export function captureTransientUiState(root) {
  return {
    controls: captureTransientControls(root),
    forms: captureTransientForms(root),
    details: captureTransientDetails(root)
  };
}

export function restoreTransientUiState(root, snapshot) {
  if (!snapshot) return;
  restoreTransientControls(root, snapshot.controls);
  restoreTransientForms(root, snapshot.forms);
  restoreTransientDetails(root, snapshot.details);
}

function captureTransientControls(root) {
  return transientControlSelectors.reduce((controls, selector) => {
    const field = root.querySelector(selector);
    if (!field) return controls;
    controls[selector] = captureFieldValue(field);
    return controls;
  }, {});
}

function restoreTransientControls(root, controls = {}) {
  Object.entries(controls).forEach(([selector, value]) => {
    const field = root.querySelector(selector);
    if (!field) return;
    restoreFieldValue(field, value);
  });
}

function captureTransientForms(root) {
  const forms = {};
  root.querySelectorAll("form[id]").forEach((form) => {
    forms[form.id] = {
      context: form.dataset?.transientContext || "",
      draft: captureFormDraft(form)
    };
  });
  return forms;
}

function restoreTransientForms(root, forms = {}) {
  Object.entries(forms).forEach(([formId, entry]) => {
    restoreFormDraft(root.querySelector(`#${formId}`), normalizeFormSnapshot(entry));
  });
}

function captureTransientDetails(root) {
  const details = {};
  root.querySelectorAll("[data-avatar-section]").forEach((section) => {
    details[section.dataset.avatarSection] = Boolean(section.open);
  });
  return details;
}

function restoreTransientDetails(root, details = {}) {
  Object.entries(details).forEach(([sectionName, isOpen]) => {
    const section = root.querySelector(`[data-avatar-section="${sectionName}"]`);
    if (!section) return;
    if (!isOpen && section.dataset.forceOpen === "true") return;
    section.open = Boolean(isOpen);
  });
}

function captureFormDraft(form) {
  if (!form) return null;
  const draft = {};
  [...form.elements].forEach((field) => {
    if (!field?.name) return;
    draft[field.name] = field.type === "checkbox" ? field.checked : field.value;
  });
  return draft;
}

function restoreFormDraft(form, draft) {
  if (!form || !draft) return;
  if ((form.dataset?.transientContext || "") !== (draft.context || "")) return;
  [...form.elements].forEach((field) => {
    if (!field?.name || !Object.hasOwn(draft.fields, field.name)) return;
    restoreFieldValue(field, draft.fields[field.name]);
  });
}

function normalizeFormSnapshot(entry) {
  if (!entry) return null;
  if (Object.hasOwn(entry, "draft")) {
    return { context: entry.context || "", fields: entry.draft || {} };
  }
  return { context: "", fields: entry };
}

function captureFieldValue(field) {
  return field.type === "checkbox" ? field.checked : field.value;
}

function restoreFieldValue(field, value) {
  if (field.type === "checkbox") field.checked = Boolean(value);
  else if (value !== undefined && value !== null) field.value = value;
}
