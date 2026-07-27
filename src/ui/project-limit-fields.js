export function raiseProjectLimitAboveUsedTotal(payload = {}, store, form = null, options = {}) {
  if (!Object.hasOwn(payload, "projectLimit")) return { payload, adjusted: false };
  const project = getProjectForLimit(store, options.projectId);
  const usedTotal = Math.max(0, Number(project?.usedTotal || 0));
  const requested = Number(payload.projectLimit);
  if (!Number.isFinite(requested) || requested > usedTotal) return { payload, adjusted: false };
  const minimum = Math.min(10000, usedTotal + 1);
  const projectLimit = typeof payload.projectLimit === "string" ? String(minimum) : minimum;
  const nextPayload = { ...payload, projectLimit };
  const field = form?.querySelector?.('[name="projectLimit"]');
  if (field) field.value = String(minimum);
  return {
    payload: nextPayload,
    adjusted: true,
    minimum,
    usedTotal,
    message: `Общий лимит поднят до ${minimum}: уже использовано ${usedTotal}.`
  };
}

export function getProjectTotalLimitHint(project = {}) {
  const usedTotal = Math.max(0, Number(project.usedTotal || 0));
  if (!usedTotal) return "";
  return `Уже использовано: ${usedTotal}. Для новых генераций общий лимит должен быть больше ${usedTotal}.`;
}

export function readProjectLimitBase(form = null) {
  const field = form?.querySelector?.('[name="projectLimit"]');
  const base = Number(field?.dataset?.projectLimitBase);
  return Number.isFinite(base) ? base : null;
}

function getProjectForLimit(store, projectId = "") {
  const state = store?.getState?.() || {};
  const id = projectId || state.selectedProjectId || "";
  return (state.projects || []).find((project) => project.id === id) || null;
}
