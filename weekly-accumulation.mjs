export const WEEKLY_BOARD_SHEET_NAME = "주간납기판";
export const WEEKLY_ACCUMULATION_SHEET_NAME = "주간납기누적";

const WEEKLY_COLUMNS = {
  style: colToIndex("C"),
  round: colToIndex("D"),
  plannerName: colToIndex("CA"),
  orderQuantity: colToIndex("DH"),
  remainingQuantity: colToIndex("DJ"),
  incomingStatus: colToIndex("DL"),
  scheduleStart: colToIndex("DQ"),
  periodScheduleStart: colToIndex("DZ"),
  coreProduct: colToIndex("EH")
};

const VALIDATION_LABELS = {
  ok: "정상",
  needs_check: "데이터 확인 필요",
  over: "발주량 초과",
  order_missing: "발주량 확인 필요",
  remaining_missing: "잔량 확인 필요"
};

const COMPARISON_FIELDS = [
  "style",
  "round",
  "groupKey",
  "groupNumber",
  "sourceRow",
  "plannerName",
  "incomingStatus",
  "orderQuantity",
  "remainingQuantity",
  "incomingType",
  "incomingPeriod",
  "incomingDate",
  "incomingQuantity",
  "incomingAmount"
];

export function getDefaultShippingFields(item = {}) {
  const shippingDate = getDefaultShippingDate(item.incomingDate);
  const shippingQuantity = getDefaultShippingQuantity(item.incomingQuantity);
  return {
    shippingDate,
    shippingQuantity,
    shippingStores: getDefaultShippingStores(shippingQuantity)
  };
}

export function withDefaultShippingFields(item = {}) {
  const defaults = getDefaultShippingFields(item);
  const shippingQuantity = isQuantity(item.shippingQuantity)
    ? Number(item.shippingQuantity)
    : defaults.shippingQuantity;
  return {
    ...item,
    incomingType: cleanCell(item.incomingType) || (cleanCell(item.incomingPeriod) ? "period" : "dated"),
    incomingPeriod: cleanCell(item.incomingPeriod),
    shippingDate: cleanCell(item.shippingDate) || defaults.shippingDate,
    shippingQuantity,
    shippingStores: cleanCell(item.shippingStores) || getDefaultShippingStores(shippingQuantity)
  };
}

export function parseWeeklyBoardRows(rows, options = {}) {
  const referenceYear = Number(options.referenceYear) || new Date().getFullYear();
  const periodLabels = buildPeriodLabels(rows);
  const items = [];

  rows.forEach((row, rowIndex) => {
    const style = cleanCell(row[WEEKLY_COLUMNS.style]).toUpperCase();
    if (!isStyleCode(style)) {
      return;
    }

    const round = normalizeRound(row[WEEKLY_COLUMNS.round]);
    const groupKey = `${style}|${round}`;
    const base = {
      style,
      round,
      groupKey,
      sourceRow: rowIndex + 1,
      plannerName: cleanCell(row[WEEKLY_COLUMNS.plannerName]),
      incomingStatus: cleanCell(row[WEEKLY_COLUMNS.incomingStatus]),
      orderQuantity: parseQuantity(row[WEEKLY_COLUMNS.orderQuantity]),
      remainingQuantity: parseQuantity(row[WEEKLY_COLUMNS.remainingQuantity])
    };

    let groupNumber = 1;
    for (
      let dateColumn = WEEKLY_COLUMNS.scheduleStart;
      dateColumn < WEEKLY_COLUMNS.periodScheduleStart;
      dateColumn += 3
    ) {
      const quantityColumn = dateColumn + 1;
      const amountColumn = dateColumn + 2;
      if (quantityColumn >= WEEKLY_COLUMNS.coreProduct) {
        break;
      }

      const incomingDate = parseWeeklyDate(row[dateColumn], referenceYear);
      const incomingQuantity = parseQuantity(row[quantityColumn]);
      const incomingAmount = amountColumn < WEEKLY_COLUMNS.coreProduct
        ? parseQuantity(row[amountColumn])
        : null;

      if (incomingDate && incomingQuantity > 0) {
        items.push(withDefaultShippingFields({
          ...base,
          key: `${style}|${round}|${groupNumber}`,
          groupNumber,
          incomingType: "dated",
          incomingPeriod: "",
          incomingDate,
          incomingQuantity,
          incomingAmount,
          sourceStatus: "current",
          excluded: false,
          shippingConfirmed: false
        }));
      }

      groupNumber += 1;
    }

    for (
      let quantityColumn = WEEKLY_COLUMNS.periodScheduleStart;
      quantityColumn < WEEKLY_COLUMNS.coreProduct;
      quantityColumn += 2
    ) {
      const amountColumn = quantityColumn + 1;
      const incomingQuantity = parseQuantity(row[quantityColumn]);
      const incomingAmount = amountColumn < WEEKLY_COLUMNS.coreProduct
        ? parseQuantity(row[amountColumn])
        : null;

      if (incomingQuantity > 0) {
        items.push(withDefaultShippingFields({
          ...base,
          key: `${style}|${round}|${groupNumber}`,
          groupNumber,
          incomingType: "period",
          incomingPeriod: periodLabels.get(quantityColumn) || "기간 확인 필요",
          incomingDate: "",
          incomingQuantity,
          incomingAmount,
          sourceStatus: "current",
          excluded: false,
          shippingConfirmed: false
        }));
      }

      groupNumber += 1;
    }
  });

  const validation = validateWeeklyItems(items);
  return {
    items: attachValidation(items, validation),
    groups: validation.groups,
    needsCheckCount: validation.needsCheckCount
  };
}

