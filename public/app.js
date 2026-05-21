const startDateInput = document.querySelector("#start-date");
const endDateInput = document.querySelector("#end-date");
const refreshButton = document.querySelector("#refresh");
const downloadButton = document.querySelector("#download");
const statusBox = document.querySelector("#status");
const tableHead = document.querySelector("#table-head");
const tableBody = document.querySelector("#table-body");
const weeklySummaryHead = document.querySelector("#weekly-summary-head");
const weeklySummaryBody = document.querySelector("#weekly-summary-body");
const capacityAlert = document.querySelector("#capacity-alert");
const weekButtons = document.querySelector("#week-buttons");
const viewTabs = document.querySelectorAll(".view-tab");
const viewPanels = document.querySelectorAll(".view-panel");
const shippingDateFilter = document.querySelector("#shipping-date-filter");
const shippingDateFilterButton = document.querySelector("#shipping-date-filter-button");
const shippingDateFilterMenu = document.querySelector("#shipping-date-filter-menu");
const categoryFilter = document.querySelector("#category-filter");
const categoryFilterButton = document.querySelector("#category-filter-button");
const categoryFilterMenu = document.querySelector("#category-filter-menu");
const itemFilter = document.querySelector("#item-filter");
const itemFilterButton = document.querySelector("#item-filter-button");
const itemFilterMenu = document.querySelector("#item-filter-menu");
const itemSearchInput = document.querySelector("#item-search");
const styleSearchInput = document.querySelector("#style-search");
const clearFiltersButton = document.querySelector("#clear-filters");
const detailCount = document.querySelector("#detail-count");
const weeklySyncButton = document.querySelector("#weekly-sync");
const weeklyRefreshButton = document.querySelector("#weekly-refresh");
const weeklySaveEditsButton = document.querySelector("#weekly-save-edits");
const weeklyShippingDateSelect = document.querySelector("#weekly-shipping-date-select");
const weeklySyncSummary = document.querySelector("#weekly-sync-summary");
const weeklyCount = document.querySelector("#weekly-count");
const weeklyTableHead = document.querySelector("#weekly-table-head");
const weeklyTableBody = document.querySelector("#weekly-table-body");
const weeklyScrollTop = document.querySelector("#weekly-scroll-top");
const weeklyScrollTopInner = document.querySelector("#weekly-scroll-top-inner");
const weeklyTableWrap = document.querySelector("#weekly-table-wrap");
const lowRateRefreshButton = document.querySelector("#low-rate-refresh");
const lowRateDownloadButton = document.querySelector("#low-rate-download");
const lowRatePlannerFilter = document.querySelector("#low-rate-planner-filter");
const lowRateStyleSearchInput = document.querySelector("#low-rate-style-search");
const lowRateCount = document.querySelector("#low-rate-count");
const lowRateBadge = document.querySelector("#low-rate-badge");
const lowRateTableHead = document.querySelector("#low-rate-table-head");
const lowRateTableBody = document.querySelector("#low-rate-table-body");

const FALLBACK_COLUMNS = [
  { key: "shippingDate", header: "출고일자", sortable: true },
  { key: "style", header: "스타일", sortable: true },
  { key: "itemCategory", header: "구분", sortable: true },
  { key: "itemDisplay", header: "아이템" },
  { key: "styleName", header: "스타일명" },
  { key: "round", header: "차수", actionable: true },
  { key: "quantity", header: "출고수량" },
  { key: "stores", header: "출고매장" },
  { key: "note", header: "비고" }
];

let latestRows = [];
let latestColumns = FALLBACK_COLUMNS;
let expandedRowId = "";
let sortState = { key: "shippingDate", direction: "asc" };
let endDateFollowsStart = true;
let selectedShippingDates = new Set();
let selectedCategories = new Set();
let selectedItemCodes = new Set();
let shippingDateOptions = [];
let categoryOptions = [];
let itemOptions = [];
let weeklyRows = [];
let weeklyLoaded = false;
let weeklySelectAllInput = null;
let weeklyConfirmSelectedButton = null;
let weeklyCancelConfirmButton = null;
let lowRateRows = [];
let lowRateLoaded = false;
let weeklyLastData = null;
let weeklyColumnFilterInputs = [];
let weeklyTableFilterState = {
  validationLabel: "",
  style: "",
  plannerName: "",
  incomingSchedule: "",
  shippingDate: "",
  shippingQuantity: "",
  shippingStores: "",
  statusLabel: ""
};
let weeklySortState = { key: "", direction: "asc" };
let weeklyScrollSyncing = false;

const WEEKLY_TABLE_COLUMNS = [
  {
    header: "확인상태",
    sortKey: "validationLabel",
    filterKey: "validationLabel",
    filterType: "select",
    filterId: "weekly-filter-validation"
  },
  {
    header: "스타일",
    sortKey: "style",
    filterKey: "style",
    filterType: "search",
    filterId: "weekly-style-search",
    placeholder: "스타일 검색"
  },
  { header: "차수" },
  {
    header: "기획자명",
    sortKey: "plannerName",
    filterKey: "plannerName",
    filterType: "select",
    filterId: "weekly-filter-planner"
  },
  {
    header: "입고예정일",
    sortKey: "incomingSchedule",
    filterKey: "incomingSchedule",
    filterType: "date",
    filterId: "weekly-filter-incoming",
    placeholder: "날짜 선택"
  },
  { header: "입고예정수량" },
  { header: "잔량" },
  { header: "누적합" },
  { header: "입고여부" },
  {
    header: "출고일자",
    sortKey: "shippingDate",
    filterKey: "shippingDate",
    filterType: "date",
    filterId: "weekly-filter-shipping-date",
    placeholder: "날짜 선택"
  },
  {
    header: "출고수량",
    sortKey: "shippingQuantity",
    filterKey: "shippingQuantity",
    filterType: "search",
    filterId: "weekly-filter-shipping-quantity",
    placeholder: "수량"
  },
  {
    header: "출고매장",
    sortKey: "shippingStores",
    filterKey: "shippingStores",
    filterType: "select",
    filterId: "weekly-filter-shipping-stores"
  },
  {
    header: "상태",
    sortKey: "statusLabel",
    filterKey: "statusLabel",
    filterType: "select",
    filterId: "weekly-filter-status"
  },
  { header: "제외", bulk: true },
  { header: "비고" }
];

if (!startDateInput.value) {
  startDateInput.value = todayLocalDate();
}

endDateInput.value = startDateInput.value;
endDateFollowsStart = true;

for (const tab of viewTabs) {
  tab.addEventListener("click", () => activateView(tab.dataset.view));
}

