import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { SHEET_ID } from "./shipping-core.mjs";
import {
  applyWeeklyItemEdits,
  csvRowsToWeeklyItems,
  mergeWeeklyAccumulated,
  parseWeeklyBoardRows,
  validateWeeklyItems,
  weeklyItemsToCsvRows,
  WEEKLY_BOARD_SHEET_NAME,
  withDefaultShippingFields
} from "./weekly-accumulation.mjs";

const LOCAL_STORE_DIR = "mixxo-shipping-list";
const LOCAL_STORE_FILE = "weekly-accumulation.json";

export async function syncWeeklyAccumulation(deps, options = {}) {
  const existingItems = await deps.loadItems();
  const weeklyRows = await deps.fetchWeeklyRows();
  const parsed = parseWeeklyBoardRows(weeklyRows, {
    referenceYear: options.referenceYear || new Date().getFullYear()
  });
  const merged = mergeWeeklyAccumulated(existingItems, parsed.items, {
    now: options.now || new Date().toISOString()
  });
  await deps.saveItems(merged.items);
  return merged;
}

export function filterWeeklyItems(items = [], filters = {}) {
  return items.filter((item) => {
    const targetDate = item.shippingDate || item.incomingDate || "";
    if (filters.startDate && targetDate && targetDate < filters.startDate) {
      return false;
    }
    if (filters.endDate && targetDate && targetDate > filters.endDate) {
      return false;
    }
    if (filters.plannerName && item.plannerName !== filters.plannerName) {
      return false;
    }
    if (filters.issueOnly && item.validationStatus === "ok") {
      return false;
    }
    return true;
  });
}

export async function readWeeklyAccumulation(options = {}) {
  const store = createWeeklyStore(options);
  const items = (await store.loadItems()).map(withDefaultShippingFields);
  const validation = validateWeeklyItems(items);
  const itemsWithValidation = items.map((item) => {
    const group = validation.groups.find((entry) => entry.groupKey === item.groupKey);
    return {
      ...item,
      validationStatus: group?.validationStatus || "ok",
      validationLabel: group?.validationLabel || "정상",
      validationAcknowledged: group?.validationAcknowledged || false,
      validationSignature: group?.validationSignature || "",
      plannedQuantity: group?.plannedQuantity ?? null,
      accumulatedQuantity: group?.accumulatedQuantity ?? null
    };
  });
  return {
    items: itemsWithValidation,
    groups: validation.groups,
    needsCheckCount: validation.needsCheckCount,
    filters: buildWeeklyFilters(itemsWithValidation)
  };
}

export async function updateWeeklyAccumulationFromBoard(options = {}) {
  const store = createWeeklyStore(options);
  return syncWeeklyAccumulation({
    loadItems: store.loadItems,
    saveItems: store.saveItems,
    fetchWeeklyRows: () => fetchWeeklyBoardRows(options)
  }, {
    referenceYear: options.referenceYear || new Date().getFullYear(),
    now: options.now
  });
}

export async function editWeeklyAccumulation(edits = [], options = {}) {
  const store = createWeeklyStore(options);
  const existing = (await store.loadItems()).map(withDefaultShippingFields);
  const edited = applyWeeklyItemEdits(existing, edits, { now: options.now });
  const validation = validateWeeklyItems(edited);
  const itemsWithValidation = edited.map((item) => {
    const group = validation.groups.find((entry) => entry.groupKey === item.groupKey);
    return {
      ...item,
      validationStatus: group?.validationStatus || "ok",
      validationLabel: group?.validationLabel || "정상",
      validationAcknowledged: group?.validationAcknowledged || false,
      validationSignature: group?.validationSignature || "",
      plannedQuantity: group?.plannedQuantity ?? null,
      accumulatedQuantity: group?.accumulatedQuantity ?? null
    };
  });
  await store.saveItems(itemsWithValidation);
  return {
    items: itemsWithValidation,
    groups: validation.groups,
    needsCheckCount: validation.needsCheckCount,
    filters: buildWeeklyFilters(itemsWithValidation)
  };
}

export function createWeeklyStore(options = {}) {
  const scriptUrl = options.scriptUrl || process.env.WEEKLY_ACCUMULATION_SCRIPT_URL;
  const scriptSecret = options.scriptSecret || process.env.WEEKLY_ACCUMULATION_SCRIPT_SECRET || "";
  const fetchImpl = options.fetchImpl || fetch;
  const localPath = options.localPath || resolveWeeklyLocalStorePath(options.env || process.env, options.cwd || process.cwd());

  if (scriptUrl) {
    return {
      loadItems: async () => {
        const data = await callAppsScript(fetchImpl, scriptUrl, scriptSecret, {
          action: "readWeeklyAccumulation"
        });
        return Array.isArray(data.items) ? data.items : csvRowsToWeeklyItems(data.rows || []);
      },
      saveItems: async (items) => {
        await callAppsScript(fetchImpl, scriptUrl, scriptSecret, {
          action: "writeWeeklyAccumulation",
          rows: weeklyItemsToCsvRows(items),
          items
        });
      }
    };
  }

  return {
    loadItems: () => loadLocalItems(localPath),
    saveItems: (items) => saveLocalItems(localPath, items)
  };
}

export function resolveWeeklyLocalStorePath(env = process.env, cwd = process.cwd()) {
  if (isServerlessRuntime(env)) {
    return join(tmpdir(), LOCAL_STORE_DIR, LOCAL_STORE_FILE);
  }
  return join(cwd, ".local-data", LOCAL_STORE_FILE);
}

function isServerlessRuntime(env = {}) {
  return Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.LAMBDA_TASK_ROOT);
}

export async function fetchWeeklyBoardRows(options = {}) {
  const sheetId = options.sheetId || SHEET_ID;
  const sheetName = options.sheetName || WEEKLY_BOARD_SHEET_NAME;
  const fetchImpl = options.fetchImpl || fetch;
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`주간납기판을 읽을 수 없습니다. 상태 코드: ${response.status}`);
  }
  return parseCsv((await response.text()).replace(/^\uFEFF/, ""));
}

export function buildWeeklyFilters(items = []) {
  const planners = new Map();
  const statuses = new Map();
  const validations = new Map();

  for (const item of items) {
    addFilterCount(planners, item.plannerName);
    addFilterCount(statuses, item.incomingStatus);
    addFilterCount(validations, item.validationLabel);
  }

  return {
    planners: mapToFilterOptions(planners),
    statuses: mapToFilterOptions(statuses),
    validations: mapToFilterOptions(validations)
  };
}

async function loadLocalItems(localPath) {
  try {
    const text = await readFile(localPath, "utf8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function saveLocalItems(localPath, items) {
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, JSON.stringify({ items }, null, 2), "utf8");
}

async function callAppsScript(fetchImpl, scriptUrl, scriptSecret, payload) {
  const response = await fetchImpl(scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, secret: scriptSecret })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Apps Script 요청에 실패했습니다. 상태 코드: ${response.status}`);
  }
  return data;
}

function addFilterCount(map, value) {
  const key = String(value || "").trim();
  if (!key) {
    return;
  }
  map.set(key, (map.get(key) || 0) + 1);
}

function mapToFilterOptions(map) {
  return [...map.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((left, right) => left.label.localeCompare(right.label, "ko", { numeric: true }));
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
