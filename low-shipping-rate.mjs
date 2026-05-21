import { BI_SHEET_NAME, SHEET_ID, createXlsxBuffer } from "./shipping-core.mjs";

const LOW_SHIPPING_RATE_THRESHOLD = 0.4;

const LOW_SHIPPING_RATE_COLUMNS = [
  { key: "style", header: "스타일", width: 18 },
  { key: "round", header: "차수", width: 10 },
  { key: "plannerName", header: "기획자명", width: 14 },
  { key: "incomingStatus", header: "입고여부", width: 16 },
  { key: "cumulativeIncomingQuantity", header: "누적입고량", width: 14, type: "number" },
  { key: "cumulativeShippingQuantity", header: "누적출고량", width: 14, type: "number" },
  { key: "shippingIncomingRateText", header: "입고대비 출고율", width: 16 },
  { key: "scheduleSummary", header: "예정 입고일정", width: 46 },
  { key: "statusLabel", header: "확인 표시", width: 22 }
];

export function toStyleShippingRates(rows = []) {
  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell).includes(normalizeHeader("스타일코드(Now)"))) &&
    row.some((cell) => normalizeHeader(cell) === normalizeHeader("[+] 누적입고량(물류+입고조정+브랜드간)")) &&
    row.some((cell) => normalizeHeader(cell) === normalizeHeader("[+] 출고량[출고-반품](매장+고객+샘플+브랜드간+폐기)"))
  );
  if (headerRowIndex === -1) {
    return new Map();
  }

  const headers = rows[headerRowIndex].map(cleanCell);
  const styleIndex = findHeaderIndexIncludes(headers, "스타일코드(Now)");
  const incomingIndex = findHeaderIndex(headers, "[+] 누적입고량(물류+입고조정+브랜드간)");
  const shippingIndex = findHeaderIndex(headers, "[+] 출고량[출고-반품](매장+고객+샘플+브랜드간+폐기)");
  const result = new Map();

  for (const row of rows.slice(headerRowIndex + 1)) {
    const style = cleanCell(row[styleIndex]).toUpperCase();
    if (!style) {
      continue;
    }

    const cumulativeIncomingQuantity = parseQuantity(row[incomingIndex]);
    const cumulativeShippingQuantity = parseQuantity(row[shippingIndex]) ?? 0;
    const biCheckNeeded = !Number.isFinite(cumulativeIncomingQuantity) || cumulativeIncomingQuantity <= 0;
    const shippingIncomingRate = biCheckNeeded ? null : cumulativeShippingQuantity / cumulativeIncomingQuantity;

    result.set(normalizeProductStyleCode(style), {
      style,
      cumulativeIncomingQuantity,
      cumulativeShippingQuantity,
      shippingIncomingRate,
      shippingIncomingRateText: formatRate(shippingIncomingRate),
      lowShippingRate: shippingIncomingRate !== null && shippingIncomingRate <= LOW_SHIPPING_RATE_THRESHOLD,
      biCheckNeeded
    });
  }

  return result;
}

