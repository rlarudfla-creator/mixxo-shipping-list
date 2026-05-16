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

if (!startDateInput.value) {
  startDateInput.value = todayLocalDate();
}

endDateInput.value = startDateInput.value;
endDateFollowsStart = true;

for (const tab of viewTabs) {
  tab.addEventListener("click", () => activateView(tab.dataset.view));
}

refreshButton.addEventListener("click", loadPreview);
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
}
function handleEndDateChange() {
  endDateFollowsStart = endDateInput.value === startDateInput.value;
  loadPreview();
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
      activateView("summary");
      loadPreview();
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
