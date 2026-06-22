export async function handleHealthApi(request, response, url) {
  if (!["GET", "HEAD"].includes(request.method) || url.pathname !== "/api/health") return false;
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  response.end(JSON.stringify({ ok: true }));
  return true;
}
