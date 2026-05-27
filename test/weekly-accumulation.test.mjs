import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWeeklyItemEdits,
  csvRowsToWeeklyItems,
  getDefaultShippingFields,
  mergeWeeklyAccumulated,
  parseWeeklyBoardRows,
  validateWeeklyItems,
  weeklyItemsToCsvRows
} from "../weekly-accumulation.mjs";

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

test("parseWeeklyBoardRows expands DQ to EH-before-core-product into dated incoming schedule rows", () => {
  const rows = [
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
      DR: "200",
      DS: "10,000",
      DT: "05-27",
      DU: "300",
      DV: "15,000"
    })
  ];

  const result = parseWeeklyBoardRows(rows, { referenceYear: 2026 });

  assert.equal(result.items.length, 2);
  assert.deepEqual(
    result.items.map((item) => ({
      key: item.key,
      style: item.style,
      round: item.round,
      plannerName: item.plannerName,
      incomingStatus: item.incomingStatus,
      remainingQuantity: item.remainingQuantity,
      orderQuantity: item.orderQuantity,
      incomingDate: item.incomingDate,
      incomingQuantity: item.incomingQuantity,
      incomingAmount: item.incomingAmount,
      shippingDate: item.shippingDate,
      shippingQuantity: item.shippingQuantity,
      shippingStores: item.shippingStores
    })),
    [
      {
        key: "MIWTEST100|00|1",
        style: "MIWTEST100",
        round: "00",
        plannerName: "김가영",
        incomingStatus: "미입고",
        remainingQuantity: 500,
        orderQuantity: 1000,
        incomingDate: "2026-05-20",
        incomingQuantity: 200,
        incomingAmount: 10000,
        shippingDate: "2026-05-21",
        shippingQuantity: 100,
        shippingStores: "상위매장"
      },
      {
        key: "MIWTEST100|00|2",
        style: "MIWTEST100",
        round: "00",
        plannerName: "김가영",
        incomingStatus: "미입고",
        remainingQuantity: 500,
        orderQuantity: 1000,
        incomingDate: "2026-05-27",
        incomingQuantity: 300,
        incomingAmount: 15000,
        shippingDate: "2026-05-28",
        shippingQuantity: 150,
        shippingStores: "상위매장"
      }
    ]
  );
  assert.equal(result.groups[0].plannedQuantity, 500);
  assert.equal(result.groups[0].remainingQuantity, 500);
  assert.equal(result.groups[0].accumulatedQuantity, 500);
  assert.equal(result.groups[0].orderQuantity, 1000);
  assert.equal(result.groups[0].validationStatus, "ok");
});

