import test from "node:test";
import assert from "node:assert/strict";
import { buildServerExportFileName, getInternalServerOrigin } from "../scripts/server-job-runner.mjs";

test("server job runner can target the internal web service from worker containers", () => {
  const originalOrigin = process.env.INTERNAL_SERVER_ORIGIN;
  const originalPort = process.env.PORT;
  process.env.INTERNAL_SERVER_ORIGIN = "http://n8n-5sec:4173";
  process.env.PORT = "9999";

  try {
    assert.equal(getInternalServerOrigin(), "http://n8n-5sec:4173");
  } finally {
    if (originalOrigin === undefined) delete process.env.INTERNAL_SERVER_ORIGIN;
    else process.env.INTERNAL_SERVER_ORIGIN = originalOrigin;
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  }
});

test("server export filenames include product and unique job id suffix", () => {
  const fileName = buildServerExportFileName(
    { name: "MOLEKULAR" },
    {
      id: "job-053b7765-aaaa-bbbb",
      productName: "Шампунь ICONIC",
      title: "Кератин смывается через месяц?"
    }
  );

  assert.match(fileName, /^molekular-шампунь-iconic-кератин-смывается-через-месяц/);
  assert.match(fileName, /053b7765\.mp4$/);
});
