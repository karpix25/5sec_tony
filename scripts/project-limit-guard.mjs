export function protectProjectLimitFloor(project = {}, existingProject = null) {
  const incomingLimit = asInteger(project.projectLimit, 500);
  const incomingUsed = asInteger(project.usedTotal, 0);
  const serverLimit = asInteger(existingProject?.projectLimit, 0);
  const serverUsed = asInteger(existingProject?.usedTotal, 0);
  const usedFloor = Math.max(0, incomingUsed, serverUsed);
  if (usedFloor > 0 && incomingLimit < usedFloor) {
    return {
      ...project,
      projectLimit: Math.max(serverLimit, usedFloor)
    };
  }
  return project;
}

function asInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}
