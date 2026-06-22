import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { handleHookPdfApi } from "./hook-pdf-api.mjs";
import { handleKieApi, loadEnvFile } from "./kie-api.mjs";
import { handleOpenRouterApi } from "./openrouter-api.mjs";
import { handleCompositeVideoApi } from "./composite-video.mjs";
import { handleAvatarAlphaVideoApi } from "./avatar-alpha-video.mjs";
import { handleReferenceAssetsApi } from "./reference-assets.mjs";
import { handleReelsResearchApi } from "./reels-research-api.mjs";
import { handleServerJobsApi } from "./server-jobs.mjs";
import { handleStateApi } from "./state-api.mjs";
import { handleYandexDiskApi } from "./yandex-disk-api.mjs";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
loadEnvFile();
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".svg": "image/svg+xml"
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  if (await handleHookPdfApi(request, response, url)) return;
  if (await handleReferenceAssetsApi(request, response, url)) return;
  if (await handleAvatarAlphaVideoApi(request, response, url)) return;
  if (await handleCompositeVideoApi(request, response, url)) return;
  if (await handleKieApi(request, response, url)) return;
  if (await handleOpenRouterApi(request, response, url)) return;
  if (await handleReelsResearchApi(request, response, url)) return;
  if (await handleServerJobsApi(request, response, url)) return;
  if (await handleStateApi(request, response, url)) return;
  if (await handleYandexDiskApi(request, response, url)) return;

  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    filePath = join(root, "index.html");
  }

  if (statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");

  const extension = extname(filePath);
  response.setHeader("Content-Type", types[extension] || "application/octet-stream");
  if (extension === ".html" || extension === ".js") {
    response.setHeader("Cache-Control", "no-cache");
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Anton 5 sec Studio: http://${host}:${port}`);
});