refreshButton.addEventListener("click", loadPreview);
weeklySyncButton.addEventListener("click", syncWeeklyAccumulation);
weeklyRefreshButton.addEventListener("click", loadWeeklyAccumulation);
weeklySaveEditsButton.addEventListener("click", saveWeeklyEdits);
weeklyShippingDateSelect.addEventListener("change", () => selectWeeklyRowsByShippingDate(weeklyShippingDateSelect.value));
if (weeklyScrollTop && weeklyTableWrap) {
  weeklyScrollTop.addEventListener("scroll", () => syncWeeklyScrollPosition(weeklyScrollTop, weeklyTableWrap));
  weeklyTableWrap.addEventListener("scroll", () => syncWeeklyScrollPosition(weeklyTableWrap, weeklyScrollTop));
}
lowRateRefreshButton.addEventListener("click", loadLowShippingRate);
lowRatePlannerFilter.addEventListener("change", loadLowShippingRate);
lowRateStyleSearchInput.addEventListener("input", loadLowShippingRate);
lowRateDownloadButton.addEventListener("click", downloadLowShippingRate);
startDateInput.addEventListener("input", handleStartDateChange);
startDateInput.addEventListener("change", handleStartDateChange);
endDateInput.addEventListener("input", handleEndDateChange);
endDateInput.addEventListener("change", handleEndDateChange);
function handleStartDateChange() {
  if (endDateFollowsStart || !endDateInput.value || endDateInput.value < startDateInput.value) {
    endDateInput.value = startDateInput.value;
    endDateFollowsStart = true;
  }
  loadPreview();
  loadActiveSupplementalData();
}
function handleEndDateChange() {
  endDateFollowsStart = endDateInput.value === startDateInput.value;
  loadPreview();
  loadActiveSupplementalData();
}
downloadButton.addEventListener("click", () => {
  const rows = getVisibleRows();
  if (!startDateInput.value || !endDateInput.value || rows.length === 0) {
    return;
  }

  const params = new URLSearchParams({
    startDate: startDateInput.value,
    endDate: endDateInput.value,
    sortKey: sortState.key,
    sortDirection: sortState.direction
  });

  for (const shippingDate of selectedShippingDates) {
    params.append("shippingDate", shippingDate);
  }
  for (const category of selectedCategories) {
    params.append("category", category);
  }
  for (const itemCode of selectedItemCodes) {
    params.append("itemCode", itemCode);
  }
  if (itemSearchInput.value.trim()) {
    params.set("itemSearch", itemSearchInput.value.trim());
  }
  if (styleSearchInput.value.trim()) {
    params.set("styleSearch", styleSearchInput.value.trim());
  }

  window.location.href = `/download?${params.toString()}`;
});

shippingDateFilterButton.addEventListener("click", () => toggleMultiFilter(shippingDateFilterMenu, shippingDateFilterButton));
categoryFilterButton.addEventListener("click", () => toggleMultiFilter(categoryFilterMenu, categoryFilterButton));
itemFilterButton.addEventListener("click", () => toggleMultiFilter(itemFilterMenu, itemFilterButton));
document.addEventListener("click", (event) => {
  if (!shippingDateFilter.contains(event.target)) {
    closeMultiFilter(shippingDateFilterMenu, shippingDateFilterButton);
  }
  if (!categoryFilter.contains(event.target)) {
    closeMultiFilter(categoryFilterMenu, categoryFilterButton);
  }
  if (!itemFilter.contains(event.target)) {
    closeMultiFilter(itemFilterMenu, itemFilterButton);
  }
});
itemSearchInput.addEventListener("input", renderFilteredTable);
styleSearchInput.addEventListener("input", renderFilteredTable);
clearFiltersButton.addEventListener("click", () => {
  selectedShippingDates.clear();
  selectedCategories.clear();
  selectedItemCodes.clear();
  itemSearchInput.value = "";
  styleSearchInput.value = "";
  expandedRowId = "";
  renderMultiFilter(shippingDateFilterMenu, shippingDateFilterButton, shippingDateOptions, selectedShippingDates, "전체 출고일자");
  renderMultiFilter(categoryFilterMenu, categoryFilterButton, categoryOptions, selectedCategories, "전체 구분");
  renderMultiFilter(itemFilterMenu, itemFilterButton, itemOptions, selectedItemCodes, "전체 아이템");
  renderFilteredTable();
});

activateView("summary");
loadPreview();

async function loadPreview() {
  const startDate = startDateInput.value;
  const endDate = endDateInput.value;
  latestRows = [];
  latestColumns = FALLBACK_COLUMNS;
  expandedRowId = "";
  downloadButton.disabled = true;

  if (!startDate || !endDate) {
    setStatus("기간을 선택해주세요.", "warning");
    renderEmptyTable();
    renderEmptyWeeklySummary();
    renderWeekButtons();
    populateDetailFilters();
    return;
  }

  if (startDate > endDate) {
    setStatus("시작일은 종료일보다 늦을 수 없습니다.", "warning");
    renderEmptyTable();
    renderEmptyWeeklySummary();
    renderWeekButtons();
    populateDetailFilters();
    return;
  }

  setStatus("구글 시트에서 데이터를 불러오는 중입니다.");

  try {
    const response = await fetch(`/api/preview?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, {
      headers: { Accept: "application/json" }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "데이터를 불러오지 못했습니다.");
    }

    latestRows = data.rows || [];
    latestColumns = data.columns?.length ? data.columns : FALLBACK_COLUMNS;
    populateDetailFilters(data.filters);
    renderWeekButtons(data.summary);
    renderWeeklySummary(data.summary);
    renderFilteredTable();

    if (data.selectedDateClosed) {
      setStatus(`${data.targetSheetDate}은 ${data.selectedDateClosedReason} 출고 불가일입니다.`, "warning");
      return;
    }

    if (data.outputCount === 0) {
      setStatus(`${data.targetSheetDate} 출고 데이터가 없습니다.`, "warning");
      return;
    }

    downloadButton.disabled = getVisibleRows().length === 0;
    setStatus(`${data.targetSheetDate} 기준 ${data.outputCount}개 스타일을 다운로드할 수 있습니다.`);
  } catch (error) {
    renderEmptyTable();
    renderEmptyWeeklySummary();
    renderWeekButtons();
    populateDetailFilters();
    setStatus(error.message, "error");
  }
}

function activateView(viewName) {
  for (const tab of viewTabs) {
    const active = tab.dataset.view === viewName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }

  for (const panel of viewPanels) {
    panel.hidden = panel.id !== `${viewName}-view`;
  }

  if (viewName === "weekly" && !weeklyLoaded) {
    loadWeeklyAccumulation();
  }
  if (viewName === "low-rate" && !lowRateLoaded) {
    loadLowShippingRate();
  }
}

async function syncWeeklyAccumulation() {
  weeklySyncButton.disabled = true;
  weeklySaveEditsButton.disabled = true;
  weeklySyncSummary.textContent = "주간납기판을 읽고 누적 데이터에 반영하는 중입니다.";

  try {
    const response = await fetch("/api/weekly-accumulation/sync", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        startDate: startDateInput.value,
        endDate: endDateInput.value
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "주간납기판 업데이트를 반영하지 못했습니다.");
    }

    renderWeeklySyncSummary(data.summary);
    weeklyLoaded = false;
    await loadWeeklyAccumulation();
    await loadPreview();
  } catch (error) {
    weeklySyncSummary.textContent = error.message;
    weeklySyncSummary.className = "weekly-sync-summary error";
  } finally {
    weeklySyncButton.disabled = false;
    weeklySaveEditsButton.disabled = false;
  }
}

async function loadWeeklyAccumulation() {
  const params = new URLSearchParams();
  if (startDateInput.value) {
    params.set("startDate", startDateInput.value);
  }
  if (endDateInput.value) {
    params.set("endDate", endDateInput.value);
  }

  weeklyRefreshButton.disabled = true;
  weeklySaveEditsButton.disabled = true;
  if (weeklyConfirmSelectedButton) {
    weeklyConfirmSelectedButton.disabled = true;
  }

  try {
    const response = await fetch(`/api/weekly-accumulation?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "누적 데이터를 불러오지 못했습니다.");
    }

    weeklyLoaded = true;
    weeklyRows = data.rows || [];
    weeklyLastData = data;
    renderWeeklyAccumulation(data);
  } catch (error) {
    weeklyRows = [];
    weeklyLastData = { rows: [], totalCount: 0, visibleCount: 0, needsCheckCount: 0 };
    renderWeeklyAccumulation({ rows: [], totalCount: 0, visibleCount: 0, needsCheckCount: 0 });
    weeklySyncSummary.textContent = error.message;
    weeklySyncSummary.className = "weekly-sync-summary error";
  } finally {
    weeklyRefreshButton.disabled = false;
    weeklySaveEditsButton.disabled = weeklyRows.length === 0;
    updateWeeklyBulkControls();
  }
}

