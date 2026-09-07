import assert from "node:assert/strict";
import test from "node:test";

import {
  runAsyncSingleFlight,
  type AsyncSingleFlightRef,
} from "./async-single-flight.js";

test("첫 호출만 실행하고 concurrent 호출에는 같은 Promise를 반환한다", async () => {
  const flightRef: AsyncSingleFlightRef = { current: null };
  let executions = 0;
  let release: () => void = () => {
    throw new Error("Single-flight resolver was not initialized.");
  };

  const first = runAsyncSingleFlight(
    flightRef,
    () =>
      new Promise<void>((resolve) => {
        executions += 1;
        release = resolve;
      }),
  );
  const concurrent = runAsyncSingleFlight(flightRef, async () => {
    executions += 1;
  });

  assert.equal(concurrent, first);
  assert.equal(executions, 1);
  release();
  await first;
  assert.equal(flightRef.current, null);
});

test("resolve 후 다음 호출을 실행할 수 있다", async () => {
  const flightRef: AsyncSingleFlightRef = { current: null };
  let executions = 0;

  await runAsyncSingleFlight(flightRef, async () => {
    executions += 1;
  });
  await runAsyncSingleFlight(flightRef, async () => {
    executions += 1;
  });

  assert.equal(executions, 2);
  assert.equal(flightRef.current, null);
});

test("reject와 error identity를 보존하고 다음 호출의 lock을 해제한다", async () => {
  const flightRef: AsyncSingleFlightRef = { current: null };
  const rejection = new Error("expected rejection");

  await assert.rejects(
    runAsyncSingleFlight(flightRef, async () => {
      throw rejection;
    }),
    (error: unknown) => error === rejection,
  );
  assert.equal(flightRef.current, null);

  let nextExecuted = false;
  await runAsyncSingleFlight(flightRef, async () => {
    nextExecuted = true;
  });
  assert.equal(nextExecuted, true);
});

test("synchronous throw를 그대로 전달하고 lock을 남기지 않는다", () => {
  const flightRef: AsyncSingleFlightRef = { current: null };
  const failure = new Error("synchronous failure");

  assert.throws(
    () =>
      runAsyncSingleFlight(flightRef, () => {
        throw failure;
      }),
    (error: unknown) => error === failure,
  );
  assert.equal(flightRef.current, null);
});
