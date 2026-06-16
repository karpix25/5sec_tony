const transientControlSelectors = [
  "#generation-count",
  "#hook-version-title",
  "#hook-text-input"
];

export function captureTransientUiState(root) {
  return {
    controls: captureTransientControls(root),
    forms: captureTransientForms(root)
  };
}

export function restoreTransientUiState(root, snapshot) {
  if (!snapshot) return;
  restoreTransientControls(root, snapshot.controls);
  restoreTransientForms(root, snapshot.forms);
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
    forms[form.id] = captureFormDraft(form);
  });
  return forms;
}

function restoreTransientForms(root, forms = {}) {
  Object.entries(forms).forEach(([formId, draft]) => {
    restoreFormDraft(root.querySelector(`#${formId}`), draft);
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
  [...form.elements].forEach((field) => {
    if (!field?.name || !Object.hasOwn(draft, field.name)) return;
    restoreFieldValue(field, draft[field.name]);
  });
}

function captureFieldValue(field) {
  return field.type === "checkbox" ? field.checked : field.value;
}

function restoreFieldValue(field, value) {
  if (field.type === "checkbox") field.checked = Boolean(value);
  else if (value !== undefined && value !== null) field.value = value;
}
