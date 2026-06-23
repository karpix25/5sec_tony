export function formatComplianceInstruction({ commonRules, productPassport, creativeBrief, contentScript, designFormatBrief }) {
  return JSON.stringify({
    task: "Проверь, совпадает ли contentScript со структурой designFormatBrief, и исправь его до visual/art этапов.",
    role: "Ты format compliance editor: не придумываешь новую идею, а приводишь текст к макету дизайн-референса.",
    commonRules,
    output: {
      formatCompliance: {
        formatMatched: true,
        issues: [],
        fixedContentScript: {
          headline: "",
          subhead: "",
          points: []
        },
        finalRules: []
      }
    },
    rules: [
      "Главный критерий: текст должен подходить в слоты designFormatBrief, а не повторять старую форму темы.",
      "Если formatType=ranking_leaderboard, сценарий обязан быть top-chart/leaderboard: headline начинается с ТОП, subhead похож на legend/source strip, points это 8-12 очень коротких ranked items.",
      "Если входной текст похож на checklist, 4-6 маркеров, диагностическую карточку или список симптомов, перепакуй его в рейтинг признаков, ситуаций, ошибок или критериев.",
      "Не сохраняй старые числа вроде '5 маркеров', если финальный leaderboard содержит 8-12 карточек.",
      "Не делай длинные предложения в points: один ranked item = 2-5 слов, максимум 7 слов.",
      "Не добавляй claims, цифры, состав, медицинские обещания или гарантии, которых нет в productPassport.",
      "Если формат уже совпадает, верни тот же текст без изменений."
    ],
    productPassport,
    creativeBrief,
    designFormatBrief,
    contentScript
  });
}
