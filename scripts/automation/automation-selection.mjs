import { noAvatarCharacterId } from "../../src/domain/avatar-selection.js";
import { getActiveDesignReferences } from "../../src/domain/references.js";

export function buildAutomationBatchSelection(state = {}, project = {}) {
  const references = getActiveDesignReferences(project);
  return {
    projectId: project.id || "",
    productId: "",
    referenceId: pickProjectReferenceId(state, references),
    characterId: pickProjectCharacterId(state, project),
    audioId: pickAudioId(state),
    freePrompt: state.freePrompt || ""
  };
}

function pickProjectReferenceId(state, references) {
  const selected = references.find((reference) => reference.id === state.selectedReferenceId);
  return selected?.id || references[0]?.id || "";
}

function pickProjectCharacterId(state, project) {
  const selectedId = state.selectedCharacterId || "";
  if ((project.characters || []).some((character) => character.id === selectedId)) return selectedId;
  return noAvatarCharacterId;
}

function pickAudioId(state) {
  const selectedId = state.selectedAudioId || "";
  if ((state.audioLibrary || []).some((audio) => audio.id === selectedId)) return selectedId;
  return state.audioLibrary?.[0]?.id || "";
}
