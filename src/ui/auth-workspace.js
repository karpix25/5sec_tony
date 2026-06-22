import { bindAuthGateEvents } from "./auth.js";
import { renderAdminAuthPanel } from "./auth-admin.js";

export function renderWorkspaceAuthAdmin(auth) {
  const authState = auth?.getState?.() || {};
  if (authState.status !== "approved" || authState.user?.role !== "admin") return "";
  return renderAdminAuthPanel(authState);
}

export function bindWorkspaceAuthEvents(root, auth) {
  if (!auth) return;
  bindAuthGateEvents(root, {
    logout: auth.logout,
    loadAdminUsers: auth.loadAdminUsers,
    runAdminAction: auth.runAdminAction,
    start: auth.start
  });
}
