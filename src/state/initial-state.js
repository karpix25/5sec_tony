import { globalAudioLibrary, initialJobs, products, projects } from "../domain/entities.js";
import { defaultGenerationBrief } from "./factories.js";

export function createInitialState() {
  return {
    projects,
    products,
    jobs: initialJobs,
    audioLibrary: globalAudioLibrary,
    selectedProjectId: projects[0].id,
    selectedProductId: products[0].id,
    selectedReferenceId: projects[0].references[0].id,
    selectedCharacterId: projects[0].characters[0].id,
    selectedAudioId: globalAudioLibrary[0].id,
    selectedProjectTab: "project",
    generationBrief: defaultGenerationBrief,
    freePrompt: "Сделать спорный, но правдивый хук без репутационного риска."
  };
}