export function mergeWeeklyAccumulated(existingItems = [], snapshotItems = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const validExistingItems = existingItems.filter((item) => isStyleCode(item.style));
  const existingByKey = new Map(validExistingItems.map((item) => [item.key, item]));
  const snapshotKeys = new Set(snapshotItems.map((item) => item.key));
  const items = [];
  const summary = {
    added: 0,
    updated: 0,
    unchanged: 0,
    preserved: 0,
    needsCheck: 0
  };

  for (const snapshotItem of snapshotItems) {
    const existing = existingByKey.get(snapshotItem.key);
    if (!existing) {
      summary.added += 1;
      items.push(withDefaultShippingFields({
        ...snapshotItem,
        sourceStatus: "current",
        excluded: Boolean(snapshotItem.excluded),
        shippingConfirmed: Boolean(snapshotItem.shippingConfirmed),
        createdAt: now,
        updatedAt: now
      }));
      continue;
    }

    if (hasMeaningfulChange(existing, snapshotItem)) {
      summary.updated += 1;
      items.push(preserveShippingFields({
        ...existing,
        ...snapshotItem,
        sourceStatus: "current",
        excluded: Boolean(existing.excluded),
        shippingConfirmed: Boolean(existing.shippingConfirmed),
        note: existing.note || snapshotItem.note || "",
        createdAt: existing.createdAt || now,
        updatedAt: now
      }, existing, snapshotItem));
    } else {
      summary.unchanged += 1;
      items.push(preserveShippingFields({
        ...existing,
        ...snapshotItem,
        sourceStatus: "current",
        excluded: Boolean(existing.excluded),
        shippingConfirmed: Boolean(existing.shippingConfirmed),
        note: existing.note || snapshotItem.note || "",
        createdAt: existing.createdAt || now,
        updatedAt: existing.updatedAt || now
      }, existing, snapshotItem));
    }
  }

  for (const existing of validExistingItems) {
    if (snapshotKeys.has(existing.key)) {
      continue;
    }
    summary.preserved += 1;
    items.push(withDefaultShippingFields({
      ...existing,
      sourceStatus: "previous"
    }));
  }

  items.sort(compareWeeklyItems);
  const validation = validateWeeklyItems(items);
  summary.needsCheck = validation.needsCheckCount;

  return {
    items: attachValidation(items, validation),
    groups: validation.groups,
    summary
  };
}

