import { deflateRawSync } from "node:zlib";

export const SHEET_ID = "1RwWis6y9UYeOXGy-y1me7QQ2PMl1nZFM8KpViDX-6t8";
export const SHEET_NAME = "출고가능리스트";
export const ITEM_SHEET_NAME = "구분";
export const BI_SHEET_NAME = "BI";
export const CSV_URL = sheetCsvUrl(SHEET_NAME);

export const OUTPUT_COLUMNS = [
  { key: "shippingDate", header: "출고일자", source: "출고일자", width: 14 },
  { key: "style", header: "스타일", source: "스타일", width: 18 },
  { key: "styleName", header: "스타일명", source: "스타일명", width: 42 },
  { key: "round", header: "차수", source: "★차수 구분 기입 차수", width: 10 },
  { key: "quantity", header: "출고수량", source: "출고수량\n(*50%)", width: 12 },
  { key: "stores", header: "출고매장", source: "출고매장", width: 24 },
  { key: "note", header: "비고", source: "비고", width: 44 }
];

export const WEB_COLUMNS = [
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

const SUMMARY_DAYS = [
  { key: "tue", label: "화", offset: 0, capacity: 16000 },
  { key: "wed", label: "수", offset: 1, capacity: 16000 },
  { key: "thu", label: "목", offset: 2, capacity: 16000 },
  { key: "fri", label: "금", offset: 3, capacity: 10000 },
  { key: "mon", label: "월", offset: 6, capacity: 10000 }
];

const SUMMARY_ROW_DEFS = [
  { label: "TOTAL", match: () => true },
  { label: "여성복", match: (record) => getItem(record) !== "잡화" },
  { label: "아우터", match: (record) => getItem(record) === "아우터" },
  { label: "원피스", match: (record) => getItem(record) === "원피스" },
  { label: "상의", match: (record) => getItem(record) === "상의" },
  { label: "하의", match: (record) => getItem(record) === "하의" },
  { label: "니트", match: (record) => getItem(record) === "니트" },
  { label: "데님", match: (record) => getItem(record) === "데님" },
  { label: "티셔츠", match: (record) => getItem(record) === "티셔츠" },
  { label: "잡화", match: (record) => getItem(record) === "잡화" }
];

export async function buildShippingList(inputDate, inputEndDate = inputDate, options = {}) {
  const { startDate, endDate } = parseDateRange(inputDate, inputEndDate);
  const targetSheetDate = formatPeriodLabel(startDate, endDate);
  const [weekHolidays, rangeHolidays, itemClassifications, receivingRates] = await Promise.all([
    loadKoreanHolidaysForWeek(startDate),
    loadKoreanHolidaysForRange(startDate, endDate),
    loadItemClassifications(),
    loadStyleReceivingRates()
  ]);
  const holidays = new Map([...weekHolidays.entries(), ...rangeHolidays.entries()]);
  const selectedDateStatus = isSameDate(startDate, endDate)
    ? getDateStatus(startDate, holidays)
    : { closed: false, reason: "" };
  const csv = await downloadCsv(SHEET_NAME, ["출고일자", "스타일"]);
  const rows = parseCsv(csv);
  const records = toRecords(rows);
  const validRecords = records.filter(isValidShippingRecord);
  const styleKeys = buildStyleKeySet(validRecords);
  const roundDetailsByProduct = buildRoundDetailIndex(validRecords, startDate.getFullYear(), styleKeys, receivingRates);
  const availableWeeks = buildAvailableWeeks(validRecords, startDate.getFullYear());
  const filtered = selectedDateStatus.closed
    ? []
    : validRecords.filter((record) => isRecordInOpenDateRange(record, startDate, endDate, holidays));
  const uniqueRecords = dedupeByProduct(filtered, styleKeys);
  const periodRows = sortOutputRows(
    uniqueRecords.map((record) => recordToOutputRow(record, itemClassifications, roundDetailsByProduct, startDate.getFullYear(), styleKeys)),
    { sortKey: "shippingDate", sortDirection: "asc" }
  );
  const outputRows = sortOutputRows(applyRowFilters(periodRows, options), options);
  const summary = buildSummary(validRecords, startDate, holidays, availableWeeks);

  return {
    date: formatFileDate(startDate),
    startDate: formatFileDate(startDate),
    endDate: formatFileDate(endDate),
    isRange: !isSameDate(startDate, endDate),
    targetSheetDate,
    selectedDateClosed: selectedDateStatus.closed,
    selectedDateClosedReason: selectedDateStatus.reason,
    sourceCount: filtered.length,
    duplicateCount: filtered.length - uniqueRecords.length,
    outputCount: outputRows.length,
    columns: WEB_COLUMNS.map(({ key, header, sortable, actionable }) => ({ key, header, sortable: Boolean(sortable), actionable: Boolean(actionable) })),
    rows: outputRows,
    filters: buildFilterMetadata(periodRows),
    summary
  };
}

export async function createShippingWorkbook(inputDate, inputEndDate = inputDate, options = {}) {
  const list = await buildShippingList(inputDate, inputEndDate, options);
  const workbookRows = list.rows.map((row) =>
    OUTPUT_COLUMNS.map((column) => row[column.key] ?? "")
  );

  return {
    ...list,
    fileName: list.isRange
      ? `출고리스트_${list.startDate}_${list.endDate}.xlsx`
      : `출고리스트_${list.date}.xlsx`,
    buffer: createXlsxBuffer([
      buildSummarySheet(list.summary),
      buildDetailSheet(workbookRows)
    ])
  };
}

export function parseDateRange(inputStartDate, inputEndDate = inputStartDate) {
  const startDate = inputStartDate instanceof Date ? inputStartDate : parseInputDate(inputStartDate);
  const endDate = inputEndDate instanceof Date ? inputEndDate : parseInputDate(inputEndDate);

  if (startDate > endDate) {
    throw new Error("시작일은 종료일보다 늦을 수 없습니다.");
  }

  return { startDate, endDate };
}

export function parseInputDate(value) {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    throw new Error("날짜는 YYYY-MM-DD 형식으로 입력해주세요. 예: 2026-05-19");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("존재하지 않는 날짜입니다.");
  }

  return date;
}

