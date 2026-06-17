const compositionCatalog = {
  comparison: [
    {
      id: "comparison-columns",
      label: "две колонки",
      instruction: "Собери композицию как сравнение в 2 колонки: слева версия A, справа версия B. Не скатывайся в обычный вертикальный список."
    },
    {
      id: "myth-fact-cards",
      label: "миф и факт карточками",
      instruction: "Собери композицию карточками миф/факт или норма/ошибка. Карточки могут идти каскадом, но не как один длинный список."
    },
    {
      id: "comparison-table",
      label: "сравнительная таблица",
      instruction: "Собери композицию как компактную таблицу сравнения: строки или блоки с четкими критериями. Не делай poster с пунктами слева."
    }
  ],
  checklist: [
    {
      id: "editorial-list",
      label: "редакционный список",
      instruction: "Собери композицию как вертикальный editorial-список с короткими блоками и равным ритмом."
    },
    {
      id: "table-grid",
      label: "таблица",
      instruction: "Собери композицию как табличную сетку или grid 2x2 / 2x3. Не превращай все в одну колонку."
    },
    {
      id: "check-cards",
      label: "карточки",
      instruction: "Собери композицию как серию карточек или плиток. Каждая карточка = один смысловой блок."
    }
  ],
  symptoms: [
    {
      id: "classification-list",
      label: "классификация списком",
      instruction: "Собери композицию как классификацию признаков с короткими блоками и четким ритмом."
    },
    {
      id: "classification-grid",
      label: "классификация сеткой",
      instruction: "Собери композицию как сетку признаков или состояний, а не как одну левую колонку."
    },
    {
      id: "signal-table",
      label: "таблица сигналов",
      instruction: "Собери композицию как таблицу сигналов: признак -> что значит -> что делать."
    }
  ],
  scheme: [
    {
      id: "center-scheme",
      label: "схема вокруг центра",
      instruction: "Собери композицию как схему вокруг центрального объекта с выносками, стрелками или узлами."
    },
    {
      id: "timeline-flow",
      label: "таймлайн",
      instruction: "Собери композицию как последовательный flow или таймлайн шагов, а не как статичный список."
    },
    {
      id: "scheme-table",
      label: "схема-таблица",
      instruction: "Собери композицию как структурную таблицу или matrix с логическими связями между блоками."
    }
  ],
  "mistake-solution": [
    {
      id: "mistake-vs-fix",
      label: "ошибка против решения",
      instruction: "Собери композицию как split-screen: ошибка и правильный шаг, с явным контрастом между двумя зонами."
    },
    {
      id: "problem-solution-cards",
      label: "карточки проблема-решение",
      instruction: "Собери композицию карточками проблема -> решение, без одной длинной колонки."
    },
    {
      id: "before-after",
      label: "до и после",
      instruction: "Собери композицию как до/после или было/стало, если это помогает показать разницу."
    }
  ],
  "product-stack": [
    {
      id: "stack-grid",
      label: "сетка продуктов",
      instruction: "Собери композицию как стек или grid связанных объектов, а не как левый список с одним большим объектом."
    },
    {
      id: "stack-table",
      label: "структурная таблица",
      instruction: "Собери композицию как структурную таблицу или набор модулей с разными ролями."
    }
  ],
  default: [
    {
      id: "editorial-grid",
      label: "редакционная сетка",
      instruction: "Собери композицию как редакционную сетку с несколькими зонами, а не как один типовой poster."
    },
    {
      id: "modular-cards",
      label: "модульные карточки",
      instruction: "Собери композицию как модули или карточки с разной иерархией."
    }
  ]
};

export function pickCompositionMode({ format, existingJobs = [] }) {
  const modes = compositionCatalog[format] || compositionCatalog.default;
  const used = new Set(existingJobs.map((job) => String(job.compositionMode || "").trim()).filter(Boolean));
  return modes.find((mode) => !used.has(mode.id)) || modes[existingJobs.length % modes.length];
}

export function getCompositionInstruction(mode) {
  if (!mode) return "";
  return [
    `COMPOSITION MODE: ${mode.id}.`,
    `Тип композиции: ${mode.label}.`,
    mode.instruction
  ].join(" ");
}
