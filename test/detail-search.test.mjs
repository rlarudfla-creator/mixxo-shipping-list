import assert from "node:assert/strict";
import test from "node:test";

import { buildStyleSearchText } from "../shipping-core.mjs";

test("style search text includes style name as well as style code", () => {
  const searchText = buildStyleSearchText({
    style: "MIWJKG70QB",
    styleKey: "JKG70QB",
    reorderStyleKey: "",
    productKey: "JKG70QB",
    styleName: "테스트 자켓"
  });

  assert.equal(searchText.includes("MIWJKG70QB"), true);
  assert.equal(searchText.includes("테스트자켓"), true);
});
