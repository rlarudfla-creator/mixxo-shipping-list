import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { filterWeeklyItems, resolveWeeklyLocalStorePath, syncWeeklyAccumulation } from "../weekly-store.mjs";

function colToIndex(letter) {
  return [...letter.toUpperCase()].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function makeRow(values = {}) {
  const row = Array(138).fill("");
  for (const [column, value] of Object.entries(values)) {
    row[colToIndex(column)] = value;
  }
  return row;
}

test("syncWeeklyAccumulation reads the weekly board, merges with stored rows, and saves the accumulated result", async () => {
  let savedItems = null;
  const weeklyRows = [
    makeRow(),
    makeRow(),
    makeRow(),
    makeRow({ C: "스타일", CA: "기획자명", DL: "입고여부", EH: "핵심상품" }),
    makeRow({
      C: "MIWTEST100",
      D: "0",
      CA: "김가영",
      DH: "1000",
      DJ: "500",
      DL: "미입고",
      DQ: "05-20",
      DR: "250",
      DS: "10,000"
    })
  ];

  const result = await syncWeeklyAccumulation({
    loadItems: async () => [
      {
        key: "MIWTEST100|00|1",
        groupKey: "MIWTEST100|00",
        style: "MIWTEST100",
        round: "00",
        groupNumber: 1,
        incomingDate: "2026-05-20",
        incomingQuantity: 200,
        remainingQuantity: 500,
        orderQuantity: 950
      }
    ],
    fetchWeeklyRows: async () => weeklyRows,
    saveItems: async (items) => {
      savedItems = items;
    }
  }, { referenceYear: 2026, now: "2026-05-20T00:00:00.000Z" });

  assert.equal(result.summary.updated, 1);
  assert.equal(result.summary.needsCheck, 1);
  assert.equal(savedItems[0].incomingQuantity, 250);
  assert.equal(savedItems[0].orderQuantity, 1000);
  assert.equal(savedItems[0].accumulatedQuantity, 250);
});

test("filterWeeklyItems narrows data by date range, planner, and issue-only flag", () => {
  const items = [
    {
      key: "A|00|1",
      groupKey: "A|00",
      style: "A",
      round: "00",
      plannerName: "김가영",
      incomingDate: "2026-05-20",
      shippingDate: "2026-05-21",
      validationStatus: "needs_check"
    },
    {
      key: "B|00|1",
      groupKey: "B|00",
      style: "B",
      round: "00",
      plannerName: "정승아",
      incomingDate: "2026-05-27",
      shippingDate: "2026-05-28",
      validationStatus: "ok"
    },
    {
      key: "C|00|1",
      groupKey: "C|00",
      style: "C",
      round: "00",
      plannerName: "김가영",
      incomingDate: "2026-06-01",
      shippingDate: "2026-06-02",
      validationStatus: "needs_check"
    }
  ];

  assert.deepEqual(
    filterWeeklyItems(items, {
      startDate: "2026-05-19",
      endDate: "2026-05-21",
      plannerName: "김가영",
      issueOnly: true
    }).map((item) => item.key),
    ["A|00|1"]
  );

  assert.deepEqual(
    filterWeeklyItems(items, {
      startDate: "2026-06-02",
      endDate: "2026-06-08"
    }).map((item) => item.key),
    ["C|00|1"]
  );
});

test("resolveWeeklyLocalStorePath uses writable temporary storage on Vercel", () => {
  assert.equal(
    resolveWeeklyLocalStorePath({ VERCEL: "1" }, "/var/task"),
    join(tmpdir(), "mixxo-shipping-list", "weekly-accumulation.json")
  );
});