export function applyWeeklyItemEdits(items = [], edits = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const editsByKey = new Map(edits.map((edit) => [edit.key, edit]));
  const itemsByKey = new Map(items.map((item) => [item.key, item]));
  const remainingQuantityByGroup = new Map();

  for (const edit of edits) {
    if (!edit || !("remainingQuantity" in edit)) {
      continue;
    }
    const item = itemsByKey.get(edit.key);
    if (!item) {
      continue;
    }
    remainingQuantityByGroup.set(item.groupKey || `${item.style}|${item.round}`, parseQuantity(edit.remainingQuantity));
  }

  return items.map((item) => {
    const edit = editsByKey.get(item.key);
    const groupKey = item.groupKey || `${item.style}|${item.round}`;
    const hasRemainingQuantityEdit = remainingQuantityByGroup.has(groupKey);
    if (!edit && !hasRemainingQuantityEdit) {
      return item;
    }

    const next = { ...item };
    if (hasRemainingQuantityEdit) {
      next.remainingQuantity = remainingQuantityByGroup.get(groupKey);
      next.updatedAt = now;
    }
    if (!edit) {
      return next;
    }

    if ("incomingDate" in edit) {
      next.incomingDate = cleanCell(edit.incomingDate);
    }
    if ("incomingQuantity" in edit) {
      next.incomingQuantity = parseQuantity(edit.incomingQuantity);
    }
    if ("plannerName" in edit) {
      next.plannerName = cleanCell(edit.plannerName);
    }
    if ("incomingStatus" in edit) {
      next.incomingStatus = cleanCell(edit.incomingStatus);
    }
    if ("shippingDate" in edit) {
      next.shippingDate = cleanCell(edit.shippingDate);
    }
    if ("shippingQuantity" in edit) {
      next.shippingQuantity = parseQuantity(edit.shippingQuantity);
    }
    if ("shippingStores" in edit) {
      next.shippingStores = cleanCell(edit.shippingStores);
    }
    if ("note" in edit) {
      next.note = cleanCell(edit.note);
    }
    if ("excluded" in edit) {
      next.excluded = Boolean(edit.excluded);
    }
    if ("shippingConfirmed" in edit) {
      next.shippingConfirmed = Boolean(edit.shippingConfirmed);
    }
    next.updatedAt = now;
    return next;
  });
}

export function validateWeeklyItems(items = []) {
  const groupsByKey = new Map();

  for (const item of items) {
    const groupKey = item.groupKey || `${item.style}|${item.round}`;
    const group = groupsByKey.get(groupKey) || {
      groupKey,
      style: item.style,
      round: item.round,
      plannerName: item.plannerName || "",
      incomingStatus: item.incomingStatus || "",
      orderQuantity: null,
      remainingQuantity: null,
      plannedQuantity: 0,
      accumulatedQuantity: null,
      itemCount: 0,
      activeItemCount: 0,
      validationStatus: "ok",
      validationLabel: VALIDATION_LABELS.ok
    };

    group.itemCount += 1;
    if (isQuantity(item.remainingQuantity) && !isQuantity(group.remainingQuantity)) {
      group.remainingQuantity = Number(item.remainingQuantity);
    }
    if (isQuantity(item.orderQuantity) && !isQuantity(group.orderQuantity)) {
      group.orderQuantity = Number(item.orderQuantity);
    }
    if (!item.excluded && !item.shippingConfirmed) {
      group.activeItemCount += 1;
      group.plannedQuantity += isQuantity(item.incomingQuantity) ? Number(item.incomingQuantity) : 0;
    }
    groupsByKey.set(groupKey, group);
  }

  const groups = [...groupsByKey.values()].map((group) => {
    let validationStatus = "ok";
    const accumulatedQuantity = isQuantity(group.remainingQuantity)
      ? group.plannedQuantity + Number(group.remainingQuantity)
      : null;
    if (!isQuantity(group.remainingQuantity)) {
      validationStatus = "remaining_missing";
    } else if (!isQuantity(group.orderQuantity)) {
      validationStatus = "order_missing";
    } else if (accumulatedQuantity > group.orderQuantity) {
      validationStatus = "over";
    } else if (accumulatedQuantity !== group.orderQuantity) {
      validationStatus = "needs_check";
    }

    return {
      ...group,
      accumulatedQuantity,
      validationStatus,
      validationLabel: VALIDATION_LABELS[validationStatus]
    };
  }).sort((left, right) => compareValues(left.style, right.style) || compareValues(left.round, right.round));

  return {
    groups,
    needsCheckCount: groups.filter((group) => group.validationStatus !== "ok").length
  };
}

