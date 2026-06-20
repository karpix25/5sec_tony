import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const files = [
  "src/storage/json-storage.js",
  "src/domain/entities.js",
  "src/domain/avatar.js",
  "src/domain/avatar-video.js",
  "src/domain/avatar-video-rotation.js",
  "src/domain/avatar-selection.js",
  "src/domain/design-reference-candidate.js",
  "src/domain/creative-patterns.js",
  "src/domain/content-layers.js",
  "src/domain/content-rotation.js",
  "src/domain/composition-modes.js",
  "src/domain/cta-overlay.js",
  "src/domain/design-style-lock.js",
  "src/domain/hook-library.js",
  "src/domain/hook-adapter.js",
  "src/domain/product-insights.js",
  "src/domain/product-profile.js",
  "src/domain/project-automation.js",
  "src/domain/topic-candidates.js",
  "src/domain/meaning-engine.js",
  "src/domain/payment-plan.js",
  "src/domain/generation.js",
  "src/domain/project-strategy.js",
  "src/domain/reels-research.js",
  "src/domain/references.js",
  "src/services/audience-expert.js",
  "src/services/brief-ai.js",
  "src/services/text-humanizer.js",
  "src/services/kie-client.js",
  "src/services/hook-ai.js",
  "src/services/reels-research.js",
  "src/services/state-sync.js",
  "src/services/yandex-disk.js",
  "src/state/factories.js",
  "src/state/global-assets.js",
  "src/state/job-batch.js",
  "src/state/initial-state.js",
  "src/state/local-cache-state.js",
  "src/state/state-persistence.js",
  "src/state/design-reference-workflow.js",
  "src/state/project-cta-workflow.js",
  "src/state/avatar-video-workflow.js",
  "src/state/avatar-workflow.js",
  "src/state/store-normalizers.js",
  "src/state/store-persistence-policy.js",
  "src/state/store-projects.js",
  "src/state/store-context.js",
  "src/state/ui-cache-state.js",
  "src/state/store-cache.js",
  "src/state/store.js",
  "src/ui/infographic.js",
  "src/ui/audio.js",
  "src/ui/automation-runner.js",
  "src/ui/avatar-overlay-composer.js",
  "src/ui/avatar.js",
  "src/ui/cta-overlay-controls.js",
  "src/ui/generation-live.js",
  "src/ui/modals.js",
  "src/ui/preview-modal.js",
  "src/ui/button-debug.js",
  "src/ui/product-form-sync.js",
  "src/ui/product-analysis-merge.js",
  "src/ui/transient-ui-state.js",
  "src/ui/design.js",
  "src/ui/hooks.js",
  "src/ui/generation.js",
  "src/ui/job-runner.js",
  "src/ui/product-ai.js",
  "src/ui/project-ai.js",
  "src/ui/product.js",
  "src/ui/project.js",
  "src/ui/research.js",
  "src/ui/queue.js",
  "src/ui/yandex-folder-picker.js",
  "src/ui/render.js",
  "src/main.js"
];

const bundle = files
  .map((file) => {
    const source = readFileSync(join(root, file), "utf8")
      .replace(/^import[\s\S]*?;\n/gm, "")
      .replace(/^export /gm, "");
    return `// ${file}\n${source}`;
  })
  .join("\n\n");

const output = join(root, "dist/app.bundle.js");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, bundle, "utf8");
console.log(`Built ${output}`);
