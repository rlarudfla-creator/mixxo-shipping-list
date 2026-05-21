import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("weekly bulk header exposes confirm and cancel-confirm controls without a clear button", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.equal(script.includes("weekly-clear-selection"), false);
  assert.equal(script.includes("weekly-cancel-confirm"), true);
  assert.equal(script.includes("확정 취소"), true);
  assert.equal(script.includes("cancelSelectedWeeklyConfirmations"), true);
});

test("weekly authoring UI renders period rows and blocks confirmation without shipping dates", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.equal(script.includes('row.incomingType === "period"'), true);
  assert.equal(script.includes("incomingPeriod"), true);
  assert.equal(script.includes("출고일자가 비어있는 행"), true);
  assert.equal(script.includes("출고일자 확인 필요"), true);
  assert.equal(script.includes("const rowsToConfirm = selectedRows;"), true);
  assert.equal(script.includes("selectedStyles"), false);
});

test("weekly authoring UI supports date-based selection and skips rows without shipping dates", async () => {
  const handler = await readFile(new URL("../app-handler.mjs", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.equal(handler.includes('id="weekly-shipping-date-select"'), true);
  assert.equal(handler.includes("출고일자별 선택"), true);
  assert.equal(script.includes("weeklyShippingDateSelect"), true);
  assert.equal(script.includes("selectWeeklyRowsByShippingDate"), true);
  assert.equal(script.includes("isWeeklyRowSelectable"), true);
  assert.equal(script.includes("출고일자를 먼저 입력해주세요."), true);
  assert.match(script, /setWeeklyExcludedSelection[\s\S]+isWeeklyRowSelectable/);
});

test("weekly authoring UI supports style search, column filters, sorting, and two-way scrolling", async () => {
  const handler = await readFile(new URL("../app-handler.mjs", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/app.css", import.meta.url), "utf8");

  assert.equal(handler.includes("weekly-column-filters"), false);
  assert.equal(handler.includes('id="weekly-style-search"'), false);
  assert.equal(handler.includes('id="weekly-planner-filter"'), false);
  assert.equal(handler.includes('id="weekly-shipping-date-select"'), true);
  assert.equal(script.includes("appendWeeklyHeaderFilter"), true);
  assert.equal(script.includes("bindWeeklyColumnFilterInputs"), true);
  assert.equal(script.includes("weekly-header-filter"), true);
  assert.equal(script.includes("weekly-header-content"), true);
  assert.equal(script.includes('filterType: "date"'), true);
  assert.equal(script.includes('input.type = column.filterType === "date" ? "date" : "search";'), true);
  for (const id of [
    "weekly-style-search",
    "weekly-filter-planner",
    "weekly-filter-validation",
    "weekly-filter-incoming",
    "weekly-filter-shipping-date",
    "weekly-filter-shipping-quantity",
    "weekly-filter-shipping-stores",
    "weekly-filter-status",
    "weekly-scroll-top",
    "weekly-table-wrap"
  ]) {
    assert.equal(script.includes(id), true);
  }
  assert.equal(script.includes("weeklyTableFilterState"), true);
  assert.equal(script.includes("applyWeeklyTableFiltersAndSort"), true);
  assert.equal(script.includes("showRemainingQuantityInput"), true);
  assert.equal(script.includes("getWeeklyGroupRemainingValues"), true);
  assert.equal(script.includes("accumulatedQuantity"), true);
  assert.equal(script.includes("총잔량"), false);
  assert.equal(script.includes("toggleWeeklySort"), true);
  assert.equal(script.includes("syncWeeklyScrollbars"), true);
  assert.equal(script.includes("weekly-sort-button"), true);
  assert.equal(styles.includes(".weekly-column-filters"), false);
  assert.equal(styles.includes(".weekly-header-filter"), true);
  assert.equal(styles.includes(".weekly-scroll-top"), true);
  assert.equal(styles.includes("position: sticky"), true);
  assert.equal(styles.includes("max-height: min(64vh, 640px)"), true);
});

test("main page uses top-level week selector and renamed shipping-list authoring tab", async () => {
  const handler = await readFile(new URL("../app-handler.mjs", import.meta.url), "utf8");
  const firstWeekButtons = handler.indexOf('id="week-buttons"');
  const summaryView = handler.indexOf('id="summary-view"');

  assert.ok(firstWeekButtons > 0);
  assert.ok(summaryView > 0);
  assert.ok(firstWeekButtons < summaryView);
  assert.equal(handler.includes('data-view="weekly">출고리스트 작성</button>'), true);
  assert.equal(handler.includes('data-view="weekly">주간납기 누적</button>'), false);
});
