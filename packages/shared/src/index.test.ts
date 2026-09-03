import assert from "node:assert/strict";
import test from "node:test";

import { APP_NAME } from "./index.js";

test("공용 package가 application 이름을 export한다", () => {
  assert.equal(APP_NAME, "한글 루미큐브");
});

