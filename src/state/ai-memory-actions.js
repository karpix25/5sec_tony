export function createAiMemoryActions({ getState, setState }) {
  return {
    updateSelectedDesignReference(payload = {}) {
      const state = getState();
      setState({
        projects: state.projects.map((project) => project.id === state.selectedProjectId ? {
          ...project,
          references: (project.references || []).map((reference) =>
            reference.id === state.selectedReferenceId ? { ...reference, ...payload } : reference
          )
        } : project)
      });
    }
  };
}
