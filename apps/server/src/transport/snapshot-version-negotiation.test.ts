import assert from "node:assert/strict";
import test from "node:test";

import { negotiateSnapshotVersion } from "./snapshot-version-negotiation.js";

test("snapshot capability 부재는 legacy V1 compatibility mode를 선택한다", () => {
  assert.deepEqual(negotiateSnapshotVersion({}), {
    ok: true,
    selectedVersion: 1,
    mode: "LEGACY_DEFAULT",
  });
});

test("snapshot capability는 server preference 순서로 공통 최고 버전을 선택한다", () => {
  assert.deepEqual(
    negotiateSnapshotVersion({ supportedSnapshotVersions: [2, 1] }),
    { ok: true, selectedVersion: 2, mode: "EXPLICIT" },
  );
  assert.deepEqual(
    negotiateSnapshotVersion({ supportedSnapshotVersions: [1] }),
    { ok: true, selectedVersion: 1, mode: "EXPLICIT" },
  );
  assert.deepEqual(
    negotiateSnapshotVersion({ supportedSnapshotVersions: [3, 2, 1] }),
    { ok: true, selectedVersion: 2, mode: "EXPLICIT" },
  );
});

test("공통 snapshot version이 없으면 V1으로 silent downgrade하지 않는다", () => {
  assert.deepEqual(
    negotiateSnapshotVersion({ supportedSnapshotVersions: [3] }),
    { ok: false, reason: "NO_COMMON_VERSION" },
  );
});

test("명시된 malformed snapshot capability는 legacy 부재와 구분해 fail-closed한다", () => {
  const malformedInputs: readonly unknown[] = [
    null,
    [],
    { supportedSnapshotVersions: undefined },
    { supportedSnapshotVersions: "2,1" },
    { supportedSnapshotVersions: [] },
    { supportedSnapshotVersions: [2, 2] },
    { supportedSnapshotVersions: [2, 0] },
    { supportedSnapshotVersions: [2, 1.5] },
  ];

  for (const input of malformedInputs) {
    assert.deepEqual(negotiateSnapshotVersion(input), {
      ok: false,
      reason: "MALFORMED_CAPABILITY",
    });
  }
});

test("snapshot negotiation은 client advertisement를 mutate하지 않는다", () => {
  const supportedSnapshotVersions = [3, 2, 1];
  const handshakeAuth = { supportedSnapshotVersions };
  const before = structuredClone(handshakeAuth);

  assert.deepEqual(negotiateSnapshotVersion(handshakeAuth), {
    ok: true,
    selectedVersion: 2,
    mode: "EXPLICIT",
  });
  assert.deepEqual(handshakeAuth, before);
  assert.deepEqual(supportedSnapshotVersions, [3, 2, 1]);
});