test("parseWeeklyBoardRows expands DZ-to-before-EH two-column period schedules", () => {
  const rows = [
    makeRow({ DZ: "2", EB: "3", ED: "4", EF: "5" }),
    makeRow(),
    makeRow(),
    makeRow({ C: "스타일", CA: "기획자명", DL: "입고여부", EH: "핵심상품" }),
    makeRow({
      C: "MIWTEST200",
      D: "1",
      CA: "정다은",
      DH: "7800",
      DJ: "3900",
      DL: "미입고",
      DQ: "05-20",
      DR: "200",
      DS: "10",
      DT: "05-27",
      DU: "300",
      DV: "15",
      DW: "05-29",
      DX: "400",
      DY: "20",
      DZ: "700",
      EA: "35",
      EB: "800",
      EC: "40",
      ED: "",
      EE: "0",
      EF: "1500",
      EG: "75"
    })
  ];

  const result = parseWeeklyBoardRows(rows, { referenceYear: 2026 });

  assert.equal(result.items.length, 6);
  assert.deepEqual(
    result.items.map((item) => ({
      key: item.key,
      groupNumber: item.groupNumber,
      incomingType: item.incomingType,
      incomingPeriod: item.incomingPeriod,
      incomingDate: item.incomingDate,
      incomingQuantity: item.incomingQuantity,
      incomingAmount: item.incomingAmount,
      shippingDate: item.shippingDate,
      shippingQuantity: item.shippingQuantity
    })),
    [
      {
        key: "MIWTEST200|01|1",
        groupNumber: 1,
        incomingType: "dated",
        incomingPeriod: "",
        incomingDate: "2026-05-20",
        incomingQuantity: 200,
        incomingAmount: 10,
        shippingDate: "2026-05-21",
        shippingQuantity: 100
      },
      {
        key: "MIWTEST200|01|2",
        groupNumber: 2,
        incomingType: "dated",
        incomingPeriod: "",
        incomingDate: "2026-05-27",
        incomingQuantity: 300,
        incomingAmount: 15,
        shippingDate: "2026-05-28",
        shippingQuantity: 150
      },
      {
        key: "MIWTEST200|01|3",
        groupNumber: 3,
        incomingType: "dated",
        incomingPeriod: "",
        incomingDate: "2026-05-29",
        incomingQuantity: 400,
        incomingAmount: 20,
        shippingDate: "2026-06-01",
        shippingQuantity: 200
      },
      {
        key: "MIWTEST200|01|4",
        groupNumber: 4,
        incomingType: "period",
        incomingPeriod: "2주뒤",
        incomingDate: "",
        incomingQuantity: 700,
        incomingAmount: 35,
        shippingDate: "",
        shippingQuantity: 350
      },
      {
        key: "MIWTEST200|01|5",
        groupNumber: 5,
        incomingType: "period",
        incomingPeriod: "3주뒤",
        incomingDate: "",
        incomingQuantity: 800,
        incomingAmount: 40,
        shippingDate: "",
        shippingQuantity: 400
      },
      {
        key: "MIWTEST200|01|7",
        groupNumber: 7,
        incomingType: "period",
        incomingPeriod: "5주뒤",
        incomingDate: "",
        incomingQuantity: 1500,
        incomingAmount: 75,
        shippingDate: "",
        shippingQuantity: 750
      }
    ]
  );
  assert.equal(result.groups[0].plannedQuantity, 3900);
  assert.equal(result.groups[0].remainingQuantity, 3900);
  assert.equal(result.groups[0].accumulatedQuantity, 3900);
  assert.equal(result.groups[0].orderQuantity, 7800);
  assert.equal(result.groups[0].validationStatus, "ok");
});

test("parseWeeklyBoardRows skips summary rows that are not style codes", () => {
  const rows = [
    makeRow({ DZ: "2" }),
    makeRow(),
    makeRow({
      C: "2",
      D: "03",
      CA: "78",
      DH: "110",
      DJ: "112",
      DL: "114",
      DQ: "05-20",
      DR: "1",
      DZ: "2"
    }),
    makeRow({ C: "스타일", CA: "기획자명", DL: "입고여부", EH: "핵심상품" }),
    makeRow({
      C: "MIWVALID100",
      D: "0",
      CA: "김가영",
      DH: "1400",
      DJ: "700",
      DL: "미입고",
      DZ: "700",
      EA: "35"
    })
  ];

  const result = parseWeeklyBoardRows(rows, { referenceYear: 2026 });

  assert.deepEqual(result.items.map((item) => item.style), ["MIWVALID100"]);
  assert.equal(result.items[0].incomingType, "period");
  assert.equal(result.items[0].incomingPeriod, "2주뒤");
});

test("getDefaultShippingFields creates editable shipping defaults from incoming schedules", () => {
  assert.deepEqual(
    getDefaultShippingFields({ incomingDate: "2026-06-01", incomingQuantity: 987 }),
    { shippingDate: "2026-06-02", shippingQuantity: 494, shippingStores: "전매장" }
  );
  assert.equal(getDefaultShippingFields({ incomingDate: "2026-06-04", incomingQuantity: 600 }).shippingDate, "2026-06-05");
  assert.equal(getDefaultShippingFields({ incomingDate: "2026-06-05", incomingQuantity: 600 }).shippingDate, "2026-06-08");
  assert.equal(getDefaultShippingFields({ incomingDate: "2026-06-06", incomingQuantity: 600 }).shippingDate, "2026-06-08");
  assert.equal(getDefaultShippingFields({ incomingDate: "2026-06-07", incomingQuantity: 600 }).shippingDate, "2026-06-08");
  assert.equal(getDefaultShippingFields({ incomingDate: "2026-06-01", incomingQuantity: 600 }).shippingStores, "상위매장");
  assert.equal(getDefaultShippingFields({ incomingDate: "2026-06-01", incomingQuantity: 602 }).shippingStores, "전매장");
});

