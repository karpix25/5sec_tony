import test from "node:test";
import assert from "node:assert/strict";
import { selectServerJobAudio } from "../scripts/server-job-audio.mjs";

test("server job selects a random playable audio asset", () => {
  const audio = selectServerJobAudio({
    context: {
      selectedAudioId: "audio-1",
      audioLibrary: [
        { id: "audio-1", title: "First", fileData: "https://cdn.example.com/first.mp3" },
        { id: "audio-2", title: "Second", fileData: "https://cdn.example.com/second.mp3" },
        { id: "empty", title: "Empty", fileData: "" }
      ]
    }
  }, () => 0.75);

  assert.equal(audio.id, "audio-2");
});

test("server job skips final audio when library has no playable files", () => {
  const audio = selectServerJobAudio({
    context: {
      selectedAudioId: "audio-1",
      audioLibrary: [{ id: "audio-1", title: "Missing file", fileData: "" }]
    }
  }, () => 0);

  assert.equal(audio, null);
});
