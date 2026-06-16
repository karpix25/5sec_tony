export function captureTransientUiState(root) {
  return {
    generationCount: root.querySelector("#generation-count")?.value || "",
    automationDraft: captureFormDraft(root.querySelector("#automation-form"))
  };
}

export function restoreTransientUiState(root, snapshot) {
  if (!snapshot) return;
  const generationCount = root.querySelector("#generation-count");
  if (generationCount && snapshot.generationCount) generationCount.value = snapshot.generationCount;
  restoreFormDraft(root.querySelector("#automation-form"), snapshot.automationDraft);
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
    if (field.type === "checkbox") field.checked = Boolean(draft[field.name]);
    else field.value = draft[field.name];
  });
}
