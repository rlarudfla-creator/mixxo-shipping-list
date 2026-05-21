import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAvailableWeeks,
  buildSummary,
  CONFIRMED_SHIPPING_START_DATE,
  formatConfirmedShippingWeekLabel,
  mergeShippingSourceRecords,
  weeklyItemsToShippingRecords
} from "../shipping-core.mjs";

test("confirmed shipping source starts at the 2026 May week 4 shipping list", () => {
  assert.equal(CONFIRMED_SHIPPING_START_DATE, "2026-05-26");
  assert.equal(formatConfirmedShippingWeekLabel("2026-05-26"), "5월 4주차");
  assert.equal(formatConfirmedShippingWeekLabel("2026-06-01"), "5월 4주차");
  assert.equal(formatConfirmedShippingWeekLabel("2026-06-02"), "6월 1주차");
  assert.equal(formatConfirmedShippingWeekLabel("2026-06-08"), "6월 1주차");
  assert.equal(formatConfirmedShippingWeekLabel("2026-06-09"), "6월 2주차");
});

test("available weeks show previous two, current, and next three weeks from today's week", () => {
  const weeks = buildAvailableWeeks([], 2026, { today: new Date(2026, 4, 21) });

  assert.deepEqual(
    weeks.map(({ label, startDate, endDate, relativeWeek, isFuture }) => ({
      label,
      startDate,
      endDate,
      relativeWeek,
      isFuture
    })),
    [
      { label: "5월 1주차", startDate: "2026-05-05", endDate: "2026-05-11", relativeWeek: -2, isFuture: false },
      { label: "5월 2주차", startDate: "2026-05-12", endDate: "2026-05-18", relativeWeek: -1, isFuture: false },
      { label: "5월 3주차", startDate: "2026-05-19", endDate: "2026-05-25", relativeWeek: 0, isFuture: false },
      { label: "5월 4주차", startDate: "2026-05-26", endDate: "2026-06-01", relativeWeek: 1, isFuture: true },
      { label: "6월 1주차", startDate: "2026-06-02", endDate: "2026-06-08", relativeWeek: 2, isFuture: true },
      { label: "6월 2주차", startDate: "2026-06-09", endDate: "2026-06-15", relativeWeek: 3, isFuture: true }
    ]
  );
});

test("summary uses the generated week label so the active week button matches", () => {
  const availableWeeks = buildAvailableWeeks([], 2026, { today: new Date(2026, 4, 21) });
  const summary = buildSummary([
    {
      __raw: ["", "5월3주"],
      "출고일자": "05월 21일",
      "출고수량\n(*50%)": 100,
      "구분": "상의"
    }
  ], new Date(2026, 4, 21), new Map(), availableWeeks);

  assert.equal(summary.weekLabel, "5월 3주차");
});

test("summary labels an empty confirmed-source week as May week 4", () => {
  const summary = buildSummary([], new Date(2026, 4, 26), new Map(), [
    {
      label: "5월 4주차",
      startDate: "2026-05-26",
      endDate: "2026-06-01"
    }
  ]);

  assert.equal(summary.weekLabel, "5월 4주차");
});

test("weeklyItemsToShippingRecords converts confirmed weekly rows to existing shipping-list records", () => {
  const records = weeklyItemsToShippingRecords([
    {
      key: "MIWTEST100|00|1",
      style: "MIWTEST100",
      round: "00",
      incomingDate: "2026-06-01",
      shippingDate: "2026-06-02",
      shippingQuantity: 494,
      shippingStores: "전매장",
      note: "확인",
      excluded: true,
      shippingConfirmed: true
    },
    {
      key: "MIWTEST200|00|1",
      style: "MIWTEST200",
      round: "00",
      incomingDate: "2026-06-01",
      shippingDate: "2026-06-02",
      shippingQuantity: 100,
      shippingStores: "상위매장",
      shippingConfirmed: false
    }
  ], {
    styleNames: new Map([["TEST100", "테스트 스타일"]])
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].__raw[1], "6월 1주차");
  assert.equal(records[0]["출고일자"], "06월 02일");
  assert.equal(records[0]["입고일자"], "06월 01일");
  assert.equal(records[0]["스타일"], "MIWTEST100");
  assert.equal(records[0]["스타일명"], "테스트 스타일");
  assert.equal(records[0]["★차수 구분 기입 차수"], "00");
  assert.equal(records[0]["출고수량\n(*50%)"], 494);
  assert.equal(records[0]["출고매장"], "전매장");
  assert.equal(records[0]["비고"], "확인");
});

test("mergeShippingSourceRecords keeps old source before 2026-05-26 and confirmed source from 2026-05-26 onward", () => {
  const legacyRecords = [
    { __raw: ["", "5월 3주차"], "출고일자": "05월 25일", "스타일": "MIWOLD100" },
    { __raw: ["", "5월 4주차"], "출고일자": "05월 29일", "스타일": "MIWLEGACY400" },
    { __raw: ["", "6월 1주차"], "출고일자": "06월 02일", "스타일": "MIWLEGACY200" }
  ];
  const confirmedRecords = [
    { __raw: ["", "5월 4주차"], "출고일자": "05월 29일", "스타일": "MIWNEW400" },
    { __raw: ["", "6월 1주차"], "출고일자": "06월 02일", "스타일": "MIWNEW300" },
    { __raw: ["", "5월 3주차"], "출고일자": "05월 25일", "스타일": "MIWIGNORED300" }
  ];

  const merged = mergeShippingSourceRecords(legacyRecords, confirmedRecords, { year: 2026 });

  assert.deepEqual(merged.map((record) => record["스타일"]), ["MIWOLD100", "MIWNEW400", "MIWNEW300"]);
});
