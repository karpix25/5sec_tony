import test from "node:test";
import assert from "node:assert/strict";
import { createDailyUsageDate, normalizeProjectDailyUsage } from "../src/domain/daily-usage.js";

test("daily usage follows Argentina local midnight", () => {
  assert.equal(createDailyUsageDate("2026-08-02T02:30:00.000Z"), "2026-08-01");
  assert.equal(createDailyUsageDate("2026-08-02T03:30:00.000Z"), "2026-08-02");
});

test("daily usage resets once when the local day changes", () => {
  const project = { usedToday: 12, dailyUsageDate: "2026-08-01" };
  const normalized = normalizeProjectDailyUsage(project, { now: "2026-08-02T03:30:00.000Z" });

  assert.equal(normalized.usedToday, 0);
  assert.equal(normalized.dailyUsageDate, "2026-08-02");
});
