import test from "node:test";
import assert from "node:assert/strict";
import { compactStateForLocalCache } from "../src/state/local-cache-state.js";

test("local cache compaction strips embedded blobs but keeps remote URLs and queue metadata", () => {
  const compacted = compactStateForLocalCache({
    projects: [{
      id: "project-1",
      references: [{ id: "ref-1", imageData: "data:image/png;base64,AAA" }, { id: "ref-2", imageData: "https://cdn/ref.png" }],
      audioLibrary: [{ id: "audio-1", fileData: "data:audio/mp3;base64,BBB" }],
      avatarCandidates: [{ id: "avatar-1", imageData: "data:image/png;base64,CCC" }],
      designReferenceCandidates: [{ id: "design-1", imageData: "https://cdn/design.png" }],
      characters: [{
        id: "char-1",
        imageData: "data:image/png;base64,DDD",
        avatarVideos: [{ id: "video-1", alphaVideoUrl: "https://cdn/alpha.webm", previewImageData: "data:image/png;base64,EEE" }]
      }]
    }],
    products: [{
      id: "product-1",
      references: [{ id: "product-ref-1", imageData: "data:image/png;base64,FFF" }]
    }],
    audioLibrary: [{ id: "global-audio-1", fileData: "data:audio/mp3;base64,GGG" }],
    jobs: [{
      id: "job-1",
      imageUrl: "https://cdn/job.png",
      imageData: "https://cdn/job.png",
      inputUrls: ["data:image/png;base64,HHH", "https://cdn/input.png"],
      finalVideoUrl: "https://cdn/final.mp4"
    }]
  });

  assert.equal(compacted.projects[0].references[0].imageData, "");
  assert.equal(compacted.projects[0].references[1].imageData, "https://cdn/ref.png");
  assert.equal(compacted.projects[0].audioLibrary[0].fileData, "");
  assert.equal(compacted.projects[0].avatarCandidates[0].imageData, "");
  assert.equal(compacted.projects[0].characters[0].imageData, "");
  assert.equal(compacted.projects[0].characters[0].avatarVideos[0].alphaVideoUrl, "https://cdn/alpha.webm");
  assert.equal(compacted.projects[0].characters[0].avatarVideos[0].previewImageData, "");
  assert.equal(compacted.products[0].references[0].imageData, "");
  assert.equal(compacted.audioLibrary[0].fileData, "");
  assert.equal(compacted.jobs[0].imageData, "");
  assert.deepEqual(compacted.jobs[0].inputUrls, ["https://cdn/input.png"]);
  assert.equal(compacted.jobs[0].finalVideoUrl, "https://cdn/final.mp4");
});