async function saveWeeklyEdits() {
  const edits = collectWeeklyEdits();
  if (edits.length === 0) {
    return;
  }

  weeklySaveEditsButton.disabled = true;
  weeklySyncSummary.textContent = "수정 내용을 저장하는 중입니다.";

  try {
    const response = await fetch("/api/weekly-accumulation", {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ edits })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "수정 내용을 저장하지 못했습니다.");
    }

    weeklySyncSummary.textContent = `수정 저장 완료 · 데이터 확인 필요 ${formatNumber(data.needsCheckCount || 0)}건`;
    weeklySyncSummary.className = "weekly-sync-summary neutral";
    weeklyLoaded = false;
    lowRateLoaded = false;
    await loadWeeklyAccumulation();
    await loadPreview();
  } catch (error) {
    weeklySyncSummary.textContent = error.message;
    weeklySyncSummary.className = "weekly-sync-summary error";
  } finally {
    weeklySaveEditsButton.disabled = false;
  }
}

function collectWeeklyEdits() {
  const rows = [...weeklyTableBody.querySelectorAll("tr[data-key]")];
  const remainingValues = getWeeklyGroupRemainingValues(rows);
  return rows.map((row) => collectWeeklyRowEdit(row, remainingValues));
}

function collectWeeklyRowEdit(row, remainingValues = getWeeklyGroupRemainingValues()) {
  const groupKey = row.dataset.groupKey || "";
  return {
    key: row.dataset.key,
    incomingDate: row.querySelector("[data-field='incomingDate']")?.value || "",
    incomingQuantity: row.querySelector("[data-field='incomingQuantity']")?.value || "",
    remainingQuantity: remainingValues.get(groupKey) ?? row.dataset.remainingQuantity ?? "",
    shippingDate: row.querySelector("[data-field='shippingDate']")?.value || "",
    shippingQuantity: row.querySelector("[data-field='shippingQuantity']")?.value || "",
    shippingStores: row.querySelector("[data-field='shippingStores']")?.value || "",
    note: row.querySelector("[data-field='note']")?.value || "",
    excluded: Boolean(row.querySelector("[data-field='excluded']")?.checked),
    shippingConfirmed: row.dataset.shippingConfirmed === "true"
  };
}

function getWeeklyGroupRemainingValues(rows = [...weeklyTableBody.querySelectorAll("tr[data-key]")]) {
  const values = new Map();
  for (const row of rows) {
    const groupKey = row.dataset.groupKey || "";
    if (!groupKey || values.has(groupKey)) {
      continue;
    }
    const input = row.querySelector("[data-field='remainingQuantity']");
    if (input) {
      values.set(groupKey, input.value || "");
    }
  }
  return values;
}

function updateWeeklyTableFilter(key, value) {
  if (!key) {
    return;
  }
  syncWeeklyRowsFromRenderedEdits();
  weeklyTableFilterState[key] = String(value || "").trim();
  renderWeeklyAccumulation(weeklyLastData || { rows: weeklyRows, totalCount: weeklyRows.length });
}

function syncWeeklyRowsFromRenderedEdits() {
  const edits = collectWeeklyEdits();
  if (edits.length === 0 || weeklyRows.length === 0) {
    return;
  }
  const editsByKey = new Map(edits.map((edit) => [edit.key, edit]));
  weeklyRows = weeklyRows.map((row) => {
    const edit = editsByKey.get(row.key);
    if (!edit) {
      return row;
    }
    return {
      ...row,
      incomingDate: edit.incomingDate,
      incomingQuantity: edit.incomingQuantity,
      remainingQuantity: edit.remainingQuantity,
      shippingDate: edit.shippingDate,
      shippingQuantity: edit.shippingQuantity,
      shippingStores: edit.shippingStores,
      note: edit.note,
      excluded: edit.excluded,
      shippingConfirmed: edit.shippingConfirmed
    };
  });
  if (weeklyLastData) {
    weeklyLastData = { ...weeklyLastData, rows: weeklyRows };
  }
}

function applyWeeklyTableFiltersAndSort(rows = []) {
  const filteredRows = rows.filter((row) => {
    return Object.entries(weeklyTableFilterState).every(([key, filter]) => {
      if (!filter) {
        return true;
      }
      return normalizeSearchText(getWeeklyFilterValue(row, key)).includes(normalizeSearchText(filter));
    });
  });

  if (!weeklySortState.key) {
    return filteredRows;
  }

  return [...filteredRows].sort((left, right) => {
    const direction = weeklySortState.direction === "desc" ? -1 : 1;
    return compareWeeklySortValues(
      getWeeklyFilterValue(left, weeklySortState.key),
      getWeeklyFilterValue(right, weeklySortState.key),
      weeklySortState.key
    ) * direction;
  });
}

function toggleWeeklySort(key) {
  syncWeeklyRowsFromRenderedEdits();
  weeklySortState = weeklySortState.key === key
    ? { key, direction: weeklySortState.direction === "asc" ? "desc" : "asc" }
    : { key, direction: "asc" };
  renderWeeklyAccumulation(weeklyLastData || { rows: weeklyRows, totalCount: weeklyRows.length });
}

function getWeeklyFilterValue(row, key) {
  if (key === "validationLabel") {
    return row.validationLabel || "정상";
  }
  if (key === "incomingSchedule") {
    return row.incomingDate || row.incomingPeriod || "";
  }
  if (key === "statusLabel") {
    return getWeeklyRowStatusLabel(row);
  }
  if (key === "shippingQuantity") {
    return row.shippingQuantity ?? "";
  }
  return row[key] ?? "";
}

function compareWeeklySortValues(left, right, key) {
  if (key === "shippingQuantity") {
    return parseNumber(left) - parseNumber(right);
  }
  return compareValues(left, right);
}

function normalizeSearchText(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

async function confirmSelectedWeeklyRows() {
  const selectedRows = getWeeklyRows().filter((row) => row.querySelector("[data-field='excluded']")?.checked);
  if (selectedRows.length === 0) {
    weeklySyncSummary.textContent = "확정할 스타일을 선택해주세요.";
    weeklySyncSummary.className = "weekly-sync-summary warning";
    return;
  }

  const rowsToConfirm = selectedRows;
  const missingShippingDateRows = rowsToConfirm.filter((row) => !collectWeeklyRowEdit(row).shippingDate);
  if (missingShippingDateRows.length > 0) {
    weeklySyncSummary.textContent = `출고일자가 비어있는 행 ${formatNumber(missingShippingDateRows.length)}건이 있어 확정할 수 없습니다.`;
    weeklySyncSummary.className = "weekly-sync-summary warning";
    return;
  }
  const remainingValues = getWeeklyGroupRemainingValues();
  const edits = rowsToConfirm.map((row) => ({
    ...collectWeeklyRowEdit(row, remainingValues),
    excluded: true,
    shippingConfirmed: true
  }));

  weeklyConfirmSelectedButton.disabled = true;
  weeklySaveEditsButton.disabled = true;
  weeklySyncSummary.textContent = `선택한 ${formatNumber(edits.length)}건을 출고리스트 확정 처리하는 중입니다.`;
  weeklySyncSummary.className = "weekly-sync-summary neutral";

  try {
    const response = await fetch("/api/weekly-accumulation", {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ edits })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "선택한 행을 확정하지 못했습니다.");
    }

    weeklySyncSummary.textContent = `출고리스트 확정 완료 · ${formatNumber(edits.length)}건`;
    weeklySyncSummary.className = "weekly-sync-summary neutral";
    weeklyLoaded = false;
    lowRateLoaded = false;
    await loadWeeklyAccumulation();
    await loadPreview();
  } catch (error) {
    weeklySyncSummary.textContent = error.message;
    weeklySyncSummary.className = "weekly-sync-summary error";
  } finally {
    weeklyConfirmSelectedButton.disabled = false;
    weeklySaveEditsButton.disabled = weeklyRows.length === 0;
    updateWeeklyBulkControls();
  }
}

