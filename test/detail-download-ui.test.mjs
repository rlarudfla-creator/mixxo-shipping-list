import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function getFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }

  throw new Error(`${functionName} body was not closed`);
}

function getClickHandlerBody(source) {
  const start = source.indexOf('downloadButton.addEventListener("click"');
  assert.notEqual(start, -1, "download click handler should exist");

  const arrowStart = source.indexOf("=>", start);
  const bodyStart = source.indexOf("{", arrowStart);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }

  throw new Error("download click handler body was not closed");
}

test("detail Excel download uses the full date range, not visible table filters", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const handlerBody = getClickHandlerBody(script);
  const paramsBody = getFunctionBody(script, "buildDetailDownloadParams");
  const renderFilteredBody = getFunctionBody(script, "renderFilteredTable");

  assert.equal(handlerBody.includes("buildDetailDownloadParams"), true);
  assert.equal(handlerBody.includes("getVisibleRows"), false);
  assert.equal(handlerBody.includes("latestRows.length === 0"), true);

  for (const filterParam of ["shippingDate", "category", "itemCode", "itemSearch", "styleSearch"]) {
    assert.equal(paramsBody.includes(filterParam), false, `${filterParam} should not limit detail downloads`);
  }
  assert.equal(paramsBody.includes("startDate"), true);
  assert.equal(paramsBody.includes("endDate"), true);
  assert.equal(paramsBody.includes("sortKey"), true);
  assert.equal(paramsBody.includes("sortDirection"), true);

  assert.equal(renderFilteredBody.includes("downloadButton.disabled = latestRows.length === 0"), true);
  assert.equal(renderFilteredBody.includes("downloadButton.disabled = rows.length === 0"), false);
});