export function weeklyItemsToCsvRows(items = []) {
  return [
    [
      "key",
      "groupKey",
      "style",
      "round",
      "groupNumber",
      "sourceRow",
      "plannerName",
      "incomingStatus",
      "orderQuantity",
      "remainingQuantity",
      "incomingType",
      "incomingPeriod",
      "incomingDate",
      "incomingQuantity",
      "incomingAmount",
      "shippingDate",
      "shippingQuantity",
      "shippingStores",
      "sourceStatus",
      "excluded",
      "shippingConfirmed",
      "note",
      "createdAt",
      "updatedAt"
    ],
    ...items.map((item) => [
      item.key || "",
      item.groupKey || "",
      item.style || "",
      item.round || "",
      item.groupNumber ?? "",
      item.sourceRow ?? "",
      item.plannerName || "",
      item.incomingStatus || "",
      item.orderQuantity ?? "",
      item.remainingQuantity ?? "",
      item.incomingType || "",
      item.incomingPeriod || "",
      item.incomingDate || "",
      item.incomingQuantity ?? "",
      item.incomingAmount ?? "",
      item.shippingDate || "",
      item.shippingQuantity ?? "",
      item.shippingStores || "",
      item.sourceStatus || "",
      item.excluded ? "TRUE" : "FALSE",
      item.shippingConfirmed ? "TRUE" : "FALSE",
      item.note || "",
      item.createdAt || "",
      item.updatedAt || ""
    ])
  ];
}

export function csvRowsToWeeklyItems(rows = []) {
  const [headers = [], ...dataRows] = rows;
  const normalizedHeaders = headers.map(cleanCell);
  return dataRows
    .filter((row) => row.some((cell) => cleanCell(cell)))
    .map((row) => {
      const record = {};
      normalizedHeaders.forEach((header, index) => {
        record[header] = row[index] ?? "";
      });
      return {
        key: cleanCell(record.key),
        groupKey: cleanCell(record.groupKey),
        style: cleanCell(record.style),
        round: cleanCell(record.round),
        groupNumber: parseQuantity(record.groupNumber),
        sourceRow: parseQuantity(record.sourceRow),
        plannerName: cleanCell(record.plannerName),
        incomingStatus: cleanCell(record.incomingStatus),
        orderQuantity: parseQuantity(record.orderQuantity),
        remainingQuantity: parseQuantity(record.remainingQuantity),
        incomingType: cleanCell(record.incomingType) || (cleanCell(record.incomingPeriod) ? "period" : "dated"),
        incomingPeriod: cleanCell(record.incomingPeriod),
        incomingDate: cleanCell(record.incomingDate),
        incomingQuantity: parseQuantity(record.incomingQuantity),
        incomingAmount: parseQuantity(record.incomingAmount),
        shippingDate: cleanCell(record.shippingDate),
        shippingQuantity: parseQuantity(record.shippingQuantity),
        shippingStores: cleanCell(record.shippingStores),
        sourceStatus: cleanCell(record.sourceStatus) || "previous",
        excluded: cleanCell(record.excluded).toUpperCase() === "TRUE",
        shippingConfirmed: cleanCell(record.shippingConfirmed).toUpperCase() === "TRUE",
        note: cleanCell(record.note),
        createdAt: cleanCell(record.createdAt),
        updatedAt: cleanCell(record.updatedAt)
      };
    })
    .filter((item) => item.key);
}

function attachValidation(items, validation) {
  const groupsByKey = new Map(validation.groups.map((group) => [group.groupKey, group]));
  return items.map((item) => {
    const group = groupsByKey.get(item.groupKey);
    return {
      ...item,
      validationStatus: group?.validationStatus || "ok",
      validationLabel: group?.validationLabel || VALIDATION_LABELS.ok,
      plannedQuantity: group?.plannedQuantity ?? null,
      accumulatedQuantity: group?.accumulatedQuantity ?? null
    };
  });
}