async function cancelSelectedWeeklyConfirmations() {
  const selectedRows = getWeeklyRows().filter((row) => row.querySelector("[data-field='excluded']")?.checked);
  if (selectedRows.length === 0) {
    weeklySyncSummary.textContent = "확정 취소할 행을 선택해주세요.";
    weeklySyncSummary.className = "weekly-sync-summary warning";
    return;
  }

  const remainingValues = getWeeklyGroupRemainingValues();
  const edits = selectedRows.map((row) => ({
    ...collectWeeklyRowEdit(row, remainingValues),
    excluded: false,
    shippingConfirmed: false
  }));

  weeklyCancelConfirmButton.disabled = true;
  weeklyConfirmSelectedButton.disabled = true;
  weeklySaveEditsButton.disabled = true;
  weeklySyncSummary.textContent = `선택한 ${formatNumber(edits.length)}건의 출고확정을 취소하는 중입니다.`;
  weeklySyncSummary.className = "weekly-sync-summary neutral";

  try {
    const response = await fetch("/api/weekly-accumulation", {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ edits })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "선택한 행의 확정을 취소하지 못했습니다.");
    }

    weeklySyncSummary.textContent = `출고확정 취소 완료 · ${formatNumber(edits.length)}건`;
    weeklySyncSummary.className = "weekly-sync-summary neutral";
    weeklyLoaded = false;
    lowRateLoaded = false;
    await loadWeeklyAccumulation();
  } catch (error) {
    weeklySyncSummary.textContent = error.message;
    weeklySyncSummary.className = "weekly-sync-summary error";
  } finally {
    weeklyCancelConfirmButton.disabled = false;
    weeklyConfirmSelectedButton.disabled = false;
    weeklySaveEditsButton.disabled = weeklyRows.length === 0;
    updateWeeklyBulkControls();
  }
}

function setWeeklyExcludedSelection(checked) {
  for (const row of getWeeklyRows()) {
    const checkbox = row.querySelector("[data-field='excluded']");
    if (!checkbox || checkbox.disabled || (checked && !isWeeklyRowSelectable(row))) {
      continue;
    }
    checkbox.checked = checked;
    updateWeeklyRowSelectionState(row);
  }
  updateWeeklyBulkControls();
}

function selectWeeklyRowsByShippingDate(date) {
  let selectedCount = 0;
  for (const row of getWeeklyRows()) {
    const checkbox = row.querySelector("[data-field='excluded']");
    if (!checkbox) {
      continue;
    }
    const isTargetDate = collectWeeklyRowEdit(row).shippingDate === date;
    checkbox.checked = Boolean(date) && isTargetDate && isWeeklyRowSelectable(row);
    if (checkbox.checked) {
      selectedCount += 1;
    }
    updateWeeklyRowSelectionState(row);
  }

  if (date) {
    weeklySyncSummary.textContent = selectedCount > 0
      ? `${formatDisplayDate(date)} 출고일자 ${formatNumber(selectedCount)}건을 선택했습니다.`
      : `${formatDisplayDate(date)} 출고일자로 선택할 수 있는 행이 없습니다.`;
    weeklySyncSummary.className = selectedCount > 0 ? "weekly-sync-summary neutral" : "weekly-sync-summary warning";
  }
  updateWeeklyBulkControls();
}

function getWeeklyRows() {
  return [...weeklyTableBody.querySelectorAll("tr[data-key]")];
}

function updateWeeklyBulkControls() {
  if (!weeklySelectAllInput || !weeklyConfirmSelectedButton || !weeklyCancelConfirmButton) {
    return;
  }
  const rows = getWeeklyRows();
  for (const row of rows) {
    updateWeeklyRowSelectableState(row);
  }
  const checkboxes = rows.map((row) => row.querySelector("[data-field='excluded']")).filter(Boolean);
  const selectableCheckboxes = rows
    .filter(isWeeklyRowSelectable)
    .map((row) => row.querySelector("[data-field='excluded']"))
    .filter(Boolean);
  const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
  const selectableCheckedCount = selectableCheckboxes.filter((checkbox) => checkbox.checked).length;
  const hasSelectableRows = selectableCheckboxes.length > 0;

  weeklySelectAllInput.disabled = !hasSelectableRows;
  weeklySelectAllInput.checked = hasSelectableRows && selectableCheckedCount === selectableCheckboxes.length;
  weeklySelectAllInput.indeterminate = selectableCheckedCount > 0 && selectableCheckedCount < selectableCheckboxes.length;
  weeklyConfirmSelectedButton.disabled = checkedCount === 0;
  weeklyCancelConfirmButton.disabled = checkedCount === 0;
}

function updateWeeklyRowSelectionState(row) {
  const checked = Boolean(row.querySelector("[data-field='excluded']")?.checked);
  row.classList.toggle("excluded", checked || row.dataset.shippingConfirmed === "true");
}

function updateWeeklyRowSelectableState(row) {
  const checkbox = row.querySelector("[data-field='excluded']");
  if (!checkbox) {
    return;
  }
  const selectable = isWeeklyRowSelectable(row);
  checkbox.disabled = !selectable;
  checkbox.title = selectable ? "" : "출고일자를 먼저 입력해주세요.";
  if (!selectable) {
    checkbox.checked = false;
  }
  row.classList.toggle("selection-disabled", !selectable);
  updateWeeklyRowSelectionState(row);
}

function isWeeklyRowSelectable(row) {
  return Boolean(collectWeeklyRowEdit(row).shippingDate);
}

function populateWeeklyShippingDateSelect(rows = []) {
  const selected = weeklyShippingDateSelect.value;
  const dateCounts = new Map();
  for (const row of rows) {
    const shippingDate = row.shippingDate || "";
    if (!shippingDate) {
      continue;
    }
    dateCounts.set(shippingDate, (dateCounts.get(shippingDate) || 0) + 1);
  }

  weeklyShippingDateSelect.replaceChildren(new Option("날짜 선택", ""));
  for (const [date, count] of [...dateCounts.entries()].sort(([left], [right]) => compareValues(left, right))) {
    weeklyShippingDateSelect.append(new Option(`${formatDisplayDate(date)} (${formatNumber(count)})`, date));
  }
  weeklyShippingDateSelect.value = [...weeklyShippingDateSelect.options].some((option) => option.value === selected)
    ? selected
    : "";
}

function populateWeeklyShippingDateSelectFromRows() {
  populateWeeklyShippingDateSelect(getWeeklyRows().map((row) => collectWeeklyRowEdit(row)));
}

function bindWeeklyColumnFilterInputs() {
  weeklyColumnFilterInputs = [...weeklyTableHead.querySelectorAll("[data-weekly-filter]")];
  for (const input of weeklyColumnFilterInputs) {
    input.addEventListener("input", () => updateWeeklyTableFilter(input.dataset.weeklyFilter, input.value));
    input.addEventListener("change", () => updateWeeklyTableFilter(input.dataset.weeklyFilter, input.value));
  }
}

function populateWeeklyColumnFilterOptions(rows = []) {
  populateWeeklySelectFilter("validationLabel", rows);
  populateWeeklySelectFilter("plannerName", rows);
  populateWeeklySelectFilter("shippingStores", rows);
  populateWeeklySelectFilter("statusLabel", rows);
}