test("mergeWeeklyAccumulated overwrites changed keys, skips identical rows, adds new rows, and preserves previous rows", () => {
  const existing = [
    {
      key: "MIWTEST100|00|1",
      groupKey: "MIWTEST100|00",
      style: "MIWTEST100",
      round: "00",
      groupNumber: 1,
      incomingDate: "2026-05-20",
      incomingQuantity: 150,
      remainingQuantity: 500,
      orderQuantity: 1000,
      sourceStatus: "current",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    },
    {
      key: "MIWTEST100|00|2",
      groupKey: "MIWTEST100|00",
      style: "MIWTEST100",
      round: "00",
      groupNumber: 2,
      incomingDate: "2026-05-27",
      incomingQuantity: 300,
      remainingQuantity: 500,
      orderQuantity: 1000,
      sourceStatus: "current",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    },
    {
      key: "MIWOLD200|00|1",
      groupKey: "MIWOLD200|00",
      style: "MIWOLD200",
      round: "00",
      groupNumber: 1,
      incomingDate: "2026-05-13",
      incomingQuantity: 100,
      remainingQuantity: 100,
      orderQuantity: 200,
      sourceStatus: "current"
    }
  ];
  const snapshot = [
    {
      key: "MIWTEST100|00|1",
      groupKey: "MIWTEST100|00",
      style: "MIWTEST100",
      round: "00",
      groupNumber: 1,
      incomingDate: "2026-05-20",
      incomingQuantity: 200,
      remainingQuantity: 500,
      orderQuantity: 1000
    },
    {
      key: "MIWTEST100|00|2",
      groupKey: "MIWTEST100|00",
      style: "MIWTEST100",
      round: "00",
      groupNumber: 2,
      incomingDate: "2026-05-27",
      incomingQuantity: 300,
      remainingQuantity: 500,
      orderQuantity: 1000
    },
    {
      key: "MIWTEST100|00|3",
      groupKey: "MIWTEST100|00",
      style: "MIWTEST100",
      round: "00",
      groupNumber: 3,
      incomingDate: "2026-06-03",
      incomingQuantity: 50,
      remainingQuantity: 500,
      orderQuantity: 1000
    }
  ];

  const result = mergeWeeklyAccumulated(existing, snapshot, { now: "2026-05-20T00:00:00.000Z" });

  assert.deepEqual(result.summary, {
    added: 1,
    updated: 1,
    unchanged: 1,
    preserved: 1,
    needsCheck: 0
  });
  assert.equal(result.items.find((item) => item.key === "MIWTEST100|00|1").incomingQuantity, 200);
  assert.equal(result.items.find((item) => item.key === "MIWOLD200|00|1").sourceStatus, "previous");
});

test("mergeWeeklyAccumulated preserves user-edited shipping fields across weekly board updates", () => {
  const existing = [
    {
      key: "MIWTEST100|00|1",
      groupKey: "MIWTEST100|00",
      style: "MIWTEST100",
      round: "00",
      groupNumber: 1,
      incomingDate: "2026-06-01",
      incomingQuantity: 987,
      remainingQuantity: 987,
      shippingDate: "2026-06-04",
      shippingQuantity: 300,
      shippingStores: "상위매장",
      sourceStatus: "current"
    }
  ];
  const snapshot = [
    {
      key: "MIWTEST100|00|1",
      groupKey: "MIWTEST100|00",
      style: "MIWTEST100",
      round: "00",
      groupNumber: 1,
      incomingDate: "2026-06-01",
      incomingQuantity: 1000,
      remainingQuantity: 1000
    }
  ];

  const result = mergeWeeklyAccumulated(existing, snapshot, { now: "2026-05-21T00:00:00.000Z" });
  const item = result.items[0];

  assert.equal(item.incomingQuantity, 1000);
  assert.equal(item.shippingDate, "2026-06-04");
  assert.equal(item.shippingQuantity, 300);
  assert.equal(item.shippingStores, "상위매장");
});

test("mergeWeeklyAccumulated preserves period-row shipping edits across weekly board updates", () => {
  const existing = [
    {
      key: "MIWTEST200|01|4",
      groupKey: "MIWTEST200|01",
      style: "MIWTEST200",
      round: "01",
      groupNumber: 4,
      incomingType: "period",
      incomingPeriod: "2주뒤",
      incomingDate: "",
      incomingQuantity: 700,
      remainingQuantity: 900,
      shippingDate: "2026-06-09",
      shippingQuantity: 350,
      shippingStores: "전매장",
      sourceStatus: "current"
    }
  ];
  const snapshot = [
    {
      key: "MIWTEST200|01|4",
      groupKey: "MIWTEST200|01",
      style: "MIWTEST200",
      round: "01",
      groupNumber: 4,
      incomingType: "period",
      incomingPeriod: "2주뒤",
      incomingDate: "",
      incomingQuantity: 900,
      remainingQuantity: 900
    }
  ];

  const result = mergeWeeklyAccumulated(existing, snapshot, { now: "2026-05-21T00:00:00.000Z" });
  const item = result.items[0];

  assert.equal(item.incomingQuantity, 900);
  assert.equal(item.shippingDate, "2026-06-09");
  assert.equal(item.shippingQuantity, 350);
  assert.equal(item.shippingStores, "전매장");
});