function preserveShippingFields(base, existing, snapshotItem) {
  const defaults = getDefaultShippingFields(snapshotItem);
  const existingQuantity = isQuantity(existing.shippingQuantity)
    ? Number(existing.shippingQuantity)
    : null;
  const shippingQuantity = existingQuantity ?? defaults.shippingQuantity;
  return {
    ...base,
    shippingDate: cleanCell(existing.shippingDate) || defaults.shippingDate,
    shippingQuantity,
    shippingStores: cleanCell(existing.shippingStores) || getDefaultShippingStores(shippingQuantity)
  };
}

function hasMeaningfulChange(existing, snapshotItem) {
  return COMPARISON_FIELDS.some((field) => normalizeCompareValue(existing[field]) !== normalizeCompareValue(snapshotItem[field]));
}

function normalizeCompareValue(value) {
  return value == null ? "" : String(value);
}

function compareWeeklyItems(left, right) {
  return (
    compareValues(left.style, right.style) ||
    compareValues(left.round, right.round) ||
    Number(left.groupNumber || 0) - Number(right.groupNumber || 0) ||
    compareValues(left.incomingDate, right.incomingDate) ||
    compareValues(left.incomingPeriod, right.incomingPeriod)
  );
}

function compareValues(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "ko", { numeric: true });
}

function parseWeeklyDate(value, referenceYear) {
  const text = cleanCell(value);
  if (!text) {
    return "";
  }

  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    return formatDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = text.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    return formatDateParts(referenceYear, Number(match[1]), Number(match[2]));
  }

  match = text.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
  if (match) {
    return formatDateParts(referenceYear, Number(match[1]), Number(match[2]));
  }

  return "";
}

function buildPeriodLabels(rows) {
  const labels = new Map();
  const headerRowIndex = rows.findIndex((row) => cleanCell(row[WEEKLY_COLUMNS.style]).includes("스타일"));
  const headerRows = rows.slice(0, headerRowIndex === -1 ? Math.min(rows.length, 4) : headerRowIndex);

  for (
    let quantityColumn = WEEKLY_COLUMNS.periodScheduleStart;
    quantityColumn < WEEKLY_COLUMNS.coreProduct;
    quantityColumn += 2
  ) {
    const rawLabel = headerRows
      .map((row) => cleanCell(row[quantityColumn]))
      .find(Boolean);
    labels.set(quantityColumn, normalizePeriodLabel(rawLabel));
  }

  return labels;
}

function normalizePeriodLabel(value) {
  const text = cleanCell(value);
  if (!text) {
    return "기간 확인 필요";
  }
  if (/^\d+$/.test(text)) {
    return `${Number(text)}주뒤`;
  }
  return text;
}

function getDefaultShippingDate(value) {
  const text = cleanCell(value);
  if (!text) {
    return "";
  }
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return "";
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return "";
  }

  const weekday = date.getDay();
  const daysToAdd = weekday === 5 ? 3 : weekday === 6 ? 2 : weekday === 0 ? 1 : 1;
  date.setDate(date.getDate() + daysToAdd);
  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function getDefaultShippingQuantity(value) {
  const quantity = parseQuantity(value);
  return Number.isFinite(quantity) ? Math.round(quantity * 0.5) : null;
}

function getDefaultShippingStores(quantity) {
  return isQuantity(quantity) && Number(quantity) <= 300 ? "상위매장" : "전매장";
}

function formatDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return "";
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return "";
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return "";
  }
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function normalizeRound(value) {
  const text = cleanCell(value);
  if (!text) {
    return "";
  }
  if (/^\d+$/.test(text)) {
    return text.padStart(2, "0");
  }
  return text;
}

function parseQuantity(value) {
  const text = cleanCell(value).replace(/,/g, "");
  if (!text || text === "-") {
    return null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function isQuantity(value) {
  return value !== null && value !== "" && Number.isFinite(Number(value));
}

function isStyleCode(value) {
  const text = cleanCell(value).toUpperCase();
  return text.length >= 5 && /^[A-Z0-9-]+$/.test(text) && /[A-Z]/.test(text) && /\d/.test(text);
}

function cleanCell(value) {
  return String(value ?? "").replace(/\uFEFF/g, "").trim();
}

function colToIndex(letter) {
  return [...letter.toUpperCase()].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}
