export const generationStages = [
  "brief",
  "prompt",
  "image",
  "approval",
  "assembly",
  "export"
];

export const statusLabels = {
  queued: "В очереди",
  running: "В работе",
  review: "На проверке",
  done: "Готово",
  failed: "Ошибка"
};

export const projects = [
  {
    id: "supplements",
    client: "Anton Studio",
    name: "БАДы",
    exportFolder: "Yandex Disk / Anton / БАДы / Готовые",
    dailyLimit: 30,
    usedToday: 18,
    companyInfo: "Бренд БАДов с фокусом на понятные ежедневные привычки, аккуратную доказательную коммуникацию и поддержку клиента без медицинских обещаний.",
    companyAudience: "Люди 28-50, которые хотят системно улучшать самочувствие, сон, стресс и beauty-рутину, но не доверяют громким обещаниям.",
    toneOfVoice: "спокойный экспертный, понятный, без давления и чудо-обещаний",
    restrictions: "Не обещать лечение, диагнозы, гарантированный результат, быстрые медицинские эффекты.",
    style: "чистая медицинская инфографика, крупные тезисы, живой персонаж",
    lastReferenceUpdate: "2026-06-03",
    references: [
      {
        id: "med-clean",
        type: "design",
        title: "Белый фон + плашки",
        takeaways: "Вертикальный 9:16, весь контент внутри safe zone, крупный верхний хук, список симптомов слева, медицинский 3D-объект справа, низ не перегружать для будущего видео-оверлея.",
        avoidCopy: "Не копировать текст референса, чужие симптомы без проверки, чужой продукт и медицинские обещания.",
        layoutType: "symptoms",
        palette: "теплый светлый фон, оливковые медицинские акценты, яркая плашка заголовка",
        headlineStyle: "жирный крупный sans для хука, serif для большой цифры или главного тезиса",
        avatarPlacement: "",
        textDensity: "high",
        visualObject: "3D medical render органа или продукта"
      },
      { id: "ugc-proof", type: "design", title: "UGC proof-карточка", layoutType: "expert-poster", textDensity: "medium" },
      { id: "cta-default", type: "cta", title: "Закажи консультацию за 4 секунды" }
    ],
    audioLibrary: [
      { id: "audio-01", title: "Fresh reels beat 92 BPM", mood: "энергично", duration: "5 sec", createdAt: "2026-06-03T10:00:00.000Z" }
    ],
    characters: [
      {
        id: "doctor-guide",
        name: "Эксперт Антон",
        status: "approved",
        prompt: "дружелюбный эксперт, чистый фон, уверенный взгляд"
      }
    ]
  },
  {
    id: "beauty",
    client: "Anton Studio",
    name: "Омолаживающая косметика",
    exportFolder: "Yandex Disk / Anton / Beauty / Готовые",
    dailyLimit: 24,
    usedToday: 9,
    companyInfo: "Косметический бренд с премиальной подачей, акцентом на регулярный уход, составы и честные визуальные ожидания.",
    companyAudience: "Женщины 30-55, которым важны тонус кожи, понятный уход, мягкая экспертность и отсутствие агрессивных обещаний.",
    toneOfVoice: "премиальный, мягкий, экспертный",
    restrictions: "Не обещать минус возраст, эффект пластики, лечение кожи или гарантированный результат.",
    style: "премиальная beauty-инфографика, мягкий свет, до/после без фейка",
    lastReferenceUpdate: "2026-05-29",
    references: [
      { id: "beauty-grid", type: "design", title: "Beauty grid + состав" },
      { id: "cta-beauty", type: "cta", title: "Подбери уход под свою кожу" }
    ],
    audioLibrary: [
      { id: "skin-audio", title: "Soft pop 105 BPM", mood: "мягко", duration: "5 sec", createdAt: "2026-05-29T10:00:00.000Z" }
    ],
    characters: [
      {
        id: "beauty-host",
        name: "Настя",
        status: "approved",
        prompt: "ведущая beauty-роликов, нейтральная эмоция, чистый силуэт"
      }
    ]
  },
  {
    id: "ppm",
    client: "Anton Studio",
    name: "Плати по миру",
    exportFolder: "Yandex Disk / Anton / PPM / Готовые",
    dailyLimit: 20,
    usedToday: 13,
    companyInfo: "Сервис поддержки оплат зарубежных подписок и рабочих инструментов с понятной коммуникацией, прозрачным процессом и спокойным тоном.",
    companyAudience: "Предприниматели, специалисты и команды, которым важно быстро восстановить доступ к сервисам без хаоса и лишнего риска.",
    toneOfVoice: "доверительный, спокойный, без серых обещаний",
    restrictions: "Не обещать обход правил, гарантии любой оплаты или серые схемы.",
    style: "финтех-инфографика, простые схемы, доверительный тон",
    lastReferenceUpdate: "2026-06-01",
    references: [
      {
        id: "viral-pink-symptoms",
        type: "design",
        title: "Viral symptoms poster",
        promptComment: "Использовать только дизайн: вертикальная композиция, иерархия, glow-хук, плотность, палитра и safe zone.",
        takeaways: "Вертикальный 9:16. Весь текст и ключевые объекты внутри safe zone. Верхний хук в яркой розовой glow-плашке: белые жирные буквы с черной обводкой. Ниже крупный serif-тезис с большой цифрой или сильным словом. Слева плотная колонка коротких пунктов с 3D-иконками. Справа крупный 3D-объект по теме. Нижнюю часть не перегружать для будущего видео-оверлея.",
        avoidCopy: "Не копировать текст, смысл, симптомы, чужой продукт, логотипы, персонажа и обещания. Брать только композицию, иерархию, glow-хук, плотность и viral-инфографическую подачу.",
        layoutType: "symptoms",
        palette: "нежный розово-персиковый фон, яркий hot-pink glow под верхним хуком, темный контур текста, оливково-зеленые или teal-акценты под финтех-иконки",
        headlineStyle: "верхний заголовок: крупный белый bold sans, черная обводка, сильная тень и розовое свечение; второй тезис: крупный контрастный serif, как журнальный заголовок",
        avatarPlacement: "",
        textDensity: "high",
        visualObject: "крупный 3D-объект оплаты: карта, глобус, терминал, экран подписки или связка сервисов"
      },
      { id: "fintech-simple", type: "design", title: "Оплата в 3 шага" },
      { id: "global-map", type: "design", title: "Карта + платежная карточка" }
    ],
    audioLibrary: [
      { id: "money-audio", title: "Clean tech beat 100 BPM", mood: "технологично", duration: "5 sec", createdAt: "2026-06-01T10:00:00.000Z" }
    ],
    characters: [
      {
        id: "finance-guide",
        name: "Проводник",
        status: "draft",
        prompt: "деловой помощник, без банковской агрессии, чистый фон"
      }
    ]
  }
];

