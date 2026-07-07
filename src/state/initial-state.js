import { globalAudioLibrary, initialJobs, products, projects } from "../domain/entities.js";
import { noAvatarCharacterId } from "../domain/avatar-selection.js";
import { defaultGenerationBrief } from "./factories.js";
import { createPersistedReferenceState } from "./reference-libraries.js";

export function createInitialState() {
  return {
    projects,
    products,
    jobs: initialJobs,
    audioLibrary: globalAudioLibrary,
    selectedProjectId: projects[0].id,
    selectedProductId: products[0].id,
    selectedReferenceId: projects[0].references[0].id,
    selectedCharacterId: noAvatarCharacterId,
    selectedAudioId: globalAudioLibrary[0].id,
    selectedProjectTab: "project",
    queueProductFilter: "current",
    generationBrief: defaultGenerationBrief,
    freePrompt: "Сделать спорный, но правдивый хук без репутационного риска.",
    ...createPersistedReferenceState()
  };
}
