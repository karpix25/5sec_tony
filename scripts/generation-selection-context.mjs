import { getProductsForProject } from "../src/domain/generation.js";
import { getActiveDesignReferences } from "../src/domain/references.js";
import { isNoAvatarCharacterId } from "../src/domain/avatar-selection.js";

export function createServerSelectionContext(state, selection = {}, productId = "") {
  const project = findById(state.projects, selection.projectId || state.selectedProjectId) || state.projects?.[0];
  const products = getProductsForProject(state.products || [], project?.id);
  const product = findById(products, productId || selection.productId || state.selectedProductId) || products[0];
  const references = getActiveDesignReferences(project);
  const characterId = selection.characterId || state.selectedCharacterId;
  const audioId = selection.audioId || state.selectedAudioId;
  return {
    project,
    product,
    products,
    references,
    reference: findById(references, selection.referenceId || state.selectedReferenceId) || references[0],
    character: isNoAvatarCharacterId(characterId) ? null : findById(project?.characters, characterId),
    audio: findById(state.audioLibrary, audioId),
    audioLibrary: state.audioLibrary || [],
    generationBrief: state.generationBrief || {},
    freePrompt: selection.freePrompt ?? state.freePrompt ?? ""
  };
}

function findById(items = [], id = "") {
  return items.find((item) => item.id === id);
}
