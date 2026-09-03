import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createHttpServer } from "./server.js";

test("GET /health가 정상 상태를 반환한다", async () => {
  const { httpServer, io } = createHttpServer();

  httpServer.listen(0, "127.0.0.1");

  try {
    await once(httpServer, "listening");

    const address = httpServer.address();

    if (address === null || typeof address === "string") {
      throw new Error("HTTP server did not bind to a TCP port.");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body: unknown = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
  } finally {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });

    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error === undefined) {
            resolve();
            return;
          }

          reject(error);
        });
      });
    }
  }
});