function populateWeeklySelectFilter(key, rows) {
  const select = weeklyColumnFilterInputs.find((input) => input.dataset.weeklyFilter === key && input.tagName === "SELECT");
  if (!select) {
    return;
  }
  const selected = weeklyTableFilterState[key] || select.value;
  const values = [...new Set(rows.map((row) => getWeeklyFilterValue(row, key)).filter(Boolean))]
    .sort((left, right) => compareValues(left, right));
  select.replaceChildren(new Option("전체", ""));
  for (const value of values) {
    select.append(new Option(value, value));
  }
  select.value = values.includes(selected) ? selected : "";
  weeklyTableFilterState[key] = select.value;
}

function renderWeeklySyncSummary(summary) {
  if (!summary) {
    weeklySyncSummary.textContent = "";
    weeklySyncSummary.className = "weekly-sync-summary";
    return;
  }

  weeklySyncSummary.className = summary.needsCheck > 0
    ? "weekly-sync-summary warning"
    : "weekly-sync-summary neutral";
  weeklySyncSummary.textContent = [
    `신규 추가 ${formatNumber(summary.added || 0)}건`,
    `최신값 덮어쓰기 ${formatNumber(summary.updated || 0)}건`,
    `동일 유지 ${formatNumber(summary.unchanged || 0)}건`,
    `이전 누적 유지 ${formatNumber(summary.preserved || 0)}건`,
    `데이터 확인 필요 ${formatNumber(summary.needsCheck || 0)}건`
  ].join(" · ");
}

function renderWeeklyAccumulation(data) {
  const baseRows = data.rows || [];
  weeklyTableHead.replaceChildren();
  weeklyTableBody.replaceChildren();
  for (const column of WEEKLY_TABLE_COLUMNS) {
    if (column.bulk) {
      appendWeeklyBulkHeader(weeklyTableHead);
    } else {
      appendWeeklyHeader(weeklyTableHead, column);
    }
  }
  bindWeeklyColumnFilterInputs();
  populateWeeklyColumnFilterOptions(baseRows);

  const rows = applyWeeklyTableFiltersAndSort(baseRows);
  const needsCheckCount = rows.filter((row) => row.validationStatus && row.validationStatus !== "ok").length;
  weeklyCount.textContent = `${formatNumber(rows.length)} / ${formatNumber(data.totalCount || baseRows.length)} · 확인 필요 ${formatNumber(needsCheckCount)}건`;
  populateWeeklyShippingDateSelect(rows);

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 15;
    td.textContent = "표시할 출고리스트 작성 데이터가 없습니다.";
    tr.append(td);
    weeklyTableBody.append(tr);
    updateWeeklyBulkControls();
    syncWeeklyScrollbars();
    return;
  }

  const renderedGroups = new Set();
  for (const row of rows) {
    const groupKey = row.groupKey || `${row.style || ""}|${row.round || ""}`;
    const showRemainingQuantityInput = !renderedGroups.has(groupKey);
    renderedGroups.add(groupKey);
    weeklyTableBody.append(renderWeeklyRow({ ...row, showRemainingQuantityInput }));
  }
  updateWeeklyBulkControls();
  syncWeeklyScrollbars();
}

function renderWeeklyRow(row) {
  const tr = document.createElement("tr");
  tr.dataset.key = row.key;
  tr.dataset.groupKey = row.groupKey || `${row.style || ""}|${row.round || ""}`;
  tr.dataset.style = row.style || "";
  tr.dataset.remainingQuantity = row.remainingQuantity ?? "";
  tr.dataset.shippingConfirmed = row.shippingConfirmed ? "true" : "false";
  tr.className = [
    "weekly-data-row",
    row.validationStatus && row.validationStatus !== "ok" ? `validation-${row.validationStatus}` : "",
    row.excluded || row.shippingConfirmed ? "excluded" : "",
    row.shippingConfirmed ? "shipping-confirmed" : ""
  ].filter(Boolean).join(" ");

  appendCell(tr, row.validationLabel || "정상", "validation-cell");
  appendCell(tr, row.style || "");
  appendCell(tr, row.round || "");
  appendCell(tr, row.plannerName || "");
  if (row.incomingType === "period") {
    appendCell(tr, row.incomingPeriod || "기간 확인 필요", "period-cell");
  } else {
    appendInputCell(tr, "date", "incomingDate", row.incomingDate || "");
  }
  appendInputCell(tr, "number", "incomingQuantity", row.incomingQuantity ?? "");
  if (row.showRemainingQuantityInput) {
    appendInputCell(tr, "number", "remainingQuantity", row.remainingQuantity ?? "");
  } else {
    appendCell(tr, "동일", "muted-cell");
  }
  appendCell(tr, formatNumber(row.accumulatedQuantity ?? row.plannedQuantity ?? 0), "number-cell");
  appendCell(tr, row.incomingStatus || "");
  appendInputCell(tr, "date", "shippingDate", row.shippingDate || "");
  appendInputCell(tr, "number", "shippingQuantity", row.shippingQuantity ?? "");
  appendSelectCell(tr, "shippingStores", row.shippingStores || "", ["상위매장", "전매장"]);
  appendCell(tr, getWeeklyRowStatusLabel(row));
  appendCheckboxCell(tr, "excluded", Boolean(row.excluded));
  appendInputCell(tr, "text", "note", row.note || "");
  updateWeeklyRowSelectableState(tr);

  return tr;
}

function getWeeklyRowStatusLabel(row) {
  if (row.shippingConfirmed) {
    return "출고확정";
  }
  if (row.incomingType === "period" && !row.shippingDate) {
    return "출고일자 확인 필요";
  }
  return row.sourceStatus === "previous" ? "이전 누적" : "최신";
}

function appendInputCell(row, type, field, value) {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  input.dataset.field = field;
  if (type === "number") {
    input.min = "0";
    input.step = "1";
  }
  if (field === "shippingDate") {
    input.addEventListener("input", () => {
      updateWeeklyRowSelectableState(row);
      populateWeeklyShippingDateSelectFromRows();
      updateWeeklyBulkControls();
    });
  }
  td.append(input);
  row.append(td);
}

function appendSelectCell(row, field, value, options = []) {
  const td = document.createElement("td");
  const select = document.createElement("select");
  select.dataset.field = field;
  for (const optionValue of options) {
    select.append(new Option(optionValue, optionValue));
  }
  select.value = options.includes(value) ? value : options[0] || "";
  td.append(select);
  row.append(td);
}

function appendCheckboxCell(row, field, checked) {
  const td = document.createElement("td");
  td.className = "center-cell";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.dataset.field = field;
  if (field === "excluded") {
    input.addEventListener("change", () => {
      updateWeeklyRowSelectionState(row);
      updateWeeklyBulkControls();
    });
  }
  td.append(input);
  row.append(td);
}

function appendWeeklyHeader(row, column) {
  const th = document.createElement("th");
  const wrapper = document.createElement("div");
  wrapper.className = "weekly-header-content";

  if (column.sortKey) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "weekly-sort-button";
    button.textContent = `${column.header}${weeklySortIndicator(column.sortKey)}`;
    button.setAttribute("aria-label", `${column.header} 정렬`);
    button.setAttribute(
      "aria-sort",
      weeklySortState.key === column.sortKey
        ? weeklySortState.direction === "asc" ? "ascending" : "descending"
        : "none"
    );
    button.addEventListener("click", () => toggleWeeklySort(column.sortKey));
    wrapper.append(button);
  } else {
    const label = document.createElement("span");
    label.className = "weekly-header-label";
    label.textContent = column.header;
    wrapper.append(label);
  }

  appendWeeklyHeaderFilter(wrapper, column);
  th.append(wrapper);
  row.append(th);
}

