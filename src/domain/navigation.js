export const navigationTabs = ["project", "product", "audio", "design", "avatars", "generation", "queue"];

export function isNavigationTab(tab) {
  return navigationTabs.includes(tab);
}

export function normalizeNavigationTab(tab, fallback = "project") {
  return isNavigationTab(tab) ? tab : fallback;
}