test("mergeWeeklyAccumulated drops accumulated rows that are not real style codes", () => {
  const existing = [
    { key: "2|03|4", style: "2", round: "03", incomingType: "period", incomingPeriod: "2주뒤", incomingQuantity: 2 },
    { key: "MIWKEEP100|00|1", style: "MIWKEEP100", round: "00", incomingDate: "2026-05-20", incomingQuantity: 100 }
  ];
  const snapshot = [
    { key: "MIWKEEP100|00|1", style: "MIWKEEP100", round: "00", incomingDate: "2026-05-20", incomingQuantity: 100 }
  ];

  const { items, summary } = mergeWeeklyAccumulated(existing, snapshot, {
    now: "2026-05-21T00:00:00.000Z"
  });

  assert.deepEqual(items.map((item) => item.key), ["MIWKEEP100|00|1"]);
  assert.equal(summary.preserved, 0);
});

test("validateWeeklyItems compares incoming schedules against remaining quantity", () => {
  const items = [
    { key: "A|00|1", groupKey: "A|00", style: "A", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingQuantity: 250 },
    { key: "A|00|2", groupKey: "A|00", style: "A", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingQuantity: 250 },
    { key: "B|00|1", groupKey: "B|00", style: "B", round: "00", orderQuantity: 600, remainingQuantity: 300, incomingQuantity: 370 },
    { key: "C|00|1", groupKey: "C|00", style: "C", round: "00", orderQuantity: 100, remainingQuantity: null, incomingQuantity: 10 },
    { key: "D|00|1", groupKey: "D|00", style: "D", round: "00", orderQuantity: 200, remainingQuantity: 100, incomingQuantity: 100 },
    { key: "E|00|1", groupKey: "E|00", style: "E", round: "00", orderQuantity: null, remainingQuantity: 100, incomingQuantity: 100 }
  ];

  const result = validateWeeklyItems(items);

  assert.equal(result.groups.find((group) => group.groupKey === "A|00").validationStatus, "ok");
  assert.equal(result.groups.find((group) => group.groupKey === "B|00").validationStatus, "over");
  assert.equal(result.groups.find((group) => group.groupKey === "C|00").validationStatus, "remaining_missing");
  assert.equal(result.groups.find((group) => group.groupKey === "D|00").validationStatus, "ok");
  assert.equal(result.groups.find((group) => group.groupKey === "D|00").accumulatedQuantity, 100);
  assert.equal(result.groups.find((group) => group.groupKey === "E|00").validationStatus, "ok");
  assert.equal(result.needsCheckCount, 2);
});

test("validateWeeklyItems treats planned quantity within ten percent of remaining quantity as normal", () => {
  const result = validateWeeklyItems([
    { key: "A|00|1", groupKey: "A|00", style: "A", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingQuantity: 550 },
    { key: "B|00|1", groupKey: "B|00", style: "B", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingQuantity: 551 },
    { key: "C|00|1", groupKey: "C|00", style: "C", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingQuantity: 450 },
    { key: "D|00|1", groupKey: "D|00", style: "D", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingQuantity: 449 }
  ]);

  assert.equal(result.groups.find((group) => group.groupKey === "A|00").validationStatus, "ok");
  assert.equal(result.groups.find((group) => group.groupKey === "B|00").validationStatus, "over");
  assert.equal(result.groups.find((group) => group.groupKey === "C|00").validationStatus, "ok");
  assert.equal(result.groups.find((group) => group.groupKey === "D|00").validationStatus, "needs_check");
  assert.equal(result.needsCheckCount, 2);
});

