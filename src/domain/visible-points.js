export function getVisibleImagePoints(points, format = "") {
  const source = Array.isArray(points) ? points.filter(Boolean) : [];
  return source.slice(0, format === "ranking_leaderboard" ? 12 : 6);
}

export function formatVisiblePointSource(points) {
  return points.map((point) => String(point).replace(/\s+/g, " ").trim()).join(" | ");
}

export function formatPointCountInstruction(format, visiblePointCount) {
  if (format === "ranking_leaderboard") {
    return "Формат смыслов: ranking_leaderboard; эти пункты являются сырьем, а не лимитом. Финальный top-chart должен содержать 8-12 коротких rank cards, если это задано дизайн-референсом.";
  }
  return `Формат смыслов: ${format}; количество видимых пунктов: ${visiblePointCount}, больше не добавлять.`;
}
