import test from "node:test";
import assert from "node:assert/strict";
import { buildPgDumpInvocation, collectAssetLinks } from "../scripts/postgres-backup.mjs";

test("postgres backup passes password through env instead of pg_dump args", () => {
  const url = "postgres://user:secret-pass@tools_baza:5432/anton_5sec?sslmode=disable";
  const { args, env } = buildPgDumpInvocation(url, "backup.dump");

  assert.equal(env.PGPASSWORD, "secret-pass");
  assert.equal(env.PGSSLMODE, "disable");
  assert.equal(args.includes("secret-pass"), false);
  assert.deepEqual(args.slice(-8), ["--host", "tools_baza", "--port", "5432", "--username", "user", "--dbname", "anton_5sec"]);
});

test("postgres backup collects only existing asset links and skips embedded blobs", () => {
  const links = collectAssetLinks({
    projects: [{
      references: [{ url: "https://cdn.example.com/ref.png" }],
      characters: [{ imageData: "data:image/png;base64,AAAA", avatarVideos: [{ videoUrl: "s3://bucket/video.mp4" }] }]
    }],
    audioLibrary: [{ fileData: "data:audio/wav;base64,BBBB" }],
    jobs: [{ diskPath: "disk:/ВИДЕО/5сек/result.mp4", localPath: "/generated/avatar-videos/result.mp4" }]
  });

  assert.deepEqual(links, [
    "disk:/ВИДЕО/5сек/result.mp4",
    "https://cdn.example.com/ref.png",
    "s3://bucket/video.mp4"
  ]);
});