test("validateWeeklyItems hides an acknowledged warning only while the validation signature matches", () => {
  const items = [
    { key: "A|00|1", groupKey: "A|00", style: "A", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingQuantity: 560 }
  ];
  const warning = validateWeeklyItems(items);
  const signature = warning.groups[0].validationSignature;

  assert.equal(warning.groups[0].validationStatus, "over");

  const acknowledged = validateWeeklyItems(items.map((item) => ({
    ...item,
    validationAcknowledged: true,
    validationSignature: signature
  })));
  assert.equal(acknowledged.groups[0].validationStatus, "ok");
  assert.equal(acknowledged.groups[0].validationLabel, "확인 완료");
  assert.equal(acknowledged.needsCheckCount, 0);

  const changed = validateWeeklyItems([{
    ...items[0],
    incomingQuantity: 570,
    validationAcknowledged: true,
    validationSignature: signature
  }]);
  assert.equal(changed.groups[0].validationStatus, "over");
});

test("applyWeeklyItemEdits updates quantities and excludes rows before validation", () => {
  const items = [
    { key: "A|00|1", groupKey: "A|00", style: "A", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingQuantity: 200 },
    { key: "A|00|2", groupKey: "A|00", style: "A", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingQuantity: 200 }
  ];

  const edited = applyWeeklyItemEdits(items, [
    { key: "A|00|2", incomingQuantity: 300, note: "수량 수정" }
  ], { now: "2026-05-20T00:00:00.000Z" });
  const validation = validateWeeklyItems(edited);

  assert.equal(edited.find((item) => item.key === "A|00|2").incomingQuantity, 300);
  assert.equal(edited.find((item) => item.key === "A|00|2").note, "수량 수정");
  assert.equal(validation.groups[0].validationStatus, "ok");

  const excluded = applyWeeklyItemEdits(edited, [{ key: "A|00|2", excluded: true }]);
  const excludedValidation = validateWeeklyItems(excluded);

  assert.equal(excluded.find((item) => item.key === "A|00|2").excluded, true);
  assert.equal(excludedValidation.groups[0].plannedQuantity, 200);
});

test("applyWeeklyItemEdits saves editable shipping fields", () => {
  const items = [
    { key: "A|00|1", groupKey: "A|00", style: "A", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingDate: "2026-06-01", incomingQuantity: 500 }
  ];

  const edited = applyWeeklyItemEdits(items, [
    { key: "A|00|1", shippingDate: "2026-06-03", shippingQuantity: "240", shippingStores: "상위매장" }
  ], { now: "2026-05-21T02:00:00.000Z" });

  assert.equal(edited[0].shippingDate, "2026-06-03");
  assert.equal(edited[0].shippingQuantity, 240);
  assert.equal(edited[0].shippingStores, "상위매장");
  assert.equal(edited[0].updatedAt, "2026-05-21T02:00:00.000Z");
});

test("applyWeeklyItemEdits saves validation acknowledgement fields", () => {
  const items = [
    { key: "A|00|1", groupKey: "A|00", style: "A", round: "00", orderQuantity: 1000, remainingQuantity: 500, incomingQuantity: 650 }
  ];

  const edited = applyWeeklyItemEdits(items, [
    { key: "A|00|1", validationAcknowledged: true, validationSignature: "over|1000|500|650|1150" }
  ]);

  assert.equal(edited[0].validationAcknowledged, true);
  assert.equal(edited[0].validationSignature, "over|1000|500|650|1150");

  const cleared = applyWeeklyItemEdits(edited, [
    { key: "A|00|1", validationAcknowledged: false, validationSignature: "over|1000|500|650|1150" }
  ]);

  assert.equal(cleared[0].validationAcknowledged, false);
  assert.equal(cleared[0].validationSignature, "over|1000|500|650|1150");
});

test("weekly csv rows preserve validation acknowledgement fields", () => {
  const rows = weeklyItemsToCsvRows([
    {
      key: "A|00|1",
      groupKey: "A|00",
      style: "A",
      round: "00",
      validationAcknowledged: true,
      validationSignature: "over|1000|500|650|1150"
    }
  ]);
  const parsed = csvRowsToWeeklyItems(rows);

  assert.equal(rows[0].includes("validationAcknowledged"), true);
  assert.equal(rows[0].includes("validationSignature"), true);
  assert.equal(parsed[0].validationAcknowledged, true);
  assert.equal(parsed[0].validationSignature, "over|1000|500|650|1150");
});