function appendWeeklyHeaderFilter(wrapper, column) {
  if (!column.filterKey) {
    return;
  }

  const value = weeklyTableFilterState[column.filterKey] || "";
  if (column.filterType === "select") {
    const select = document.createElement("select");
    select.id = column.filterId;
    select.className = "weekly-header-filter";
    select.dataset.weeklyFilter = column.filterKey;
    select.append(new Option("전체", ""));
    select.value = value;
    wrapper.append(select);
    return;
  }

  const input = document.createElement("input");
  input.id = column.filterId;
  input.className = "weekly-header-filter";
  input.dataset.weeklyFilter = column.filterKey;
  input.type = column.filterType === "date" ? "date" : "search";
  input.placeholder = column.placeholder || column.header;
  input.autocomplete = "off";
  input.value = value;
  wrapper.append(input);
}

function weeklySortIndicator(key) {
  if (weeklySortState.key !== key) {
    return " ↕";
  }
  return weeklySortState.direction === "asc" ? " ▲" : " ▼";
}

function appendWeeklyBulkHeader(row) {
  const th = document.createElement("th");
  th.className = "weekly-bulk-head";

  const wrapper = document.createElement("div");
  wrapper.className = "weekly-bulk-head-inner";

  const label = document.createElement("label");
  label.className = "weekly-bulk-check";
  weeklySelectAllInput = document.createElement("input");
  weeklySelectAllInput.id = "weekly-select-all";
  weeklySelectAllInput.type = "checkbox";
  weeklySelectAllInput.addEventListener("change", () => setWeeklyExcludedSelection(weeklySelectAllInput.checked));
  label.append(weeklySelectAllInput, document.createTextNode("전체"));

  const actions = document.createElement("div");
  actions.className = "weekly-bulk-head-actions";

  weeklyConfirmSelectedButton = document.createElement("button");
  weeklyConfirmSelectedButton.id = "weekly-confirm-selected";
  weeklyConfirmSelectedButton.className = "weekly-bulk-button";
  weeklyConfirmSelectedButton.type = "button";
  weeklyConfirmSelectedButton.textContent = "확정";
  weeklyConfirmSelectedButton.addEventListener("click", confirmSelectedWeeklyRows);

  weeklyCancelConfirmButton = document.createElement("button");
  weeklyCancelConfirmButton.id = "weekly-cancel-confirm";
  weeklyCancelConfirmButton.className = "secondary-button weekly-bulk-button";
  weeklyCancelConfirmButton.type = "button";
  weeklyCancelConfirmButton.textContent = "확정 취소";
  weeklyCancelConfirmButton.addEventListener("click", cancelSelectedWeeklyConfirmations);
  actions.append(weeklyConfirmSelectedButton, weeklyCancelConfirmButton);

  const title = document.createElement("span");
  title.className = "weekly-bulk-title";
  title.textContent = "제외";
  wrapper.append(label, actions, title);
  th.append(wrapper);
  row.append(th);
}

function isWeeklyViewActive() {
  return document.querySelector(".view-tab.active")?.dataset.view === "weekly";
}

function isLowRateViewActive() {
  return document.querySelector(".view-tab.active")?.dataset.view === "low-rate";
}

function syncWeeklyScrollbars() {
  if (!weeklyScrollTop || !weeklyScrollTopInner || !weeklyTableWrap) {
    return;
  }
  const table = weeklyTableWrap.querySelector(".weekly-table");
  weeklyScrollTopInner.style.width = `${table?.scrollWidth || weeklyTableWrap.scrollWidth}px`;
  weeklyScrollTop.scrollLeft = weeklyTableWrap.scrollLeft;
}

function syncWeeklyScrollPosition(source, target) {
  if (weeklyScrollSyncing || !source || !target) {
    return;
  }
  weeklyScrollSyncing = true;
  target.scrollLeft = source.scrollLeft;
  weeklyScrollSyncing = false;
}

function loadActiveSupplementalData() {
  weeklyLoaded = false;
  lowRateLoaded = false;
  if (isWeeklyViewActive()) {
    loadWeeklyAccumulation();
  }
  if (isLowRateViewActive()) {
    loadLowShippingRate();
  }
}