export function buildLowShippingRateRows(weeklyItems = [], styleShippingRates = new Map()) {
  const groups = new Map();

  for (const item of weeklyItems) {
    if (item.excluded || item.shippingConfirmed) {
      continue;
    }

    const styleKey = normalizeProductStyleCode(item.style);
    const rate = styleShippingRates.get(styleKey);
    if (!rate?.lowShippingRate) {
      continue;
    }

    const groupKey = styleKey;
    const group = groups.get(groupKey) || {
      style: item.style,
      rounds: new Set(),
      plannerNames: new Set(),
      incomingStatuses: new Set(),
      cumulativeIncomingQuantity: rate.cumulativeIncomingQuantity,
      cumulativeShippingQuantity: rate.cumulativeShippingQuantity,
      shippingIncomingRate: rate.shippingIncomingRate,
      shippingIncomingRateText: rate.shippingIncomingRateText,
      statusLabel: "낮은 출고율 확인필요",
      schedules: []
    };
    if (item.round) {
      group.rounds.add(item.round);
    }
    if (item.plannerName) {
      group.plannerNames.add(item.plannerName);
    }
    if (item.incomingStatus) {
      group.incomingStatuses.add(item.incomingStatus);
    }

    const scheduleLabel = item.incomingDate || item.incomingPeriod || "";
    if (scheduleLabel && Number(item.incomingQuantity) > 0) {
      group.schedules.push({
        round: item.round || "",
        incomingDate: item.incomingDate || "",
        incomingPeriod: item.incomingPeriod || "",
        scheduleLabel,
        incomingQuantity: Number(item.incomingQuantity)
      });
    }
    groups.set(groupKey, group);
  }

  return [...groups.values()]
    .map((group) => {
      const rounds = sortValues([...group.rounds]);
      const plannerNames = sortValues([...group.plannerNames]);
      const incomingStatuses = sortValues([...group.incomingStatuses]);
      const showRoundInSchedule = rounds.length > 1;
      return {
        style: group.style,
        round: rounds.join(", "),
        plannerName: plannerNames.join(", "),
        plannerNames,
        incomingStatus: incomingStatuses.join(", "),
        cumulativeIncomingQuantity: group.cumulativeIncomingQuantity,
        cumulativeShippingQuantity: group.cumulativeShippingQuantity,
        shippingIncomingRate: group.shippingIncomingRate,
        shippingIncomingRateText: group.shippingIncomingRateText,
        statusLabel: group.statusLabel,
        scheduleSummary: group.schedules
          .sort((left, right) =>
            compareValues(left.round, right.round) ||
            Number(Boolean(left.incomingPeriod)) - Number(Boolean(right.incomingPeriod)) ||
            compareValues(left.incomingDate || left.incomingPeriod, right.incomingDate || right.incomingPeriod)
          )
          .map((schedule) => `${showRoundInSchedule && schedule.round ? `${schedule.round}차 ` : ""}${schedule.scheduleLabel} ${formatNumber(schedule.incomingQuantity)}장`)
          .join(" / ")
      };
    })
    .sort((left, right) =>
      compareValues(left.plannerName, right.plannerName) ||
      compareValues(left.style, right.style) ||
      compareValues(left.round, right.round)
    );
}

export function filterLowShippingRateRows(rows = [], filters = {}) {
  const styleSearch = normalizeSearch(filters.styleSearch);
  return rows.filter((row) => {
    if (filters.plannerName && !(row.plannerNames || [row.plannerName]).includes(filters.plannerName)) {
      return false;
    }
    if (styleSearch && !normalizeSearch(row.style).includes(styleSearch)) {
      return false;
    }
    return true;
  });
}

export function buildLowShippingRateFilters(rows = []) {
  const planners = new Map();
  for (const row of rows) {
    for (const plannerName of row.plannerNames || [row.plannerName]) {
      if (!plannerName) {
        continue;
      }
      planners.set(plannerName, (planners.get(plannerName) || 0) + 1);
    }
  }
  return {
    planners: [...planners.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((left, right) => compareValues(left.label, right.label))
  };
}

export function createLowShippingRateWorkbook(rows = []) {
  const workbookRows = rows.map((row) =>
    LOW_SHIPPING_RATE_COLUMNS.map((column) => {
      const value = row[column.key] ?? "";
      return column.type === "number"
        ? { value: Number(value) || 0, type: "number", style: 8 }
        : { value, style: 8 };
    })
  );

  return {
    fileName: "낮은출고율_확인필요.xlsx",
    buffer: createXlsxBuffer([
      {
        name: "낮은출고율",
        columns: LOW_SHIPPING_RATE_COLUMNS.map((column) => column.width),
        rows: [
          LOW_SHIPPING_RATE_COLUMNS.map((column) => ({ value: column.header, style: 2 })),
          ...workbookRows
        ]
      }
    ])
  };
}

export async function fetchBiRows(options = {}) {
  const sheetId = options.sheetId || SHEET_ID;
  const sheetName = options.sheetName || BI_SHEET_NAME;
  const fetchImpl = options.fetchImpl || fetch;
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`BI 탭을 읽을 수 없습니다. 상태 코드: ${response.status}`);
  }
  return parseCsv((await response.text()).replace(/^\uFEFF/, ""));
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

function normalizeProductStyleCode(style) {
  return cleanCell(style).toUpperCase().replace(/^(MIW|MIA)/, "");
}

function normalizeSearch(value) {
  return cleanCell(value).toUpperCase().replace(/\s+/g, "");
}

function parseQuantity(value) {
  const text = cleanCell(value).replace(/,/g, "");
  if (!text || text === "-") {
    return null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function formatRate(value) {
  return value === null || !Number.isFinite(value)
    ? ""
    : `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function sortValues(values) {
  return values.filter(Boolean).sort(compareValues);
}

function compareValues(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "ko", { numeric: true });
}

function cleanCell(value) {
  return String(value ?? "").replace(/\uFEFF/g, "").trim();
}