test("applyWeeklyItemEdits treats remaining quantity as a style-round group value", () => {
  const items = [
    { key: "A|00|1", groupKey: "A|00", style: "A", round: "00", orderQuantity: 7000, remainingQuantity: 3500, incomingQuantity: 1500 },
    { key: "A|00|2", groupKey: "A|00", style: "A", round: "00", orderQuantity: 7000, remainingQuantity: 3500, incomingQuantity: 2000 }
  ];

  const edited = applyWeeklyItemEdits(items, [
    { key: "A|00|2", remainingQuantity: "3400" }
  ], { now: "2026-05-21T03:00:00.000Z" });

  assert.deepEqual(edited.map((item) => item.remainingQuantity), [3400, 3400]);
  assert.deepEqual(edited.map((item) => item.updatedAt), [
    "2026-05-21T03:00:00.000Z",
    "2026-05-21T03:00:00.000Z"
  ]);
});

test("applyWeeklyItemEdits marks selected rows as shipping confirmed", () => {
  const items = [
    { key: "A|00|1", groupKey: "A|00", style: "A", round: "00", remainingQuantity: 500, incomingQuantity: 200 },
    { key: "A|00|2", groupKey: "A|00", style: "A", round: "00", remainingQuantity: 500, incomingQuantity: 300 }
  ];

  const confirmed = applyWeeklyItemEdits(items, [
    { key: "A|00|1", excluded: true, shippingConfirmed: true }
  ], { now: "2026-05-21T00:00:00.000Z" });
  const confirmedItem = confirmed.find((item) => item.key === "A|00|1");
  const validation = validateWeeklyItems(confirmed);

  assert.equal(confirmedItem.excluded, true);
  assert.equal(confirmedItem.shippingConfirmed, true);
  assert.equal(confirmedItem.updatedAt, "2026-05-21T00:00:00.000Z");
  assert.equal(validation.groups[0].plannedQuantity, 300);
});

test("applyWeeklyItemEdits cancels shipping confirmation only for edited rows", () => {
  const items = [
    { key: "A|00|1", groupKey: "A|00", style: "A", round: "00", remainingQuantity: 500, incomingQuantity: 200, excluded: true, shippingConfirmed: true },
    { key: "A|00|2", groupKey: "A|00", style: "A", round: "00", remainingQuantity: 500, incomingQuantity: 300, excluded: true, shippingConfirmed: true }
  ];

  const edited = applyWeeklyItemEdits(items, [
    { key: "A|00|1", excluded: false, shippingConfirmed: false }
  ], { now: "2026-05-21T01:00:00.000Z" });
  const canceled = edited.find((item) => item.key === "A|00|1");
  const untouched = edited.find((item) => item.key === "A|00|2");
  const validation = validateWeeklyItems(edited);

  assert.equal(canceled.excluded, false);
  assert.equal(canceled.shippingConfirmed, false);
  assert.equal(canceled.updatedAt, "2026-05-21T01:00:00.000Z");
  assert.equal(untouched.excluded, true);
  assert.equal(untouched.shippingConfirmed, true);
  assert.equal(validation.groups[0].plannedQuantity, 200);
});

test("weekly csv rows preserve shipping confirmed status, editable shipping fields, and period metadata", () => {
  const rows = weeklyItemsToCsvRows([
    {
      key: "A|00|1",
      groupKey: "A|00",
      style: "A",
      round: "00",
      groupNumber: 1,
      incomingType: "period",
      incomingPeriod: "2주뒤",
      orderQuantity: 700,
      remainingQuantity: 500,
      incomingDate: "",
      incomingQuantity: 200,
      shippingDate: "2026-06-02",
      shippingQuantity: 100,
      shippingStores: "상위매장",
      sourceStatus: "current",
      excluded: true,
      shippingConfirmed: true
    }
  ]);

  const parsed = csvRowsToWeeklyItems(rows);

  assert.equal(rows[0].includes("shippingConfirmed"), true);
  assert.equal(rows[0].includes("shippingDate"), true);
  assert.equal(rows[0].includes("incomingType"), true);
  assert.equal(rows[0].includes("orderQuantity"), true);
  assert.equal(parsed[0].shippingConfirmed, true);
  assert.equal(parsed[0].orderQuantity, 700);
  assert.equal(parsed[0].incomingType, "period");
  assert.equal(parsed[0].incomingPeriod, "2주뒤");
  assert.equal(parsed[0].shippingDate, "2026-06-02");
  assert.equal(parsed[0].shippingQuantity, 100);
  assert.equal(parsed[0].shippingStores, "상위매장");
});
