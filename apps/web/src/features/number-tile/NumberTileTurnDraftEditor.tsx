import {
  NUMBER_TILE_COLORS,
  NUMBER_TILE_NUMBERS,
  type NumberTileColor,
  type NumberTileNumber,
  type NumberTilePlayingPlatformSnapshotV2,
  type NumberTilePrivateRackTileViewV2,
  type NumberTileTablePlacementV2,
  type TileId,
} from "@hangul-rummikub/shared";
import { useEffect, useRef, useState } from "react";

import {
  findNumberTileDraftTile,
  type NumberTileDraftPlacement,
  type NumberTileTurnDraft,
} from "./number-tile-turn-draft.js";
import type { NumberTileTurnDraftController } from "./use-number-tile-turn-draft.js";

const COLOR_LABELS: Readonly<Record<NumberTileColor, string>> = {
  RED: "빨강",
  BLUE: "파랑",
  BLACK: "검정",
  ORANGE: "주황",
};

const COLOR_MARKERS: Readonly<Record<NumberTileColor, string>> = {
  RED: "R",
  BLUE: "B",
  BLACK: "K",
  ORANGE: "O",
};

type ConfirmAction = "DRAW" | "PASS";

type TileButtonProps = Readonly<{
  tile:
    | NumberTilePrivateRackTileViewV2
    | NumberTileTablePlacementV2
    | NumberTileDraftPlacement;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}>;

function TileButton(props: TileButtonProps) {
  const jokerAssignment =
    props.tile.kind !== "JOKER"
      ? null
      : "assignment" in props.tile
        ? props.tile.assignment
        : "assignedNumber" in props.tile
          ? {
              number: props.tile.assignedNumber,
              color: props.tile.assignedColor,
            }
          : null;
  const color =
    props.tile.kind === "ORDINARY"
      ? props.tile.color
      : jokerAssignment?.color ?? null;
  const number =
    props.tile.kind === "ORDINARY"
      ? props.tile.number
      : jokerAssignment?.number ?? null;
  const label = props.tile.kind === "JOKER"
    ? jokerAssignment !== null
      ? `조커, ${COLOR_LABELS[jokerAssignment.color]} ${jokerAssignment.number}로 지정됨`
      : "조커, 숫자와 색상 미지정"
    : `${COLOR_LABELS[props.tile.color]} ${props.tile.number} 타일`;

  return (
    <button
      className={`number-tile${color === null ? " joker" : ` ${color.toLowerCase()}`}${
        props.selected ? " selected" : ""
      }`}
      type="button"
      aria-label={`${label}, 선택`}
      aria-pressed={props.selected}
      disabled={props.disabled}
      onClick={props.onSelect}
    >
      <span className="number-tile-marker" aria-hidden="true">
        {color === null ? "★" : COLOR_MARKERS[color]}
      </span>
      <strong aria-hidden="true">{number ?? "J"}</strong>
      {props.tile.kind === "JOKER" ? (
        <small aria-hidden="true">JOKER</small>
      ) : null}
    </button>
  );
}

function initialMeldHint(draft: NumberTileTurnDraft): number {
  return draft.table.melds.reduce(
    (total, meld) =>
      total +
      meld.tiles.reduce((meldTotal, tile) => {
        if (tile.origin !== "SELF_RACK") {
          return meldTotal;
        }
        if (tile.kind === "ORDINARY") {
          return meldTotal + tile.number;
        }
        return meldTotal + (tile.assignment?.number ?? 0);
      }, 0),
    0,
  );
}

function hasUnassignedJoker(draft: NumberTileTurnDraft): boolean {
  return draft.table.melds.some((meld) =>
    meld.tiles.some(
      (tile) => tile.kind === "JOKER" && tile.assignment === null,
    ),
  );
}

function numberFromControl(value: string): NumberTileNumber {
  switch (Number(value)) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 3;
    case 4: return 4;
    case 5: return 5;
    case 6: return 6;
    case 7: return 7;
    case 8: return 8;
    case 9: return 9;
    case 10: return 10;
    case 11: return 11;
    case 12: return 12;
    case 13: return 13;
    default: return 1;
  }
}

function colorFromControl(value: string): NumberTileColor {
  switch (value) {
    case "RED": return "RED";
    case "BLUE": return "BLUE";
    case "BLACK": return "BLACK";
    case "ORANGE": return "ORANGE";
    default: return "RED";
  }
}

