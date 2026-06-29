import { getCompositeAvatarVideoUrl } from "./avatar-video-rotation.js";

const fallbackEmotionKeywords = [
  { words: ["ошиб", "ловуш", "риск", "опас", "предуп", "миф", "провал"], hints: ["трев", "строг", "предуп", "разоблач", "серьез"] },
  { words: ["совет", "как", "привыч", "рутин", "лайфхак"], hints: ["друж", "спокой", "мягк", "совет"] },
  { words: ["разбор", "провер", "факт", "признак", "сигнал"], hints: ["эксперт", "увер", "спокой", "разбор"] },
  { words: ["энерг", "быстр", "топ", "заряд"], hints: ["энерг", "жив", "актив"] }
];

export function getAvailableAvatarEmotions(project = {}) {
  return (project.characters || [])
    .filter((character) => character.isActive !== false)
    .flatMap((character) => (character.avatarVideos || [])
      .filter((video) => video.status === "ready")
      .filter((video) => video.isActive !== false)
      .filter((video) => getCompositeAvatarVideoUrl(video))
      .map((video) => ({
        characterId: character.id,
        characterName: character.name || "",
        videoId: video.id,
        emotionName: normalizeEmotionLabel(video.name || character.name || "Аватар")
      })))
    .filter((item) => item.emotionName);
}

export function resolveAvatarEmotionSelection({ project, topic = "", hook = "", brief = {}, selectedCharacterId = "" } = {}) {
  const options = getAvailableAvatarEmotions(project);
  const requested = normalizeEmotionLabel(
    brief.avatarEmotionName
      || brief.desiredAvatarEmotion
      || brief.creativeBrief?.avatarEmotionName
      || brief.creativeBrief?.desiredAvatarEmotion
      || ""
  );
  const exact = requested ? findExactEmotionOption(options, requested) : null;
  const matched = exact || pickFallbackEmotionOption(options, `${topic} ${hook} ${brief.finalContent?.headline || ""}`, selectedCharacterId);
  return {
    availableAvatarEmotions: options,
    avatarEmotionName: matched?.emotionName || requested || "",
    avatarVideoId: matched?.videoId || "",
    characterId: matched?.characterId || selectedCharacterId || "",
    source: exact ? "ai" : matched ? "fallback" : "none"
  };
}

export function createAvatarEmotionPromptContext(project = {}) {
  return getAvailableAvatarEmotions(project).map((item) => ({
    id: item.videoId,
    name: item.emotionName,
    characterName: item.characterName
  }));
}

function findExactEmotionOption(options, requested) {
  const normalized = normalizeForMatch(requested);
  return options.find((item) => normalizeForMatch(item.emotionName) === normalized) || null;
}

function pickFallbackEmotionOption(options, text, selectedCharacterId) {
  const scoped = selectedCharacterId ? options.filter((item) => item.characterId === selectedCharacterId) : options;
  const candidates = scoped.length ? scoped : options;
  if (!candidates.length) return null;
  const normalizedText = normalizeForMatch(text);
  let best = null;
  for (const option of candidates) {
    const score = scoreEmotionOption(option.emotionName, normalizedText);
    if (!best || score > best.score) best = { option, score };
  }
  return best?.score > 0 ? best.option : candidates[0];
}

function scoreEmotionOption(name, normalizedText) {
  const normalizedName = normalizeForMatch(name);
  const directScore = normalizedName.split(" ").filter((word) => word.length > 2 && normalizedText.includes(word)).length * 3;
  const keywordScore = fallbackEmotionKeywords.reduce((sum, group) => {
    const textHit = group.words.some((word) => normalizedText.includes(word));
    const nameHit = group.hints.some((hint) => normalizedName.includes(hint));
    return sum + (textHit && nameHit ? 4 : 0);
  }, 0);
  return directScore + keywordScore;
}

function normalizeEmotionLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeForMatch(value) {
  return String(value || "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ");
}