export const globalAudioLibrary = [
  { id: "audio-01", title: "Fresh reels beat 92 BPM", mood: "энергично", duration: "5 sec", createdAt: "2026-06-03T10:00:00.000Z" },
  { id: "skin-audio", title: "Soft pop 105 BPM", mood: "мягко", duration: "5 sec", createdAt: "2026-05-29T10:00:00.000Z" },
  { id: "money-audio", title: "Clean tech beat 100 BPM", mood: "технологично", duration: "5 sec", createdAt: "2026-06-01T10:00:00.000Z" }
];

export const products = [
  {
    id: "magnesium",
    projectId: "supplements",
    name: "Магний вечерний",
    description: "БАД для вечерней wellness-рутины, акцент на привычку, мягкий тон и аккуратную коммуникацию.",
    offer: "курс на 30 дней с мягким вечерним ритуалом",
    components: "магний, витамин B6, формат вечернего приема",
    pains: ["тяжело уснуть", "нервное напряжение", "утренняя разбитость"],
    facts: ["без медицинских обещаний", "акцент на привычку и состав", "не заменяет консультацию врача"],
    forbidden: ["лечит бессонницу", "снимает диагнозы", "гарантирует результат"]
  },
  {
    id: "collagen",
    projectId: "supplements",
    name: "Коллаген + витамин C",
    description: "Beauty-комплекс для ежедневного ухода изнутри с акцентом на регулярность.",
    offer: "комплекс для ежедневного beauty-ухода изнутри",
    components: "коллаген, витамин C",
    pains: ["тусклая кожа", "ломкость ногтей", "нет системного ухода"],
    facts: ["делаем акцент на регулярность", "без обещаний омоложения", "упоминаем состав"],
    forbidden: ["минус 10 лет", "лечит кожу", "заменяет питание"]
  },
  {
    id: "serum",
    projectId: "beauty",
    name: "Пептидная сыворотка",
    description: "Пептидная сыворотка для вечернего ухода и понятной beauty-рутины.",
    offer: "сыворотка для вечернего ухода",
    components: "пептиды, увлажняющая база",
    pains: ["кожа выглядит усталой", "непонятно, что работает", "хочется простой ритуал"],
    facts: ["пептиды в составе", "визуальный эффект зависит от кожи", "нужен патч-тест"],
    forbidden: ["убирает морщины навсегда", "эффект пластики", "лечит дерматологию"]
  },
  {
    id: "crosspay",
    projectId: "ppm",
    name: "Оплата зарубежных сервисов",
    description: "Сервис помощи с оплатой зарубежных рабочих инструментов и подписок.",
    offer: "понятная помощь с оплатой нужных сервисов",
    components: "поддержка, проверка сценария, сопровождение оплаты",
    pains: ["карта не проходит", "срок подписки горит", "нужно быстро и прозрачно"],
    facts: ["показываем сценарии использования", "без обещаний обхода правил", "акцент на поддержку"],
    forbidden: ["обход санкций", "серые схемы", "гарантия любой оплаты"]
  }
];

export const initialJobs = [
  {
    id: "job-184",
    projectId: "supplements",
    productId: "magnesium",
    status: "running",
    stage: "image",
    progress: 58,
    title: "Почему сон не восстанавливает",
    music: "Fresh reels beat 92 BPM"
  },
  {
    id: "job-183",
    projectId: "beauty",
    productId: "serum",
    status: "review",
    stage: "approval",
    progress: 78,
    title: "Сыворотка без обещаний чуда",
    music: "Soft pop 105 BPM"
  },
  {
    id: "job-182",
    projectId: "ppm",
    productId: "crosspay",
    status: "done",
    stage: "export",
    progress: 100,
    title: "Когда подписка заканчивается сегодня",
    music: "Clean tech beat 100 BPM"
  }
];