async function loadLowShippingRate() {
  const params = lowShippingRateParams();
  lowRateRefreshButton.disabled = true;
  lowRateDownloadButton.disabled = true;

  try {
    const response = await fetch(`/api/low-shipping-rate?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "낮은 출고율 데이터를 불러오지 못했습니다.");
    }

    lowRateLoaded = true;
    lowRateRows = data.rows || [];
    populateLowRatePlannerFilter(data.filters?.planners || []);
    renderLowShippingRate(data);
  } catch (error) {
    lowRateRows = [];
    renderLowShippingRate({ rows: [], totalCount: 0, visibleCount: 0 });
    lowRateBadge.textContent = error.message;
  } finally {
    lowRateRefreshButton.disabled = false;
    lowRateDownloadButton.disabled = lowRateRows.length === 0;
  }
}

function downloadLowShippingRate() {
  if (lowRateRows.length === 0) {
    return;
  }
  window.location.href = `/download-low-shipping-rate?${lowShippingRateParams().toString()}`;
}

function lowShippingRateParams() {
  const params = new URLSearchParams();
  if (startDateInput.value) {
    params.set("startDate", startDateInput.value);
  }
  if (endDateInput.value) {
    params.set("endDate", endDateInput.value);
  }
  if (lowRatePlannerFilter.value) {
    params.set("plannerName", lowRatePlannerFilter.value);
  }
  if (lowRateStyleSearchInput.value.trim()) {
    params.set("styleSearch", lowRateStyleSearchInput.value.trim());
  }
  return params;
}

function populateLowRatePlannerFilter(options) {
  const selected = lowRatePlannerFilter.value;
  lowRatePlannerFilter.replaceChildren(new Option("전체 기획자", ""));
  for (const option of options) {
    lowRatePlannerFilter.append(new Option(`${option.label} (${option.count})`, option.value));
  }
  lowRatePlannerFilter.value = [...lowRatePlannerFilter.options].some((option) => option.value === selected) ? selected : "";
}

function renderLowShippingRate(data) {
  const rows = data.rows || [];
  lowRateCount.textContent = `${formatNumber(data.visibleCount || rows.length)} / ${formatNumber(data.totalCount || rows.length)}`;
  lowRateBadge.textContent = `낮은 출고율 확인필요 ${formatNumber(data.totalCount || rows.length)}건`;

  lowRateTableHead.replaceChildren();
  lowRateTableBody.replaceChildren();
  for (const header of ["스타일", "차수", "기획자명", "입고여부", "누적입고량", "누적출고량", "입고대비 출고율", "예정 입고일정", "확인 표시"]) {
    appendHeader(lowRateTableHead, header);
  }

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 9;
    td.textContent = "표시할 낮은 출고율 스타일이 없습니다.";
    tr.append(td);
    lowRateTableBody.append(tr);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = "low-rate-row";
    appendCell(tr, row.style || "");
    appendCell(tr, row.round || "");
    appendCell(tr, row.plannerName || "");
    appendCell(tr, row.incomingStatus || "");
    appendCell(tr, formatNumber(row.cumulativeIncomingQuantity || 0), "number-cell");
    appendCell(tr, formatNumber(row.cumulativeShippingQuantity || 0), "number-cell");
    appendCell(tr, row.shippingIncomingRateText || "", "low-rate-value");
    appendCell(tr, row.scheduleSummary || "");
    appendCell(tr, row.statusLabel || "낮은 출고율 확인필요", "validation-cell");
    lowRateTableBody.append(tr);
  }
}

function renderWeekButtons(summary) {
  weekButtons.replaceChildren();

  if (!summary?.availableWeeks?.length) {
    return;
  }

  for (const week of summary.availableWeeks) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "week-button",
      week.isFuture ? "future" : "",
      week.label === summary.weekLabel ? "active" : ""
    ].filter(Boolean).join(" ");
    button.textContent = week.label;
    button.title = `${week.startDate} ~ ${week.endDate}`;
    button.addEventListener("click", () => {
      startDateInput.value = week.startDate;
      endDateInput.value = week.endDate;
      endDateFollowsStart = week.startDate === week.endDate;
      loadPreview();
      loadActiveSupplementalData();
    });
    weekButtons.append(button);
  }
}

function populateDetailFilters(filters = {}) {
  shippingDateOptions = (filters.shippingDates || []).map((date) => ({
    value: date.key,
    label: `${date.label} (${date.count})`
  }));
  categoryOptions = (filters.categories || []).map((category) => ({
    value: category.value,
    label: `${category.label} (${category.count})`
  }));
  itemOptions = (filters.items || []).map((item) => ({
    value: item.code,
    label: `${item.label} (${item.count})`
  }));
  selectedShippingDates.clear();
  selectedCategories.clear();
  selectedItemCodes.clear();
  renderMultiFilter(shippingDateFilterMenu, shippingDateFilterButton, shippingDateOptions, selectedShippingDates, "전체 출고일자");
  renderMultiFilter(categoryFilterMenu, categoryFilterButton, categoryOptions, selectedCategories, "전체 구분");
  renderMultiFilter(itemFilterMenu, itemFilterButton, itemOptions, selectedItemCodes, "전체 아이템");
  itemSearchInput.value = "";
  styleSearchInput.value = "";
}

function renderMultiFilter(menu, button, options, selectedSet, allLabel) {
  menu.replaceChildren();

  const allOption = createMultiFilterOption({
    label: allLabel,
    checked: selectedSet.size === 0,
    onChange: () => {
      selectedSet.clear();
      renderMultiFilter(menu, button, options, selectedSet, allLabel);
      renderFilteredTable();
    }
  });
  menu.append(allOption);

  for (const option of options) {
    const element = createMultiFilterOption({
      label: option.label,
      checked: selectedSet.has(option.value),
      onChange: (checked) => {
        if (checked) {
          selectedSet.add(option.value);
        } else {
          selectedSet.delete(option.value);
        }
        updateMultiFilterButton(button, options, selectedSet, allLabel);
        renderMultiFilter(menu, button, options, selectedSet, allLabel);
        renderFilteredTable();
      }
    });
    menu.append(element);
  }

  updateMultiFilterButton(button, options, selectedSet, allLabel);
}

function createMultiFilterOption({ label, checked, onChange }) {
  const wrapper = document.createElement("label");
  wrapper.className = "multi-filter-option";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  checkbox.addEventListener("change", () => onChange(checkbox.checked));
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(checkbox, text);
  return wrapper;
}

function updateMultiFilterButton(button, options, selectedSet, allLabel) {
  button.textContent = selectedSet.size === 0
    ? allLabel
    : selectedSet.size === 1
      ? options.find((option) => selectedSet.has(option.value))?.label || "1개 선택"
      : `${selectedSet.size}개 선택`;
}

function toggleMultiFilter(menu, button) {
  const willOpen = menu.hidden;
  closeMultiFilter(shippingDateFilterMenu, shippingDateFilterButton);
  closeMultiFilter(categoryFilterMenu, categoryFilterButton);
  closeMultiFilter(itemFilterMenu, itemFilterButton);
  menu.hidden = !willOpen;
  button.setAttribute("aria-expanded", String(willOpen));
}

function closeMultiFilter(menu, button) {
  menu.hidden = true;
  button.setAttribute("aria-expanded", "false");
}

function renderWeeklySummary(summary) {
  weeklySummaryHead.replaceChildren();
  weeklySummaryBody.replaceChildren();

  if (!summary) {
    renderEmptyWeeklySummary();
    return;
  }

  const topRow = document.createElement("tr");
  appendHeader(topRow, summary.weekLabel, { rowSpan: 2 });
  appendHeader(topRow, "TOTAL", { colSpan: 2, className: "total-group total-group-left total-group-right" });

  for (const day of summary.days) {
    const dayClassName = day.closed ? "closed-day" : day.overCapacity ? "capacity-over" : "";
    appendHeader(topRow, day.label, { className: dayClassName, title: day.closedReason });
    appendHeader(topRow, String(day.dateNumber), { className: dayClassName, title: day.closedReason });
  }

  const subRow = document.createElement("tr");
  appendHeader(subRow, "STY", { className: "sub-head total-group-left" });
  appendHeader(subRow, "출고량", { className: "sub-head total-group-right" });

  for (const day of summary.days) {
    appendHeader(subRow, "STY", { className: day.closed ? "sub-head closed-day" : "sub-head" });
    appendHeader(subRow, day.closed ? day.closedReason : "출고량", {
      className: day.closed ? "sub-head closed-day" : day.overCapacity ? "sub-head capacity-over" : "sub-head"
    });
  }

  weeklySummaryHead.append(topRow, subRow);

  for (const row of summary.rows) {
    const tr = document.createElement("tr");
    if (row.label === "여성복" || row.label === "잡화") {
      tr.className = "summary-band-row";
    }

    appendCell(tr, row.label, "row-label");
    appendCell(tr, formatNumber(row.total.style), "number-cell total-group-left");
    appendCell(tr, formatNumber(row.total.quantity), "number-cell total-group-right");

    for (const day of summary.days) {
      const daily = row.daily[day.key];
      appendCell(tr, formatNumber(daily.style), day.closed ? "number-cell closed-day" : "number-cell");
      appendCell(
        tr,
        formatNumber(daily.quantity),
        day.closed
          ? "number-cell closed-day"
          : row.label === "TOTAL" && day.overCapacity
            ? "number-cell capacity-over"
            : "number-cell"
      );
    }

    weeklySummaryBody.append(tr);
  }

  renderCapacityAlert(summary.overCapacityDays);
}

function renderCapacityAlert(overCapacityDays = []) {
  if (overCapacityDays.length === 0) {
    capacityAlert.hidden = false;
    capacityAlert.className = "capacity-alert neutral";
    capacityAlert.textContent = "캐파 초과 없음";
    return;
  }

  capacityAlert.hidden = false;
  capacityAlert.className = "capacity-alert";
  capacityAlert.textContent = `캐파 초과: ${overCapacityDays
    .map((day) => `${day.label} ${formatNumber(day.quantity)} / ${formatNumber(day.capacity)}`)
    .join(", ")}`;
}

function renderEmptyWeeklySummary() {
  weeklySummaryHead.replaceChildren();
  weeklySummaryBody.replaceChildren();
  renderCapacityAlert([]);

  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.className = "empty-summary-cell";
  td.colSpan = 13;
  td.textContent = "표시할 요약 데이터가 없습니다.";
  tr.append(td);
  weeklySummaryBody.append(tr);
}

function appendHeader(row, text, options = {}) {
  const th = document.createElement("th");
  th.textContent = text;
  if (options.colSpan) {
    th.colSpan = options.colSpan;
  }
  if (options.rowSpan) {
    th.rowSpan = options.rowSpan;
  }
  if (options.className) {
    th.className = options.className;
  }
  if (options.title) {
    th.title = options.title;
  }
  row.append(th);
}

function appendCell(row, text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) {
    td.className = className;
  }
  row.append(td);
}

function renderFilteredTable() {
  const rows = getVisibleRows();
  renderTable(latestColumns, rows);
  downloadButton.disabled = rows.length === 0;
  detailCount.textContent = latestRows.length ? `${formatNumber(rows.length)} / ${formatNumber(latestRows.length)}` : "";
}

function getVisibleRows() {
  const itemSearch = normalizeSearch(itemSearchInput.value);
  const styleSearch = normalizeSearch(styleSearchInput.value);

  const filtered = latestRows.filter((row) => {
    if (selectedShippingDates.size > 0 && !selectedShippingDates.has(row.shippingDateKey)) {
      return false;
    }
    if (selectedCategories.size > 0 && !selectedCategories.has(row.itemCategory)) {
      return false;
    }
    if (selectedItemCodes.size > 0 && !selectedItemCodes.has(row.itemCode)) {
      return false;
    }
    if (itemSearch && !String(row.itemSearchText || "").includes(itemSearch)) {
      return false;
    }
    if (styleSearch && !String(row.styleSearchText || normalizeSearch(row.style)).includes(styleSearch)) {
      return false;
    }
    return true;
  });

  return sortRows(filtered);
}

function sortRows(rows) {
  const direction = sortState.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const primary = compareSortKey(left, right, sortState.key);
    return (primary || compareValues(left.shippingDateKey, right.shippingDateKey) || compareValues(left.style, right.style) || compareValues(left.round, right.round)) * direction;
  });
}

function renderTable(columns = [], rows = []) {
  tableHead.replaceChildren();
  tableBody.replaceChildren();

  const visibleColumns = columns.length ? columns : FALLBACK_COLUMNS;

  for (const column of visibleColumns) {
    const th = document.createElement("th");
    if (column.sortable) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sort-button";
      button.dataset.sortKey = column.key;
      button.textContent = `${column.header}${sortIndicator(column.key)}`;
      button.addEventListener("click", () => toggleSort(column.key));
      th.append(button);
    } else {
      th.textContent = column.header;
    }
    tableHead.append(th);
  }

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = visibleColumns.length;
    td.textContent = "표시할 출고 데이터가 없습니다.";
    tr.append(td);
    tableBody.append(tr);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const column of visibleColumns) {
      const td = document.createElement("td");
      if (column.key === "round") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "round-button";
        button.textContent = row[column.key] || "";
        button.title = "차수별 입출고 예정";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          toggleRoundDetail(row.id);
        });
        td.append(button);
      } else {
        td.textContent = row[column.key] || "";
      }
      tr.append(td);
    }
    tableBody.append(tr);

    if (expandedRowId === row.id) {
      tableBody.append(renderRoundDetailRow(row, visibleColumns.length));
    }
  }
}

function toggleRoundDetail(rowId) {
  const scrollLeft = window.scrollX;
  const scrollTop = window.scrollY;

  expandedRowId = expandedRowId === rowId ? "" : rowId;
  renderFilteredTable();

  requestAnimationFrame(() => {
    window.scrollTo(scrollLeft, scrollTop);
  });
}

function renderRoundDetailRow(row, colSpan) {
  const tr = document.createElement("tr");
  tr.className = "round-detail-row";
  const td = document.createElement("td");
  td.colSpan = colSpan;

  const panel = document.createElement("div");
  panel.className = "round-detail-panel";

  const title = document.createElement("div");
  title.className = "round-detail-title";
  title.textContent = `${row.style} 차수별 입출고 예정`;
  panel.append(title);

  if (!row.roundDetails?.length) {
    const empty = document.createElement("p");
    empty.className = "round-detail-empty";
    empty.textContent = "차수 데이터가 없습니다.";
    panel.append(empty);
    td.append(panel);
    tr.append(td);
    return tr;
  }

  const table = document.createElement("table");
  table.className = "round-detail-table";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of ["스타일", "차수", "출고 예정일", "입고예정일", "수량", "입고비중", "출고매장"]) {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  const totalQuantity = row.roundDetails.reduce((sum, detail) => sum + (detail.quantityNumber || parseNumber(detail.quantity)), 0);
  const rateSource = row.roundDetails.find((detail) => detail.orderQuantity || detail.cumulativeIncomingQuantity);
  const orderQuantity = rateSource?.orderQuantity ?? 0;
  const incomingQuantity = rateSource?.cumulativeIncomingQuantity ?? 0;
  const totalShippingOrderRateText = orderQuantity > 0 ? formatPercent(totalQuantity / orderQuantity) : "";

  for (const detail of row.roundDetails) {
    const detailRow = document.createElement("tr");
    if (detail.style === row.style && detail.round === row.round && detail.shippingDate === row.shippingDate) {
      detailRow.className = "current-round";
    }
    const detailValues = [
      { value: detail.style },
      { value: detail.round },
      { value: detail.shippingDate },
      { value: detail.incomingDate },
      { value: detail.quantity },
      {
        value: detail.shippingOrderRateText,
        title: detail.shippingOrderRateText
          ? `수량 ${formatNumber(detail.quantityNumber || parseNumber(detail.quantity))} / 누적 발주량 ${formatNumber(detail.orderQuantity)}`
          : ""
      },
      { value: detail.stores }
    ];
    for (const { value, title } of detailValues) {
      const tdDetail = document.createElement("td");
      tdDetail.textContent = value || "";
      if (title) {
        tdDetail.title = title;
      }
      detailRow.append(tdDetail);
    }
    tbody.append(detailRow);
  }
  tbody.append(renderRoundTotalRow(totalQuantity, totalShippingOrderRateText, orderQuantity));
  table.append(tbody);
  panel.append(table);

  panel.append(renderRoundDetailSummary(orderQuantity, incomingQuantity, rateSource?.receivingRateText || ""));

  td.append(panel);
  tr.append(td);
  return tr;
}

function renderRoundTotalRow(totalQuantity, totalShippingOrderRateText, orderQuantity) {
  const tr = document.createElement("tr");
  tr.className = "round-total-row";
  const values = [
    "TOTAL",
    "",
    "",
    "",
    formatNumber(totalQuantity),
    totalShippingOrderRateText,
    ""
  ];
  for (const value of values) {
    const td = document.createElement("td");
    td.textContent = value;
    if (value === totalShippingOrderRateText && totalShippingOrderRateText) {
      td.title = `총 수량 ${formatNumber(totalQuantity)} / 누적 발주량 ${formatNumber(orderQuantity)}`;
    }
    tr.append(td);
  }
  return tr;
}

function renderRoundDetailSummary(orderQuantity, incomingQuantity, receivingRateText) {
  const summary = document.createElement("div");
  summary.className = "round-detail-summary";

  for (const item of [
    ["발주량", orderQuantity ? formatNumber(orderQuantity) : "-"],
    ["누적 입고량", incomingQuantity ? formatNumber(incomingQuantity) : "-"],
    ["입고 비중", receivingRateText || "-"]
  ]) {
    const badge = document.createElement("div");
    badge.className = "round-detail-total";
    const label = document.createElement("span");
    label.className = "round-detail-total-label";
    label.textContent = item[0];
    const value = document.createElement("strong");
    value.textContent = item[1];
    badge.append(label, value);
    summary.append(badge);
  }

  return summary;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return `${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

function toggleSort(key) {
  if (sortState.key === key) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState = { key, direction: "asc" };
  }
  expandedRowId = "";
  renderFilteredTable();
}

function sortIndicator(key) {
  if (sortState.key !== key) {
    return "";
  }
  return sortState.direction === "asc" ? " ▲" : " ▼";
}

function renderEmptyTable() {
  latestColumns = FALLBACK_COLUMNS;
  renderTable(FALLBACK_COLUMNS, []);
  detailCount.textContent = "";
}

function setStatus(message, type = "") {
  statusBox.className = type ? `status ${type}` : "status";
  statusBox.textContent = message;
}

function todayLocalDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value ?? 0);
}

function formatDisplayDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value || "";
  }
  return `${Number(match[2])}월 ${Number(match[3])}일`;
}

function parseNumber(value) {
  const parsed = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareValues(left, right) {
  return String(left || "").localeCompare(String(right || ""), "ko-KR", { numeric: true, sensitivity: "base" });
}

function compareSortKey(left, right, key) {
  if (key === "style") {
    return compareValues(left.style, right.style);
  }
  if (key === "itemCategory") {
    return compareValues(left.itemCategory, right.itemCategory);
  }
  return compareValues(left.shippingDateKey, right.shippingDateKey);
}

function normalizeSearch(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}
