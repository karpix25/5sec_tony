import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readJsonRequest } from "../scripts/request-body.mjs";

test("readJsonRequest preserves Cyrillic split across request chunks", async () => {
  const request = new EventEmitter();
  const resultPromise = readJsonRequest(request);
  const payload = Buffer.from(JSON.stringify({ text: "мощная и понятная нагрузка" }), "utf8");
  const splitAt = payload.indexOf(Buffer.from("щ", "utf8")) + 1;
  request.emit("data", payload.subarray(0, splitAt));
  request.emit("data", payload.subarray(splitAt));
  request.emit("end");
  assert.deepEqual(await resultPromise, { text: "мощная и понятная нагрузка" });
});

test("readJsonRequest rejects an oversized body without destroying the request", async () => {
  const request = new EventEmitter();
  let resumed = false;
  request.resume = () => { resumed = true; };
  const resultPromise = readJsonRequest(request, { limitBytes: 4 });
  request.emit("data", Buffer.from("12345"));
  await assert.rejects(resultPromise, (error) => error.code === "REQUEST_BODY_TOO_LARGE");
  assert.equal(resumed, true);
});