export type NumberTileTurnDraftEditorProps = Readonly<{
  snapshot: NumberTilePlayingPlatformSnapshotV2;
  controller: NumberTileTurnDraftController;
  submitPending: boolean;
  actionPending: boolean;
  commandRetryKind: "SUBMIT" | "DRAW" | "PASS" | null;
  canSubmit: boolean;
  canAct: boolean;
  onSubmit: (draft: NumberTileTurnDraft) => void;
  onDraw: () => void;
  onPass: () => void;
}>;

export function NumberTileTurnDraftEditor(
  props: NumberTileTurnDraftEditorProps,
) {
  const [selectedTileId, setSelectedTileId] = useState<TileId | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmAction | null>(null);
  const drawButtonRef = useRef<HTMLButtonElement>(null);
  const passButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationButtonRef = useRef<HTMLButtonElement>(null);
  const draft = props.controller.draft;

  useEffect(() => {
    if (confirmation !== null) {
      confirmationButtonRef.current?.focus();
    }
  }, [confirmation]);

  useEffect(() => {
    if (!props.controller.canEdit && confirmation !== null) {
      setConfirmation(null);
    }
  }, [confirmation, props.controller.canEdit]);

  useEffect(() => {
    if (
      draft === null ||
      (selectedTileId !== null &&
        findNumberTileDraftTile(draft, selectedTileId) === null)
    ) {
      setSelectedTileId(null);
    }
  }, [draft, selectedTileId]);

  function selectTile(tileId: TileId): void {
    setSelectedTileId((current) => current === tileId ? null : tileId);
    props.controller.clearFeedback();
  }

  function requestTurnEndingAction(action: ConfirmAction): void {
    if (props.commandRetryKind === action) {
      if (action === "DRAW") {
        props.onDraw();
      } else {
        props.onPass();
      }
      return;
    }
    if (props.controller.isDirty) {
      setConfirmation(action);
      return;
    }
    if (action === "DRAW") {
      props.onDraw();
    } else {
      props.onPass();
    }
  }

  function cancelConfirmation(): void {
    const cancelled = confirmation;
    setConfirmation(null);
    window.setTimeout(() => {
      (cancelled === "DRAW"
        ? drawButtonRef.current
        : passButtonRef.current)?.focus();
    });
  }

  function confirmTurnEndingAction(): void {
    const action = confirmation;
    setConfirmation(null);
    if (!props.canAct || props.actionPending) {
      return;
    }
    if (action === "DRAW") {
      props.onDraw();
    } else if (action === "PASS") {
      props.onPass();
    }
  }

  const selected =
    draft === null || selectedTileId === null
      ? null
      : findNumberTileDraftTile(draft, selectedTileId);
  const selectedJoker =
    selected?.source === "TABLE" && selected.tile.kind === "JOKER"
      ? selected.tile
      : null;
  const canDraw =
    props.canAct &&
    !props.actionPending &&
    (props.commandRetryKind === null || props.commandRetryKind === "DRAW") &&
    props.snapshot.game.remainingPoolCount > 0;
  const canPass =
    props.canAct &&
    !props.actionPending &&
    (props.commandRetryKind === null || props.commandRetryKind === "PASS") &&
    props.snapshot.game.remainingPoolCount === 0;
  const canSubmitDraft =
    draft !== null &&
    props.canSubmit &&
    !props.submitPending &&
    props.controller.isDirty &&
    !hasUnassignedJoker(draft);

  return (
    <section className="number-editor" aria-labelledby="number-editor-heading">
      <header className="number-editor-heading">
        <div>
          <p className="step-label">NUMBER TABLE</p>
          <h2 id="number-editor-heading">숫자 타일 테이블</h2>
        </div>
        {draft === null ? (
          <span className="lock-label">내 차례에 편집할 수 있습니다</span>
        ) : !props.controller.canEdit ? (
          <span className="lock-label">서버 응답을 기다리는 동안 입력이 잠겼습니다</span>
        ) : (
          <span className="lock-label">
            {draft.mode === "INITIAL_MELD" ? "첫 등록" : "테이블 재배치"}
          </span>
        )}
      </header>

      {props.controller.noticeMessage !== null ? (
        <p className="notice" role="status">
          {props.controller.noticeMessage}
        </p>
      ) : null}
      {props.controller.editErrorMessage !== null ? (
        <p className="notice error-notice" role="alert">
          {props.controller.editErrorMessage}
        </p>
      ) : null}

      {draft?.mode === "INITIAL_MELD" ? (
        <p className="number-rule-hint">
          첫 등록은 내 랙 타일만 사용해 합계 30 이상이어야 합니다. 현재 참고 합계: {initialMeldHint(draft)}
          <small>최종 유효성은 서버가 판정합니다.</small>
        </p>
      ) : draft?.mode === "REARRANGEMENT" ? (
        <p className="number-rule-hint">
          기존 조합을 자유롭게 재배치할 수 있지만 내 랙 타일을 최소 1개 사용해야 합니다.
          <small>최종 테이블 전체의 유효성은 서버가 판정합니다.</small>
        </p>
      ) : null}

      <div className="number-meld-list">
        {(draft?.table.melds ?? props.snapshot.game.table.melds).map(
          (meld, meldIndex) => {
            const draftMeld = draft?.table.melds[meldIndex];
            const locked =
              draft === null ||
              !props.controller.canEdit ||
              (draft.mode === "INITIAL_MELD" &&
                draftMeld?.origin === "CANONICAL_TABLE");
            return (
              <article
                className={`number-meld-card${locked ? " locked" : ""}`}
                key={`number-meld-${meldIndex}`}
              >
                <header>
                  <div>
                    <span className="group-number">조합 {meldIndex + 1}</span>
                    <strong>{meld.kind === "GROUP" ? "GROUP" : "RUN"}</strong>
                  </div>
                  {draftMeld !== undefined && !locked ? (
                    <button
                      className="compact-button danger"
                      type="button"
                      disabled={draftMeld.tiles.length !== 0}
                      onClick={() => props.controller.removeEmptyMeld(meldIndex)}
                    >
                      빈 조합 삭제
                    </button>
                  ) : (
                    <span className="lock-label">읽기 전용</span>
                  )}
                </header>
                <div className="number-meld-tiles">
                  {Array.from({ length: meld.tiles.length + 1 }, (_, insertIndex) => (
                    <div className="number-meld-position" key={`position-${insertIndex}`}>
                      {draft !== null ? (
                        <button
                          className="number-insert-button"
                          type="button"
                          disabled={locked || selectedTileId === null}
                          aria-label={`조합 ${meldIndex + 1}의 ${insertIndex + 1}번째 위치에 선택한 타일 놓기`}
                          onClick={() => {
                            if (selectedTileId !== null) {
                              const source = findNumberTileDraftTile(
                                draft,
                                selectedTileId,
                              );
                              const targetIndex =
                                source?.source === "TABLE" &&
                                source.meldIndex === meldIndex &&
                                source.tileIndex < insertIndex
                                  ? insertIndex - 1
                                  : insertIndex;
                              props.controller.placeTile(selectedTileId, {
                                meldIndex,
                                tileIndex: targetIndex,
                              });
                            }
                          }}
                        >
                          <span aria-hidden="true">+</span>
                        </button>
                      ) : null}
                      {insertIndex < meld.tiles.length ? (
                        <TileButton
                          tile={meld.tiles[insertIndex]!}
                          selected={selectedTileId === meld.tiles[insertIndex]!.tileId}
                          disabled={locked}
                          onSelect={() => selectTile(meld.tiles[insertIndex]!.tileId)}
                        />
                      ) : null}
                    </div>
                  ))}
                  {meld.tiles.length === 0 ? (
                    <span className="empty-group-copy">타일을 선택해 이 조합에 놓으세요.</span>
                  ) : null}
                </div>
              </article>
            );
          },
        )}
        {(draft?.table.melds.length ?? props.snapshot.game.table.melds.length) === 0 ? (
          <p className="empty-board-copy">아직 테이블에 조합이 없습니다.</p>
        ) : null}
      </div>

      {draft !== null ? (
        <div className="number-editor-toolbar">
          <button className="secondary-button" type="button" disabled={!props.controller.canEdit} onClick={() => props.controller.addMeld("GROUP")}>
            GROUP 추가
          </button>
          <button className="secondary-button" type="button" disabled={!props.controller.canEdit} onClick={() => props.controller.addMeld("RUN")}>
            RUN 추가
          </button>
          <button className="secondary-button" type="button" disabled={!props.controller.canEdit || draft.history.length === 0} onClick={props.controller.undo}>
            실행 취소
          </button>
          <button className="secondary-button" type="button" disabled={!props.controller.canEdit || !props.controller.isDirty} onClick={props.controller.reset}>
            배치 초기화
          </button>
        </div>
      ) : null}

      <section className="number-rack" aria-labelledby="number-rack-heading">
        <div className="number-rack-heading">
          <h3 id="number-rack-heading">내 랙</h3>
          <span>
            {(draft?.availableRackTiles ?? props.snapshot.game.privateState.rack).length}개
          </span>
        </div>
        <div className="number-rack-tiles">
          {(draft?.availableRackTiles ?? props.snapshot.game.privateState.rack).map((tile) => (
            <TileButton
              key={tile.tileId}
              tile={tile}
              selected={selectedTileId === tile.tileId}
              disabled={!props.controller.canEdit}
              onSelect={() => selectTile(tile.tileId)}
            />
          ))}
          {(draft?.availableRackTiles ?? props.snapshot.game.privateState.rack).length === 0 ? (
            <p>랙에 남은 타일이 없습니다.</p>
          ) : null}
        </div>
        {draft === null ? (
          <p className="selection-help">상대 차례에는 내 랙을 읽기 전용으로 표시합니다.</p>
        ) : null}
        {selected?.source === "TABLE" && selected.tile.origin === "SELF_RACK" ? (
          <button className="text-button" type="button" disabled={!props.controller.canEdit} onClick={() => {
            props.controller.returnTileToRack(selected.tile.tileId);
            setSelectedTileId(null);
          }}>
            선택한 타일을 랙으로 되돌리기
          </button>
        ) : null}
      </section>

      {selectedJoker !== null ? (
        <fieldset className="joker-assignment" disabled={!props.controller.canEdit}>
          <legend>선택한 조커가 나타내는 값</legend>
          <label>
            숫자
            <select
              value={selectedJoker.assignment?.number ?? 1}
              onChange={(event) => props.controller.assignJoker(
                selectedJoker.tileId,
                numberFromControl(event.target.value),
                selectedJoker.assignment?.color ?? "RED",
              )}
            >
              {NUMBER_TILE_NUMBERS.map((number) => <option key={number} value={number}>{number}</option>)}
            </select>
          </label>
          <label>
            색상
            <select
              value={selectedJoker.assignment?.color ?? "RED"}
              onChange={(event) => props.controller.assignJoker(
                selectedJoker.tileId,
                selectedJoker.assignment?.number ?? 1,
                colorFromControl(event.target.value),
              )}
            >
              {NUMBER_TILE_COLORS.map((color) => <option key={color} value={color}>{COLOR_LABELS[color]}</option>)}
            </select>
          </label>
          {selectedJoker.assignment === null ? (
            <button className="secondary-button" type="button" onClick={() => props.controller.assignJoker(selectedJoker.tileId, 1, "RED")}>
              조커 값 적용
            </button>
          ) : null}
        </fieldset>
      ) : null}

      {draft !== null ? (
        <div className="number-submit-panel">
          <button
            className="primary-button"
            type="button"
            disabled={!canSubmitDraft}
            aria-busy={props.submitPending}
            onClick={() => props.onSubmit(draft)}
          >
            {props.submitPending ? "제출 중..." : "테이블 제출"}
          </button>
          {hasUnassignedJoker(draft) ? <p>모든 조커의 숫자와 색상을 지정해주세요.</p> : null}
        </div>
      ) : null}

      <div className="number-turn-actions">
        {props.snapshot.game.remainingPoolCount > 0 ? (
          <button
            ref={drawButtonRef}
            className="secondary-button"
            type="button"
            disabled={!canDraw}
            onClick={() => requestTurnEndingAction("DRAW")}
          >
            {props.actionPending
              ? "처리 중..."
              : props.commandRetryKind === "DRAW"
                ? "타일 가져오기 다시 시도"
                : "타일 1개 가져오기"}
          </button>
        ) : (
          <button
            ref={passButtonRef}
            className="secondary-button"
            type="button"
            disabled={!canPass}
            onClick={() => requestTurnEndingAction("PASS")}
          >
            {props.actionPending
              ? "처리 중..."
              : props.commandRetryKind === "PASS"
                ? "턴 넘기기 다시 시도"
                : "턴 넘기기"}
          </button>
        )}
      </div>

      {confirmation !== null ? (
        <section className="draw-confirmation" aria-labelledby="number-action-confirmation">
          <p id="number-action-confirmation" role="status">
            편집 중인 배치는 저장되지 않습니다. {confirmation === "DRAW" ? "타일을 가져올까요?" : "턴을 넘길까요?"}
          </p>
          <div>
            <button ref={confirmationButtonRef} className="primary-button" type="button" disabled={!props.canAct || props.actionPending} onClick={confirmTurnEndingAction}>
              확인
            </button>
            <button className="secondary-button" type="button" onClick={cancelConfirmation}>
              취소
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
