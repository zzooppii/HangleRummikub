import assert from "node:assert/strict";
import test from "node:test";

import { KeyedSerialExecutor } from "./keyed-serial-executor.js";

interface Gate {
  readonly promise: Promise<void>;
  open(): void;
}

function createGate(): Gate {
  let resolveGate: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolveGate = resolve;
  });

  return {
    promise,
    open(): void {
      if (resolveGate === undefined) {
        throw new Error("Gate was not initialized");
      }

      resolveGate();
    },
  };
}

test("같은 key의 작업을 등록 순서대로 실행한다", async () => {
  const executor = new KeyedSerialExecutor<string>();
  const firstStarted = createGate();
  const releaseFirst = createGate();
  const order: string[] = [];

  const first = executor.run("room-a", async () => {
    order.push("first:start");
    firstStarted.open();
    await releaseFirst.promise;
    order.push("first:end");
    return "first";
  });
  const second = executor.run("room-a", async () => {
    order.push("second:start");
    return "second";
  });

  await firstStarted.promise;
  assert.deepEqual(order, ["first:start"]);
  assert.equal(executor.activeKeyCount, 1);

  releaseFirst.open();

  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  assert.deepEqual(order, ["first:start", "first:end", "second:start"]);
  assert.equal(executor.activeKeyCount, 0);
});

test("다른 key의 작업은 서로를 block하지 않는다", async () => {
  const executor = new KeyedSerialExecutor<string>();
  const roomAStarted = createGate();
  const releaseRoomA = createGate();
  const completed: string[] = [];

  const roomA = executor.run("room-a", async () => {
    roomAStarted.open();
    await releaseRoomA.promise;
    completed.push("room-a");
  });

  await roomAStarted.promise;

  const roomB = executor.run("room-b", async () => {
    completed.push("room-b");
  });

  await roomB;
  assert.deepEqual(completed, ["room-b"]);
  assert.equal(executor.activeKeyCount, 1);

  releaseRoomA.open();
  await roomA;

  assert.deepEqual(completed, ["room-b", "room-a"]);
  assert.equal(executor.activeKeyCount, 0);
});

test("앞 작업이 reject되어도 같은 key의 다음 작업을 실행한다", async () => {
  const executor = new KeyedSerialExecutor<string>();
  const order: string[] = [];

  const failed = executor.run("room-a", async () => {
    order.push("failed");
    throw new Error("expected failure");
  });
  const recovered = executor.run("room-a", async () => {
    order.push("recovered");
    return 42;
  });

  await assert.rejects(failed, /expected failure/);
  assert.equal(await recovered, 42);
  assert.deepEqual(order, ["failed", "recovered"]);
  assert.equal(executor.activeKeyCount, 0);
});

test("성공과 실패가 완료된 뒤 사용하지 않는 key entry를 정리한다", async () => {
  const executor = new KeyedSerialExecutor<string>();
  const releaseSuccess = createGate();
  const releaseFailure = createGate();

  const success = executor.run("room-success", async () => {
    await releaseSuccess.promise;
  });
  const failure = executor.run("room-failure", async () => {
    await releaseFailure.promise;
    throw new Error("expected failure");
  });

  assert.equal(executor.activeKeyCount, 2);

  releaseSuccess.open();
  await success;
  assert.equal(executor.activeKeyCount, 1);

  releaseFailure.open();
  await assert.rejects(failure, /expected failure/);
  assert.equal(executor.activeKeyCount, 0);
});
