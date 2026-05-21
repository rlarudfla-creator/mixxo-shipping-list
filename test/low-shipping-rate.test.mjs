import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLowShippingRateRows,
  createLowShippingRateWorkbook,
  filterLowShippingRateRows,
  toStyleShippingRates
} from "../low-shipping-rate.mjs";

test("toStyleShippingRates calculates cumulative shipped over cumulative incoming and flags 40 percent or lower", () => {
  const rows = [
    [
      "년도",
      "시즌",
      "BU(Now:단품) 스타일코드(Now)",
      "스타일코드(Now)",
      "[+] 누적입고량(물류+입고조정+브랜드간)",
      "[+] 출고량[출고-반품](매장+고객+샘플+브랜드간+폐기)"
    ],
    ["2026", "2", "MIWLOW100", "낮은 스타일", "1,000", "400"],
    ["2026", "2", "MIWHIGH200", "높은 스타일", "1,000", "401"],
    ["2026", "2", "MIWZERO300", "입고 없음", "0", "0"],
    ["2026", "2", "MIWBLANK400", "입고 빈칸", "", "100"]
  ];

  const rates = toStyleShippingRates(rows);

  assert.equal(rates.get("LOW100").shippingIncomingRate, 0.4);
  assert.equal(rates.get("LOW100").lowShippingRate, true);
  assert.equal(rates.get("HIGH200").lowShippingRate, false);
  assert.equal(rates.get("ZERO300").biCheckNeeded, true);
  assert.equal(rates.get("BLANK400").biCheckNeeded, true);
});

test("buildLowShippingRateRows groups weekly schedules by style and keeps only low rate styles", () => {
  const weeklyItems = [
    {
      key: "MIWLOW100|00|1",
      style: "MIWLOW100",
      round: "00",
      groupKey: "MIWLOW100|00",
      plannerName: "김가영",
      incomingStatus: "미입고",
      incomingDate: "2026-05-20",
      incomingQuantity: 200,
      excluded: false
    },
    {
      key: "MIWLOW100|00|2",
      style: "MIWLOW100",
      round: "00",
      groupKey: "MIWLOW100|00",
      plannerName: "김가영",
      incomingStatus: "미입고",
      incomingDate: "2026-05-27",
      incomingQuantity: 300,
      excluded: false
    },
    {
      key: "MIWLOW100|00|3",
      style: "MIWLOW100",
      round: "00",
      groupKey: "MIWLOW100|00",
      plannerName: "김가영",
      incomingStatus: "미입고",
      incomingType: "period",
      incomingPeriod: "2주뒤",
      incomingDate: "",
      incomingQuantity: 100,
      excluded: false
    },
    {
      key: "MIWLOW100|01|1",
      style: "MIWLOW100",
      round: "01",
      groupKey: "MIWLOW100|01",
      plannerName: "김가영",
      incomingStatus: "파샬입고중",
      incomingDate: "2026-06-03",
      incomingQuantity: 100,
      excluded: false
    },
    {
      key: "MIWHIGH200|00|1",
      style: "MIWHIGH200",
      round: "00",
      groupKey: "MIWHIGH200|00",
      plannerName: "정승아",
      incomingStatus: "입고완료",
      incomingDate: "2026-05-20",
      incomingQuantity: 100,
      excluded: false
    }
  ];
  const rates = new Map([
    ["LOW100", {
      style: "MIWLOW100",
      cumulativeIncomingQuantity: 1000,
      cumulativeShippingQuantity: 400,
      shippingIncomingRate: 0.4,
      shippingIncomingRateText: "40.0%",
      lowShippingRate: true
    }],
    ["HIGH200", {
      style: "MIWHIGH200",
      cumulativeIncomingQuantity: 1000,
      cumulativeShippingQuantity: 700,
      shippingIncomingRate: 0.7,
      shippingIncomingRateText: "70.0%",
      lowShippingRate: false
    }]
  ]);

  const rows = buildLowShippingRateRows(weeklyItems, rates);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].style, "MIWLOW100");
  assert.equal(rows[0].round, "00, 01");
  assert.equal(rows[0].plannerName, "김가영");
  assert.equal(rows[0].incomingStatus, "미입고, 파샬입고중");
  assert.equal(rows[0].statusLabel, "낮은 출고율 확인필요");
  assert.equal(rows[0].scheduleSummary, "00차 2026-05-20 200장 / 00차 2026-05-27 300장 / 00차 2주뒤 100장 / 01차 2026-06-03 100장");
});

test("filterLowShippingRateRows supports planner and style search", () => {
  const rows = [
    { style: "MIWLOW100", plannerName: "김가영" },
    { style: "MIWLOW200", plannerName: "정승아" }
  ];

  assert.deepEqual(
    filterLowShippingRateRows(rows, { plannerName: "김가영", styleSearch: "100" }).map((row) => row.style),
    ["MIWLOW100"]
  );
});

test("createLowShippingRateWorkbook returns an xlsx buffer for the same rows", () => {
  const result = createLowShippingRateWorkbook([
    {
      style: "MIWLOW100",
      round: "00",
      plannerName: "김가영",
      incomingStatus: "미입고",
      cumulativeIncomingQuantity: 1000,
      cumulativeShippingQuantity: 400,
      shippingIncomingRateText: "40.0%",
      scheduleSummary: "2026-05-20 200장",
      statusLabel: "낮은 출고율 확인필요"
    }
  ]);

  assert.equal(result.fileName, "낮은출고율_확인필요.xlsx");
  assert.equal(result.buffer.subarray(0, 2).toString("utf8"), "PK");
});
