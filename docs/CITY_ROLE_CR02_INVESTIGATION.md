# CR-02 runtime investigation

Source baseline: `95dc7bc` (clean master matching origin/master).
Verdict: **NOT REPRODUCED**. No runtime fix or gameplay change is justified by the observed evidence. Railway was not deployed or inspected in this investigation.

## Canonical path

- `domain/rule-engine.ts`: `useAbility` stores an actor-owned `GOLD_TRANSFER / UNRESOLVED` mark. `advance` checks absence, tombstones and disable before `enterRole`.
- `enterRole`: normal reveal → eligible unresolved gold marks → read current target gold → credit source/debit target → resolve mark → leader/protection/category income/bonus draw → normal action window.
- CR-06 category income is at entry. Its additional gold 1 follows **basic acquisition completion**, per the existing approved rules, not role entry. No timing rule was changed.
- `game-state.ts` clone retains marks; the concrete adapter validates and clones v2 marks, role assignments and Landmark history. The application commits the domain result through the existing UoW; both participant projections contain the same public gold result.
- Same-owner, absent, disabled and forfeited targets do not transfer gold. E01 cancels unresolved outgoing marks on source forfeit. Already resolved/cancelled marks are ineligible. Normal turn advancement still changes revision; “no-op” means no additional theft, not suppression of the enclosing turn transition.

## Evidence and test gaps

Existing lifecycle tests already checked CR-04 income ordering, self-owned second role, disabled target, E01 cancellation and resolved-mark non-rollback. The previous P16 integration test checked public/private projection and CR-04 transfer. These pass; there is no demonstrated production defect that they missed.

New investigation coverage explicitly exercises v2 CR-04/05/06/08 with current gold 0 and 5, JSON adapter round-trip of unresolved marks, restart into isolated application persistence, one revision per end-turn, duplicate request replay, exact post-transfer income and both viewer snapshots. Additional v2 tests cover same-owner and unselected no-ops.

The two-client Socket.IO test starts a real local server, creates/joins/starts a two-player v2 game, selects CR-02 and CR-06, takes normal income, submits the private mark, resumes the source using its saved credential, and advances through normal commands. It compares exact source/target gold, revision and replay results in both network snapshots. Only the existing injected random port is fixed for reproducible draft availability; no runtime state is injected into this raw test. Tests never expose credentials or private card data to another player.

Fixture-only failures during investigation were corrected: a restarted FakeIdGenerator initially reused an action ID; the raw draft initially requested a removed role; and replay ACK wall-clock `serverTime` naturally differs even though committed data/revision is identical. None was a runtime CR-02 failure. Network tests require permission to bind loopback (`listen EPERM` inside the restricted sandbox); they were rerun with that permission.

## Scope and follow-up evidence

Only two test files and this investigation note changed. No server/Web/shared production source, rule, protocol, Landmark behavior or dependency changed. Impact polish has not been expanded.

The reported live observation remains unexplained. To investigate that specific occurrence, obtain the deployed commit and a minimal sequence: chosen target role, target gold immediately before that role's call, whether the role was normally revealed or skipped, whether both roles belonged to one player, and whether the source had left. Do not collect session tokens or other viewers' private hands. The local results do not establish which runtime Railway served during the report.

No `fix: restore city collector gold transfer` commit/push is made without a reproduced defect and actual fix. After reviewing the NOT REPRODUCED result, the user approved preserving these eleven characterization tests and this note in a test-only checkpoint: `test: cover city collector gold transfer`. Runtime behavior remains unchanged.

## Verification result

- Eleven additive tests; full suite **1568/1568 PASS** (shared 110 / Web 382 / server 1076), zero skips.
- Raw network observation: source **6 → 10**, target **4 → 0**, revision **10 → 11**. Target's later CR-06 acquisition then gives **0 → 3** (basic 2 + extra 1), with no second transfer.
- The raw path confirms server canonical values and both decoded network projections, not a visual browser rendering claim. No Railway identity or live-incident reconstruction is claimed.
