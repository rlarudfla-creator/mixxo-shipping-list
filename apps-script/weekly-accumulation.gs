const WEEKLY_ACCUMULATION_SHEET_NAME = "주간납기누적";

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    verifySecret(payload.secret);

    if (payload.action === "readWeeklyAccumulation") {
      return jsonResponse({
        ok: true,
        rows: readWeeklyAccumulationRows()
      });
    }

    if (payload.action === "writeWeeklyAccumulation") {
      writeWeeklyAccumulationRows(payload.rows || []);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: "지원하지 않는 작업입니다." });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function readWeeklyAccumulationRows() {
  const sheet = getWeeklyAccumulationSheet();
  const range = sheet.getDataRange();
  if (!range) {
    return [];
  }
  return range.getValues();
}

function writeWeeklyAccumulationRows(rows) {
  const sheet = getWeeklyAccumulationSheet();
  sheet.clearContents();
  if (!rows.length) {
    return;
  }
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function getWeeklyAccumulationSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(WEEKLY_ACCUMULATION_SHEET_NAME)
    || spreadsheet.insertSheet(WEEKLY_ACCUMULATION_SHEET_NAME);
}

function verifySecret(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty("WEEKLY_ACCUMULATION_SCRIPT_SECRET");
  if (expected && secret !== expected) {
    throw new Error("저장소 인증값이 올바르지 않습니다.");
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