export function formatFileDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatSheetDate(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}월 ${String(date.getDate()).padStart(2, "0")}일`;
}

function sheetCsvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function downloadCsv(sheetName = SHEET_NAME, requiredColumns = []) {
  let response;
  try {
    response = await fetch(sheetCsvUrl(sheetName));
  } catch {
    throw new Error("구글 시트에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.");
  }

  if (!response.ok) {
    throw new Error(`구글 시트를 읽을 수 없습니다. 상태 코드: ${response.status}`);
  }

  const text = await response.text();
  for (const columnName of requiredColumns) {
    if (!text.includes(columnName)) {
      throw new Error("시트 데이터를 읽었지만 필요한 컬럼을 찾지 못했습니다. 시트 권한이나 탭 이름을 확인해주세요.");
    }
  }

  return text.replace(/^\uFEFF/, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function toRecords(rows) {
  const headerRowIndex = rows.findIndex((row) => row.includes("스타일") && row.includes("출고일자"));
  if (headerRowIndex === -1) {
    throw new Error("헤더 행을 찾지 못했습니다. `스타일`과 `출고일자` 컬럼이 필요합니다.");
  }

  const headers = rows[headerRowIndex].map(cleanCell);
  return rows.slice(headerRowIndex + 1).map((row) => {
    const record = { __raw: row };
    headers.forEach((header, index) => {
      if (header && !(header in record)) {
        record[header] = row[index] ?? "";
      }
    });
    return record;
  });
}

function isValidShippingRecord(record) {
  const style = cleanCell(record["스타일"]);
  const isExampleRow = record.__raw.some((cell) => cleanCell(cell).toUpperCase() === "EX.");
  return (
    style &&
    !isExampleRow &&
    !style.includes("스타일") &&
    normalizeSheetDate(record["출고일자"]) !== ""
  );
}

function dedupeByProduct(records, styleKeys) {
  const seen = new Set();
  const result = [];

  for (const record of records) {
    const productKey = getRecordProductKey(record, styleKeys);
    if (!seen.has(productKey)) {
      seen.add(productKey);
      result.push(record);
    }
  }

  return result;
}

function recordToOutputRow(record, itemClassifications, roundDetailsByProduct, year, styleKeys) {
  const row = Object.fromEntries(
    OUTPUT_COLUMNS.map((column) => [column.key, cleanCell(record[column.source] ?? "")])
  );
  const style = row.style;
  const styleKey = normalizeProductStyleCode(style);
  const reorderStyleKey = extractReorderStyleKey(row.styleName);
  const productKey = getRecordProductKey(record, styleKeys);
  const itemCode = extractItemCode(style) || cleanCell(record["아이템"]).toUpperCase();
  const itemInfo = itemClassifications.get(itemCode) || {
    code: itemCode,
    major: "",
    category: cleanCell(record["구분"]) || "미분류",
    label: itemCode ? `${itemCode}(${cleanCell(record["구분"]) || "미분류"})` : ""
  };
  const shippingDate = parseRecordDate(record["출고일자"], year);

  return {
    ...row,
    id: [formatFileDateSafe(shippingDate), productKey, style, row.round].join("|"),
    shippingDateKey: formatFileDateSafe(shippingDate),
    styleKey,
    reorderStyleKey,
    productKey,
    itemCode,
    itemMajor: itemInfo.major,
    itemCategory: itemInfo.category,
    itemDisplay: itemInfo.label,
    itemSearchText: normalizeSearch(`${itemInfo.code} ${itemInfo.major} ${itemInfo.category} ${itemInfo.label}`),
    styleSearchText: normalizeSearch(`${style} ${styleKey} ${reorderStyleKey} ${productKey}`),
    quantityNumber: parseQuantity(row.quantity),
    roundDetails: roundDetailsByProduct.get(productKey) || []
  };
}

function buildAvailableWeeks(records, year) {
  const weeks = new Map();
  const todayWeekStart = getShippingWeekTuesday(new Date());
  const minWeekStart = addDays(todayWeekStart, -28);
  const maxWeekStart = addDays(todayWeekStart, 14);

  for (const record of records) {
    const label = cleanCell(record.__raw[1]);
    const date = parseRecordDate(record["출고일자"], year);
    if (!label || !date) {
      continue;
    }

    const weekStart = getShippingWeekTuesday(date);
    if (weekStart < minWeekStart || weekStart > maxWeekStart) {
      continue;
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const relativeWeek = Math.round((weekStart - todayWeekStart) / (1000 * 60 * 60 * 24 * 7));

    if (!weeks.has(label)) {
      weeks.set(label, {
        label,
        date: formatFileDate(weekStart),
        startDate: formatFileDate(weekStart),
        endDate: formatFileDate(weekEnd),
        relativeWeek,
        isFuture: relativeWeek > 0
      });
    }
  }

  return [...weeks.values()].sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function parseRecordDate(value, year) {
  const match = cleanCell(value).match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (!match) {
    return null;
  }

  return new Date(year, Number(match[1]) - 1, Number(match[2]));
}

async function loadItemClassifications() {
  try {
    const csv = await downloadCsv(ITEM_SHEET_NAME, ["아이템코드", "구분"]);
    return toItemClassifications(parseCsv(csv));
  } catch {
    return new Map();
  }
}

function toItemClassifications(rows) {
  const headerRowIndex = rows.findIndex((row) => row.includes("아이템코드") && row.includes("구분"));
  if (headerRowIndex === -1) {
    return new Map();
  }

  const headers = rows[headerRowIndex].map(cleanCell);
  const codeIndex = headers.indexOf("아이템코드");
  const majorIndex = headers.indexOf("대분류");
  const categoryIndex = headers.indexOf("구분");
  const result = new Map();

  for (const row of rows.slice(headerRowIndex + 1)) {
    const code = cleanCell(row[codeIndex]).toUpperCase();
    if (!code) {
      continue;
    }

    const major = cleanCell(row[majorIndex]);
    const category = cleanCell(row[categoryIndex]) || major || "미분류";
    result.set(code, {
      code,
      major,
      category,
      label: `${code}(${major || category})`
    });
  }

  return result;
}

async function loadStyleReceivingRates() {
  try {
    const csv = await downloadCsv(BI_SHEET_NAME, ["발주량", "누적입고량"]);
    return toStyleReceivingRates(parseCsv(csv));
  } catch {
    return new Map();
  }
}

function toStyleReceivingRates(rows) {
  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell).includes(normalizeHeader("스타일코드(Now)"))) &&
    row.some((cell) => normalizeHeader(cell) === normalizeHeader("발주량")) &&
    row.some((cell) => normalizeHeader(cell) === normalizeHeader("[+] 누적입고량(물류+입고조정+브랜드간)"))
  );
  if (headerRowIndex === -1) {
    return new Map();
  }

  const headers = rows[headerRowIndex].map(cleanCell);
  const styleIndex = findHeaderIndexIncludes(headers, "스타일코드(Now)");
  const orderIndex = findHeaderIndex(headers, "발주량");
  const incomingIndex = findHeaderIndex(headers, "[+] 누적입고량(물류+입고조정+브랜드간)");
  const result = new Map();

  for (const row of rows.slice(headerRowIndex + 1)) {
    const style = cleanCell(row[styleIndex]).toUpperCase();
    if (!style) {
      continue;
    }

    const orderQuantity = parseQuantity(row[orderIndex]);
    const cumulativeIncomingQuantity = parseQuantity(row[incomingIndex]);
    const receivingRate = orderQuantity > 0 ? cumulativeIncomingQuantity / orderQuantity : null;
    result.set(normalizeProductStyleCode(style), {
      style,
      orderQuantity,
      cumulativeIncomingQuantity,
      receivingRate,
      receivingRateText: formatRate(receivingRate)
    });
  }

  return result;
}

function findHeaderIndex(headers, name) {
  const target = normalizeHeader(name);
  return headers.findIndex((header) => normalizeHeader(header) === target);
}

function findHeaderIndexIncludes(headers, name) {
  const target = normalizeHeader(name);
  return headers.findIndex((header) => normalizeHeader(header).includes(target));
}

function normalizeHeader(value) {
  return cleanCell(value).replace(/\s+/g, "");
}

function buildStyleKeySet(records) {
  return new Set(records.map((record) => normalizeProductStyleCode(record["스타일"])).filter(Boolean));
}

function getRecordProductKey(record, styleKeys) {
  const styleKey = normalizeProductStyleCode(record["스타일"]);
  const reorderStyleKey = extractReorderStyleKey(record["스타일명"]);
  return reorderStyleKey || styleKey;
}

function extractReorderStyleKey(styleName) {
  const match = cleanCell(styleName).toUpperCase().match(/(?:^|\s)RE\.?\s+((?:MIW|MIA)?[A-Z0-9]{5,})/);
  return match ? normalizeProductStyleCode(match[1]) : "";
}

function normalizeProductStyleCode(style) {
  const normalized = cleanCell(style).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.replace(/^(MIW|MIA)/, "");
}

function buildRoundDetailIndex(records, year, styleKeys, receivingRates = new Map()) {
  const detailMapsByProduct = new Map();

  for (const record of records) {
    const style = cleanCell(record["스타일"]);
    if (!style) {
      continue;
    }

    const productKey = getRecordProductKey(record, styleKeys);
    const styleKey = normalizeProductStyleCode(style);
    const receivingRate = receivingRates.get(styleKey);
    const shippingDate = parseRecordDate(record["출고일자"], year);
    const incomingDate = parseRecordDate(record["입고일자"], year);
    const detail = {
      style,
      styleName: cleanCell(record["스타일명"]),
      round: cleanCell(record["★차수 구분 기입 차수"]),
      shippingDate: cleanCell(record["출고일자"]),
      shippingDateKey: formatFileDateSafe(shippingDate),
      incomingDate: cleanCell(record["입고일자"]),
      incomingDateKey: formatFileDateSafe(incomingDate),
      quantity: cleanCell(record["출고수량\n(*50%)"]),
      quantityNumber: parseQuantity(record["출고수량\n(*50%)"]),
      orderQuantity: receivingRate?.orderQuantity ?? null,
      cumulativeIncomingQuantity: receivingRate?.cumulativeIncomingQuantity ?? null,
      receivingRate: receivingRate?.receivingRate ?? null,
      receivingRateText: receivingRate?.receivingRateText ?? "",
      shippingOrderRate: receivingRate?.orderQuantity > 0 ? parseQuantity(record["출고수량\n(*50%)"]) / receivingRate.orderQuantity : null,
      shippingOrderRateText: receivingRate?.orderQuantity > 0 ? formatRate(parseQuantity(record["출고수량\n(*50%)"]) / receivingRate.orderQuantity) : "",
      stores: cleanCell(record["출고매장"]),
      note: cleanCell(record["비고"])
    };

    if (!detailMapsByProduct.has(productKey)) {
      detailMapsByProduct.set(productKey, new Map());
    }
    detailMapsByProduct.get(productKey).set(roundDuplicateKey(detail), detail);
  }

  const result = new Map();
  for (const [productKey, detailMap] of detailMapsByProduct) {
    const details = [...detailMap.values()];
    details.sort((left, right) =>
      compareValues(left.round, right.round) ||
      compareValues(left.shippingDateKey, right.shippingDateKey) ||
      compareValues(left.incomingDateKey, right.incomingDateKey)
    );
    result.set(productKey, details);
  }

  return result;
}

function roundDuplicateKey(detail) {
  return [
    normalizeProductStyleCode(detail.style),
    detail.round,
    detail.quantityNumber
  ].join("|");
}

function applyRowFilters(rows, options = {}) {
  const normalized = normalizeListOptions(options);
  return rows.filter((row) => {
    if (normalized.shippingDates.length > 0 && !normalized.shippingDates.includes(row.shippingDateKey)) {
      return false;
    }
    if (normalized.itemCodes.length > 0 && !normalized.itemCodes.includes(row.itemCode)) {
      return false;
    }
    if (normalized.categories.length > 0 && !normalized.categories.includes(row.itemCategory)) {
      return false;
    }
    if (normalized.itemSearch && !row.itemSearchText.includes(normalized.itemSearch)) {
      return false;
    }
    if (normalized.styleSearch && !row.styleSearchText.includes(normalized.styleSearch)) {
      return false;
    }
    return true;
  });
}

function sortOutputRows(rows, options = {}) {
  const { sortKey, sortDirection } = normalizeListOptions(options);
  const direction = sortDirection === "desc" ? -1 : 1;
  const key = sortKey === "style" || sortKey === "itemCategory" ? sortKey : "shippingDate";

  return [...rows].sort((left, right) => {
    const primary = compareSortKey(left, right, key);
    return (primary || compareValues(left.shippingDateKey, right.shippingDateKey) || compareValues(left.style, right.style) || compareValues(left.round, right.round)) * direction;
  });
}

function normalizeListOptions(options = {}) {
  const sortKey = ["style", "itemCategory"].includes(options.sortKey) ? options.sortKey : "shippingDate";
  const sortDirection = options.sortDirection === "desc" ? "desc" : "asc";
  const shippingDates = normalizeOptionList(options.shippingDates ?? options.shippingDate);
  const itemCodes = normalizeOptionList(options.itemCodes ?? options.itemCode).map((value) => value.toUpperCase());
  const categories = normalizeOptionList(options.categories ?? options.category);
  return {
    shippingDates,
    itemCodes,
    categories,
    shippingDate: shippingDates[0] || "",
    itemCode: itemCodes[0] || "",
    category: categories[0] || "",
    itemSearch: normalizeSearch(options.itemSearch),
    styleSearch: normalizeSearch(options.styleSearch),
    sortKey,
    sortDirection
  };
}

function normalizeOptionList(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map(cleanCell).filter(Boolean))];
}

function buildFilterMetadata(rows) {
  const shippingDates = new Map();
  const categories = new Map();
  const items = new Map();

  for (const row of rows) {
    if (row.shippingDateKey) {
      const entry = shippingDates.get(row.shippingDateKey) || {
        key: row.shippingDateKey,
        label: row.shippingDate,
        count: 0
      };
      entry.count += 1;
      shippingDates.set(row.shippingDateKey, entry);
    }

    if (row.itemCode) {
      const entry = items.get(row.itemCode) || {
        code: row.itemCode,
        label: row.itemDisplay,
        major: row.itemMajor,
        category: row.itemCategory,
        count: 0
      };
      entry.count += 1;
      items.set(row.itemCode, entry);
    }

    if (row.itemCategory) {
      const entry = categories.get(row.itemCategory) || {
        value: row.itemCategory,
        label: row.itemCategory,
        count: 0
      };
      entry.count += 1;
      categories.set(row.itemCategory, entry);
    }
  }

  return {
    shippingDates: [...shippingDates.values()].sort((left, right) => left.key.localeCompare(right.key)),
    categories: [...categories.values()].sort((left, right) => compareValues(left.label, right.label)),
    items: [...items.values()].sort((left, right) => compareValues(left.label, right.label))
  };
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

function extractItemCode(style) {
  const normalized = cleanCell(style).toUpperCase();
  return normalized.length >= 5 ? normalized.slice(3, 5) : "";
}

function buildSummary(records, selectedDate, holidays, availableWeeks = []) {
  const weekStart = getShippingWeekTuesday(selectedDate);
  const dayDates = Object.fromEntries(
    SUMMARY_DAYS.map((day) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + day.offset);
      const status = getDateStatus(date, holidays);
      return [
        day.key,
        {
          date,
          sheetDate: formatSheetDate(date),
          dateNumber: date.getDate(),
          closed: status.closed,
          closedReason: status.reason
        }
      ];
    })
  );
  const recordsByDay = Object.fromEntries(
    SUMMARY_DAYS.map((day) => [
      day.key,
      dayDates[day.key].closed
        ? []
        : records.filter((record) => normalizeSheetDate(record["출고일자"]) === dayDates[day.key].sheetDate)
    ])
  );
  const weekRecords = Object.values(recordsByDay).flat();
  const weekLabel = weekRecords.find((record) => cleanCell(record.__raw[1]))?.__raw[1] || "출고주차";
  const rows = SUMMARY_ROW_DEFS.map((rowDef) => {
    const matchingRecords = weekRecords.filter(rowDef.match);
    const daily = Object.fromEntries(
      SUMMARY_DAYS.map((day) => [day.key, summarizeRecords(recordsByDay[day.key].filter(rowDef.match))])
    );

    return {
      label: rowDef.label,
      total: summarizeRecords(matchingRecords),
      daily
    };
  });

  const totalRow = rows[0];
  const days = SUMMARY_DAYS.map((day) => {
    const quantity = totalRow.daily[day.key].quantity;
    return {
      ...day,
      dateNumber: dayDates[day.key].dateNumber,
      closed: dayDates[day.key].closed,
      closedReason: dayDates[day.key].closedReason,
      totalStyle: totalRow.daily[day.key].style,
      totalQuantity: quantity,
      overCapacity: !dayDates[day.key].closed && quantity > day.capacity
    };
  });

  return {
    weekLabel,
    availableWeeks,
    days,
    rows,
    closedDays: days
      .filter((day) => day.closed)
      .map((day) => ({
        label: day.label,
        dateNumber: day.dateNumber,
        reason: day.closedReason
      })),
    overCapacityDays: days
      .filter((day) => day.overCapacity)
      .map((day) => ({
        label: day.label,
        dateNumber: day.dateNumber,
        quantity: day.totalQuantity,
        capacity: day.capacity
      }))
  };
}

const HOLIDAY_CALENDAR_URL = "https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics";
const holidayCache = new Map();

async function loadKoreanHolidaysForWeek(selectedDate) {
  const weekStart = getShippingWeekTuesday(selectedDate);
  const years = new Set();

  for (const day of SUMMARY_DAYS) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + day.offset);
    years.add(date.getFullYear());
  }

  const holidayMaps = await Promise.all([...years].map((year) => loadKoreanHolidays(year)));
  return new Map(holidayMaps.flatMap((holidayMap) => [...holidayMap.entries()]));
}

async function loadKoreanHolidaysForRange(startDate, endDate) {
  const years = new Set();
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    years.add(cursor.getFullYear());
    cursor.setDate(cursor.getDate() + 1);
  }

  const holidayMaps = await Promise.all([...years].map((year) => loadKoreanHolidays(year)));
  return new Map(holidayMaps.flatMap((holidayMap) => [...holidayMap.entries()]));
}

async function loadKoreanHolidays(year) {
  if (holidayCache.has(year)) {
    return holidayCache.get(year);
  }

  const holidayPromise = fetchKoreanHolidaysFromGoogle(year)
    .catch(() => fetchKoreanHolidaysFromNager(year))
    .catch(() => new Map());
  holidayCache.set(year, holidayPromise);
  return holidayPromise;
}

async function fetchKoreanHolidaysFromGoogle(year) {
  const response = await fetch(HOLIDAY_CALENDAR_URL);
  if (!response.ok) {
    throw new Error("공휴일 캘린더를 읽을 수 없습니다.");
  }

  return parseHolidayIcs(await response.text(), year);
}

async function fetchKoreanHolidaysFromNager(year) {
  const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
  if (!response.ok) {
    throw new Error("공휴일 API를 읽을 수 없습니다.");
  }

  const holidays = await response.json();
  return new Map(
    holidays.map((holiday) => [
      holiday.date,
      holiday.localName || holiday.name || "공휴일"
    ])
  );
}

function parseHolidayIcs(text, year) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const holidays = new Map();

  for (const event of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const dateMatch = event.match(/DTSTART(?:;VALUE=DATE)?:(\d{8})/);
    const summaryMatch = event.match(/SUMMARY:(.+)/);
    if (!dateMatch || !summaryMatch) {
      continue;
    }

    const dateKey = `${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)}`;
    if (!dateKey.startsWith(`${year}-`)) {
      continue;
    }

    holidays.set(dateKey, decodeIcsText(summaryMatch[1]));
  }

  return holidays;
}

function decodeIcsText(value) {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .trim();
}

function getDateStatus(date, holidays) {
  const weekday = date.getDay();
  if (weekday === 6 || weekday === 0) {
    return { closed: true, reason: "주말" };
  }

  const holidayName = holidays.get(formatFileDate(date));
  if (holidayName) {
    return { closed: true, reason: holidayName };
  }

  return { closed: false, reason: "" };
}

function summarizeRecords(records) {
  return {
    style: records.length,
    quantity: records.reduce((sum, record) => sum + parseQuantity(record["출고수량\n(*50%)"]), 0)
  };
}

function isRecordInOpenDateRange(record, startDate, endDate, holidays) {
  const recordDate = parseRecordDate(record["출고일자"], startDate.getFullYear());
  if (!recordDate || recordDate < startDate || recordDate > endDate) {
    return false;
  }

  return !getDateStatus(recordDate, holidays).closed;
}

function getShippingWeekTuesday(date) {
  const result = new Date(date);
  const weekday = result.getDay();
  const delta = weekday === 0 ? -5 : weekday === 1 ? -6 : 2 - weekday;
  result.setDate(result.getDate() + delta);
  return result;
}

function getItem(record) {
  return cleanCell(record["구분"]);
}

function parseQuantity(value) {
  const normalized = cleanCell(value).replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareValues(left, right) {
  return String(left || "").localeCompare(String(right || ""), "ko-KR", { numeric: true, sensitivity: "base" });
}

function formatRate(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return `${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

function formatPeriodLabel(startDate, endDate) {
  if (isSameDate(startDate, endDate)) {
    return formatSheetDate(startDate);
  }

  return `${formatSheetDate(startDate)} ~ ${formatSheetDate(endDate)}`;
}

function isSameDate(left, right) {
  return formatFileDate(left) === formatFileDate(right);
}

function normalizeSheetDate(value) {
  const text = cleanCell(value);
  const match = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (!match) {
    return text;
  }

  return `${String(Number(match[1])).padStart(2, "0")}월 ${String(Number(match[2])).padStart(2, "0")}일`;
}

function cleanCell(value) {
  return String(value ?? "").replace(/\r/g, "").trim();
}

function normalizeSearch(value) {
  return cleanCell(value).toUpperCase().replace(/\s+/g, " ");
}

function formatFileDateSafe(date) {
  return date ? formatFileDate(date) : "";
}

function buildSummarySheet(summary) {
  const rows = [
    [{ value: "■ 출고 리스트 요약", style: 1 }],
    [],
    [
      { value: summary.weekLabel, style: 2 },
      { value: "TOTAL", style: 2 },
      { value: "", style: 2 },
      ...summary.days.flatMap((day) => [
        { value: day.label, style: day.closed ? 9 : 2 },
        { value: day.dateNumber, style: day.closed ? 9 : 2, type: "number" }
      ])
    ],
    [
      { value: "", style: 2 },
      { value: "STY", style: 3 },
      { value: "출고량", style: 3 },
      ...summary.days.flatMap((day) => [
        { value: "STY", style: day.closed ? 9 : 3 },
        { value: day.closed ? day.closedReason : "출고량", style: day.closed ? 9 : 3 }
      ])
    ],
    ...summary.rows.map((row, rowIndex) => {
      const isTotal = row.label === "TOTAL";
      const isWomen = row.label === "여성복";
      const rowStyle = isWomen || row.label === "잡화" ? 6 : 4;
      return [
        { value: row.label, style: rowStyle },
        { value: row.total.style, style: 5, type: "number" },
        { value: row.total.quantity, style: 5, type: "number" },
        ...summary.days.flatMap((day) => {
          const daily = row.daily[day.key];
          const style = day.closed ? 9 : 5;
          const quantityStyle = day.closed ? 9 : isTotal && day.overCapacity ? 7 : 5;
          return [
            { value: daily.style, style, type: "number" },
            { value: daily.quantity, style: quantityStyle, type: "number" }
          ];
        })
      ];
    })
  ];

  if (summary.overCapacityDays.length > 0) {
    rows.push([]);
    rows.push([
      {
        value: `캐파 초과: ${summary.overCapacityDays
          .map((day) => `${day.label} ${formatNumber(day.quantity)} / ${formatNumber(day.capacity)}`)
          .join(", ")}`,
        style: 7
      }
    ]);
  }

  if (summary.closedDays.length > 0) {
    rows.push([
      {
        value: `출고 불가: ${summary.closedDays
          .map((day) => `${day.label} ${day.dateNumber}일 ${day.reason}`)
          .join(", ")}`,
        style: 9
      }
    ]);
  }

  return {
    name: "출고요약",
    columns: [14, ...Array.from({ length: 2 + summary.days.length * 2 }, () => 12)],
    rows,
    merges: ["A3:A4", "B3:C3"]
  };
}

function buildDetailSheet(workbookRows) {
  return {
    name: "출고리스트",
    columns: OUTPUT_COLUMNS.map((column) => column.width),
    rows: [
      OUTPUT_COLUMNS.map((column) => ({ value: column.header, style: 2 })),
      ...workbookRows.map((row) => row.map((value) => ({ value, style: 8 })))
    ]
  };
}

function createXlsxBuffer(sheets) {
  const worksheetFiles = Object.fromEntries(
    sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet)])
  );
  const files = {
    "[Content_Types].xml": contentTypesXml(sheets.length),
    "_rels/.rels": rootRelsXml(),
    "xl/workbook.xml": workbookXml(sheets),
    "xl/_rels/workbook.xml.rels": workbookRelsXml(sheets.length),
    "xl/styles.xml": stylesXml(),
    ...worksheetFiles
  };

  return createZip(files);
}

