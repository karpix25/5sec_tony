import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const files = [
  "src/domain/entities.js",
  "src/domain/avatar.js",
  "src/domain/avatar-video.js",
  "src/domain/creative-patterns.js",
  "src/domain/content-layers.js",
  "src/domain/content-rotation.js",
  "src/domain/hook-library.js",
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
  "src/services/yandex-disk.js",
  "src/state/factories.js",
  "src/state/global-assets.js",
  "src/state/job-batch.js",
  "src/state/avatar-video-workflow.js",
  "src/state/avatar-workflow.js",
  "src/state/store.js",
  "src/ui/infographic.js",
  "src/ui/audio.js",
  "src/ui/automation-runner.js",
  "src/ui/avatar-overlay-composer.js",
  "src/ui/avatar.js",
  "src/ui/modals.js",
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