function worksheetXml(sheet) {
  const sheetRows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const normalizedCell = normalizeCell(cell);
          const cellRef = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          const style = normalizedCell.style ? ` s="${normalizedCell.style}"` : "";

          if (normalizedCell.type === "number") {
            return `<c r="${cellRef}"${style}><v>${normalizedCell.value}</v></c>`;
          }

          return `<c r="${cellRef}" t="inlineStr"${style}><is><t>${escapeXml(normalizedCell.value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const cols = (sheet.columns || [])
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const mergeXml = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <cols>${cols}</cols>
  <sheetData>${sheetRows}</sheetData>
  ${mergeXml}
</worksheet>`;
}

function normalizeCell(cell) {
  if (cell && typeof cell === "object" && "value" in cell) {
    return {
      value: cell.value ?? "",
      type: cell.type || "string",
      style: cell.style || 0
    };
  }

  return {
    value: cell ?? "",
    type: typeof cell === "number" ? "number" : "string",
    style: 0
  };
}

function contentTypesXml(sheetCount) {
  const sheets = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets}
</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(sheets) {
  const sheetXml = sheets
    .map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetXml}</sheets>
</workbook>`;
}

function workbookRelsXml(sheetCount) {
  const worksheetRels = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${worksheetRels}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="5">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><name val="Calibri"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF002060"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2D9D9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD71920"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF595959"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border/>
    <border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="3" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="3" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="3" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function columnName(number) {
  let name = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

function escapeXml(value) {
  return cleanCell(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const contentBuffer = Buffer.from(content, "utf8");
    const compressed = deflateRawSync(contentBuffer);
    const crc = crc32(contentBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localFiles.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localFiles, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
