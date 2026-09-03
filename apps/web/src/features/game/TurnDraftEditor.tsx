import type {
  PlayingStateSnapshot,
  PrivateRackTileView,
  PublicBoardTilePlacement,
  PublicBoardView,
  TileId,
  TurnDrawBagKind,
} from "@hangul-rummikub/shared";
import { useEffect, useRef, useState } from "react";

import {
  findDraftTile,
  getAssignableSymbols,
  type DraftPlacedTile,
  type DraftSlotTarget,
  type DraftSyllable,
  type DraftWordGroup,
  type TurnDraft,
} from "../../lib/turn-draft.js";
import type { TurnDraftController } from "./use-turn-draft.js";
import {
  getTurnActionControls,
  shouldConfirmDraw,
} from "../../lib/turn-actions.js";

type SelectedTile = Readonly<{
  tileId: TileId;
  assignedSymbol: string;
}>;

type DragSelection = SelectedTile | null;

type TileVisualProps = Readonly<{
  tile: PrivateRackTileView | DraftPlacedTile | PublicBoardTilePlacement;
  assignedSymbol?: string | undefined;
  selected?: boolean;
  disabled?: boolean;
  label: string;
  onSelect?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}>;

function TileVisual(props: TileVisualProps) {
  const symbol =
    props.assignedSymbol ??
    ("assignedSymbol" in props.tile
      ? props.tile.assignedSymbol
      : props.tile.allowedSymbols[0]) ??
    "?";
  const className = [
    "game-tile",
    props.tile.kind === "JOKER" ? "joker-tile" : "ordinary-tile",
    props.selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (props.onSelect === undefined) {
    return (
      <span className={className} role="img" aria-label={props.label}>
        <span aria-hidden="true">{symbol}</span>
        {props.tile.kind === "JOKER" ? (
          <small aria-hidden="true">JOKER</small>
        ) : null}
      </span>
    );
  }
  const onSelect = props.onSelect;

  return (
    <button
      className={className}
      type="button"
      aria-label={props.label}
      aria-pressed={props.selected}
      disabled={props.disabled}
      draggable={!props.disabled}
      onClick={onSelect}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        props.onDragStart?.();
      }}
      onDragEnd={props.onDragEnd}
    >
      <span aria-hidden="true">{symbol}</span>
      {props.tile.kind === "JOKER" ? (
        <small aria-hidden="true">JOKER</small>
      ) : null}
    </button>
  );
}

function ReadOnlyBoard(props: Readonly<{ board: PublicBoardView }>) {
  if (props.board.wordGroups.length === 0) {
    return <p className="empty-board-copy">아직 보드에 놓인 낱말이 없습니다.</p>;
  }

  return (
    <div className="word-group-list">
      {props.board.wordGroups.map((group, groupIndex) => (
        <article className="word-group-card locked" key={group.groupId}>
          <header className="word-group-header">
            <div>
              <span className="group-number">낱말 {groupIndex + 1}</span>
              <strong>공개 보드</strong>
            </div>
            <span className="lock-label">읽기 전용</span>
          </header>
          <div className="syllable-row">
            {group.syllables.map((syllable, syllableIndex) => (
              <div
                className="syllable-card readonly"
                key={`${group.groupId}-${syllableIndex}`}
              >
                <span className="syllable-label">
                  음절 {syllableIndex + 1}
                </span>
                <ReadOnlyRole
                  label="초성"
                  tiles={syllable.choseong}
                />
                <ReadOnlyRole
                  label="중성"
                  tiles={syllable.jungseong}
                />
                <ReadOnlyRole
                  label="종성"
                  tiles={syllable.jongseong}
                />
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function ReadOnlyRole(
  props: Readonly<{
    label: string;
    tiles: readonly PublicBoardTilePlacement[];
  }>,
) {
  return (
    <div className="syllable-role readonly-role">
      <span>{props.label}</span>
      <div className="slot-pair">
        {props.tiles.length === 0 ? (
          <span className="readonly-empty-slot" aria-label={`${props.label} 없음`}>
            —
          </span>
        ) : (
          props.tiles.map((tile) => (
            <TileVisual
              key={tile.tileId}
              tile={tile}
              label={`${props.label} ${tile.assignedSymbol}`}
            />
          ))
        )}
      </div>
    </div>
  );
}

type EditableBoardProps = Readonly<{
  draft: TurnDraft;
  controller: TurnDraftController;
  selected: SelectedTile | null;
  onSelectBoardTile: (tile: DraftPlacedTile) => void;
  onPlace: (target: DraftSlotTarget) => void;
  onDrop: (target: DraftSlotTarget) => void;
  onDragStart: (tile: DraftPlacedTile) => void;
  onDragEnd: () => void;
}>;

function EditableBoard(props: EditableBoardProps) {
  if (props.draft.wordGroups.length === 0) {
    return (
      <p className="empty-board-copy">
        새 낱말 묶음을 만든 뒤 음절과 타일을 배치하세요.
      </p>
    );
  }

  return (
    <div className="word-group-list">
      {props.draft.wordGroups.map((group, groupIndex) => {
        const locked =
          props.draft.mode === "INITIAL_MELD" &&
          group.origin === "CANONICAL_BOARD";
        const groupEmpty = group.syllables.every(isSyllableEmpty);

        return (
          <article
            className={`word-group-card${locked ? " locked" : ""}`}
            key={group.groupId}
          >
            <header className="word-group-header">
              <div>
                <span className="group-number">낱말 {groupIndex + 1}</span>
                <strong>
                  {group.origin === "CANONICAL_BOARD"
                    ? "기존 보드"
                    : "새 낱말"}
                </strong>
              </div>
              {locked ? (
                <span className="lock-label">첫 등록 전 이동 불가</span>
              ) : (
                <div className="group-actions">
                  <button
                    className="compact-button"
                    type="button"
                    onClick={() => props.controller.addSyllable(group.groupId)}
                  >
                    음절 추가
                  </button>
                  <button
                    className="compact-button danger"
                    type="button"
                    disabled={!groupEmpty}
                    onClick={() =>
                      props.controller.removeEmptyWordGroup(group.groupId)
                    }
                  >
                    빈 낱말 삭제
                  </button>
                </div>
              )}
            </header>

            {group.syllables.length === 0 ? (
              <p className="empty-group-copy">
                아직 음절이 없습니다. ‘음절 추가’를 선택하세요.
              </p>
            ) : (
              <div className="syllable-row">
                {group.syllables.map((syllable, syllableIndex) => (
                  <EditableSyllable
                    key={`${group.groupId}-${syllableIndex}`}
                    group={group}
                    syllable={syllable}
                    syllableIndex={syllableIndex}
                    locked={locked}
                    selected={props.selected}
                    onSelectBoardTile={props.onSelectBoardTile}
                    onPlace={props.onPlace}
                    onDrop={props.onDrop}
                    onDragStart={props.onDragStart}
                    onDragEnd={props.onDragEnd}
                    onRemove={() =>
                      props.controller.removeEmptySyllable(
                        group.groupId,
                        syllableIndex,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

type EditableSyllableProps = Readonly<{
  group: DraftWordGroup;
  syllable: DraftSyllable;
  syllableIndex: number;
  locked: boolean;
  selected: SelectedTile | null;
  onSelectBoardTile: (tile: DraftPlacedTile) => void;
  onPlace: (target: DraftSlotTarget) => void;
  onDrop: (target: DraftSlotTarget) => void;
  onDragStart: (tile: DraftPlacedTile) => void;
  onDragEnd: () => void;
  onRemove: () => void;
}>;

function EditableSyllable(props: EditableSyllableProps) {
  return (
    <div className={`syllable-card${props.locked ? " readonly" : ""}`}>
      <div className="syllable-heading-row">
        <span className="syllable-label">음절 {props.syllableIndex + 1}</span>
        {!props.locked ? (
          <button
            className="icon-button"
            type="button"
            disabled={!isSyllableEmpty(props.syllable)}
            aria-label={`음절 ${props.syllableIndex + 1} 삭제`}
            onClick={props.onRemove}
          >
            ×
          </button>
        ) : null}
      </div>
      <EditableRole
        label="초성"
        role="choseong"
        tiles={[props.syllable.choseong]}
        groupId={props.group.groupId}
        syllableIndex={props.syllableIndex}
        locked={props.locked}
        selected={props.selected}
        onSelectBoardTile={props.onSelectBoardTile}
        onPlace={props.onPlace}
        onDrop={props.onDrop}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
      />
      <EditableRole
        label="중성"
        role="jungseong"
        tiles={props.syllable.jungseong}
        groupId={props.group.groupId}
        syllableIndex={props.syllableIndex}
        locked={props.locked}
        selected={props.selected}
        onSelectBoardTile={props.onSelectBoardTile}
        onPlace={props.onPlace}
        onDrop={props.onDrop}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
      />
      <EditableRole
        label="종성"
        role="jongseong"
        tiles={props.syllable.jongseong}
        groupId={props.group.groupId}
        syllableIndex={props.syllableIndex}
        locked={props.locked}
        selected={props.selected}
        onSelectBoardTile={props.onSelectBoardTile}
        onPlace={props.onPlace}
        onDrop={props.onDrop}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
      />
    </div>
  );
}

type EditableRoleProps = Readonly<{
  label: string;
  role: DraftSlotTarget["role"];
  tiles: readonly (DraftPlacedTile | null)[];
  groupId: string;
  syllableIndex: number;
  locked: boolean;
  selected: SelectedTile | null;
  onSelectBoardTile: (tile: DraftPlacedTile) => void;
  onPlace: (target: DraftSlotTarget) => void;
  onDrop: (target: DraftSlotTarget) => void;
  onDragStart: (tile: DraftPlacedTile) => void;
  onDragEnd: () => void;
}>;

function EditableRole(props: EditableRoleProps) {
  const componentIndexes: readonly (0 | 1)[] =
    props.role === "choseong" ? [0] : [0, 1];

  return (
    <div className="syllable-role">
      <span>{props.label}</span>
      <div className="slot-pair">
        {componentIndexes.map((componentIndex) => {
          const tile = props.tiles[componentIndex] ?? null;
          const target: DraftSlotTarget = {
            groupId: props.groupId,
            syllableIndex: props.syllableIndex,
            role: props.role,
            componentIndex,
          };
          const positionLabel =
            componentIndexes.length === 1
              ? props.label
              : `${props.label} ${componentIndex + 1}`;

          return (
            <div
              className={`tile-slot${tile === null ? " empty" : " filled"}`}
              key={`${props.role}-${componentIndex}`}
              onDragOver={(event) => {
                if (!props.locked) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!props.locked) {
                  props.onDrop(target);
                }
              }}
            >
              {tile === null ? (
                <button
                  className="empty-slot-button"
                  type="button"
                  disabled={props.locked}
                  aria-label={`${positionLabel} 빈 칸에 선택한 타일 배치`}
                  onClick={() => props.onPlace(target)}
                >
                  <span aria-hidden="true">+</span>
                </button>
              ) : (
                <TileVisual
                  tile={tile}
                  selected={props.selected?.tileId === tile.tileId}
                  disabled={props.locked}
                  label={`${positionLabel} 타일 ${tile.assignedSymbol}${
                    props.locked ? ", 읽기 전용" : ", 선택"
                  }`}
                  onSelect={() => props.onSelectBoardTile(tile)}
                  onDragStart={() => props.onDragStart(tile)}
                  onDragEnd={props.onDragEnd}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isSyllableEmpty(syllable: DraftSyllable): boolean {
  return (
    syllable.choseong === null &&
    syllable.jungseong.every((tile) => tile === null) &&
    syllable.jongseong.every((tile) => tile === null)
  );
}

export type TurnDraftEditorProps = Readonly<{
  snapshot: PlayingStateSnapshot;
  controller: TurnDraftController;
  submitPending: boolean;
  turnActionPending: boolean;
  canSubmit: boolean;
  canAct: boolean;
  onSubmit: (draft: TurnDraft) => void;
  onDraw: (bagKind: TurnDrawBagKind) => void;
  onPass: () => void;
}>;

export function TurnDraftEditor(props: TurnDraftEditorProps) {
  const { controller, snapshot } = props;
  const [selected, setSelected] = useState<SelectedTile | null>(null);
  const [drawConfirmation, setDrawConfirmation] =
    useState<TurnDrawBagKind | null>(null);
  const dragSelectionRef = useRef<DragSelection>(null);

  useEffect(() => {
    setSelected((current) => {
      if (current === null || controller.draft === null) {
        return null;
      }
      const located = findDraftTile(controller.draft, current.tileId);
      if (located === null) {
        return null;
      }
      if (located.source === "BOARD") {
        return located.tile.assignedSymbol === current.assignedSymbol
          ? current
          : {
              tileId: current.tileId,
              assignedSymbol: located.tile.assignedSymbol,
            };
      }
      const allowed = getAssignableSymbols(located.tile);
      return allowed.includes(current.assignedSymbol)
        ? current
        : {
            tileId: current.tileId,
            assignedSymbol: allowed[0] ?? "",
          };
    });
  }, [
    controller.draft,
    controller.draft?.baseGameId,
    controller.draft?.baseGameRevision,
    controller.draft?.baseTurnId,
  ]);

  useEffect(() => {
    setDrawConfirmation(null);
  }, [
    controller.draft?.baseGameId,
    controller.draft?.baseGameRevision,
    controller.draft?.baseTurnId,
    controller.isDirty,
    snapshot.game.turn.turnId,
  ]);

  const selectTile = (
    tile: PrivateRackTileView | DraftPlacedTile,
  ): void => {
    const assignedSymbol =
      "assignedSymbol" in tile
        ? tile.assignedSymbol
        : (tile.allowedSymbols[0] ?? "");
    setSelected({ tileId: tile.tileId, assignedSymbol });
    controller.clearFeedback();
  };

  const startDragging = (
    tile: PrivateRackTileView | DraftPlacedTile,
  ): void => {
    const next = {
      tileId: tile.tileId,
      assignedSymbol:
        selected?.tileId === tile.tileId
          ? selected.assignedSymbol
          : "assignedSymbol" in tile
            ? tile.assignedSymbol
            : (tile.allowedSymbols[0] ?? ""),
    };
    dragSelectionRef.current = next;
    setSelected(next);
  };

  const placeSelected = (
    target: DraftSlotTarget,
    selection: SelectedTile | null = selected,
  ): void => {
    if (selection === null || selection.assignedSymbol.length === 0) {
      return;
    }
    controller.placeTile(
      selection.tileId,
      selection.assignedSymbol,
      target,
    );
  };

  const selectedLocation =
    controller.draft === null || selected === null
      ? null
      : findDraftTile(controller.draft, selected.tileId);
  const symbolOptions =
    selectedLocation === null
      ? []
      : getAssignableSymbols(selectedLocation.tile);
  const rackTiles =
    controller.draft?.availableRackTiles ?? snapshot.self.rack;
  const selfPlayer = snapshot.room.players.find(
    (player) => player.playerId === snapshot.self.playerId,
  );
  const activePlayer = snapshot.room.players.find(
    (player) => player.playerId === snapshot.game.turn.activePlayerId,
  );
  const turnActionControls = getTurnActionControls(
    snapshot,
    props.canAct,
    props.turnActionPending,
  );
  const bothBagsEmpty =
    snapshot.game.bagCounts.consonant === 0 &&
    snapshot.game.bagCounts.vowel === 0;

  const requestDraw = (bagKind: TurnDrawBagKind): void => {
    if (shouldConfirmDraw(controller.isDirty)) {
      setDrawConfirmation(bagKind);
      return;
    }

    props.onDraw(bagKind);
  };

  return (
    <>
      <section className="board-panel" aria-labelledby="board-heading">
        <header className="editor-section-header">
          <div>
            <p className="step-label">GAME BOARD</p>
            <h2 id="board-heading">게임 보드</h2>
          </div>
          {controller.draft !== null ? (
            <div className="draft-status" aria-live="polite">
              <span className={controller.isDirty ? "dirty" : "clean"}>
                {controller.isDirty ? "편집 중" : "서버 상태와 같음"}
              </span>
              <small>아직 서버에는 전송되지 않았습니다.</small>
            </div>
          ) : (
            <span className="lock-label">읽기 전용</span>
          )}
        </header>

        {controller.noticeMessage !== null ? (
          <p className="notice stale-draft-notice" role="status">
            {controller.noticeMessage}
          </p>
        ) : null}
        {controller.editErrorMessage !== null ? (
          <p className="notice error-notice" role="alert">
            {controller.editErrorMessage}
          </p>
        ) : null}

        {controller.draft === null ? (
          <ReadOnlyBoard board={snapshot.game.board} />
        ) : (
          <>
            <div className="editor-toolbar" aria-label="보드 편집 도구">
              <button
                className="secondary-button toolbar-button"
                type="button"
                onClick={controller.addWordGroup}
              >
                새 낱말 추가
              </button>
              <button
                className="secondary-button toolbar-button"
                type="button"
                disabled={controller.draft.history.length === 0}
                onClick={controller.undo}
              >
                실행 취소
              </button>
              <button
                className="secondary-button toolbar-button"
                type="button"
                disabled={!controller.isDirty}
                onClick={controller.reset}
              >
                서버 상태로 초기화
              </button>
              <button
                className="primary-button toolbar-button submit-turn-button"
                type="button"
                disabled={
                  !controller.isDirty ||
                  !props.canSubmit ||
                  props.submitPending
                }
                aria-busy={props.submitPending}
                onClick={() => {
                  if (controller.draft !== null) {
                    props.onSubmit(controller.draft);
                  }
                }}
              >
                {props.submitPending ? "제출 중..." : "배치 제출"}
              </button>
            </div>
            {controller.draft.mode === "INITIAL_MELD" ? (
              <p className="editor-guidance">
                첫 등록 전에는 기존 보드가 읽기 전용입니다. 새 낱말에 내 랙
                타일을 배치하세요.
              </p>
            ) : (
              <p className="editor-guidance">
                기존 타일을 옮기거나 내 랙 타일을 더해 보드를 재구성할 수
                있습니다.
              </p>
            )}
            <EditableBoard
              draft={controller.draft}
              controller={controller}
              selected={selected}
              onSelectBoardTile={selectTile}
              onPlace={placeSelected}
              onDrop={(target) => {
                placeSelected(target, dragSelectionRef.current);
                dragSelectionRef.current = null;
              }}
              onDragStart={startDragging}
              onDragEnd={() => {
                dragSelectionRef.current = null;
              }}
            />
          </>
        )}
      </section>

      {turnActionControls.visible ? (
        <section
          className="turn-action-panel"
          aria-labelledby="turn-action-heading"
        >
          <header>
            <div>
              <p className="step-label">END TURN</p>
              <h2 id="turn-action-heading">턴 종료</h2>
            </div>
            <p>
              타일을 가져오면 이 턴이 즉시 끝나며, 실제 타일은 서버가
              선택합니다.
            </p>
          </header>

          {drawConfirmation !== null ? (
            <div className="draw-confirmation" role="status">
              <p>
                편집 중인 배치가 사라집니다.{" "}
                {drawConfirmation === "CONSONANT" ? "자음" : "모음"} 타일을
                가져올까요?
              </p>
              <div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={props.turnActionPending}
                  onClick={() => {
                    const bagKind = drawConfirmation;
                    setDrawConfirmation(null);
                    props.onDraw(bagKind);
                  }}
                >
                  가져오기
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={props.turnActionPending}
                  onClick={() => setDrawConfirmation(null)}
                >
                  취소
                </button>
              </div>
            </div>
          ) : null}

          <div className="turn-action-buttons">
            <button
              className="secondary-button"
              type="button"
              disabled={!turnActionControls.canDrawConsonant}
              aria-busy={props.turnActionPending}
              onClick={() => requestDraw("CONSONANT")}
            >
              자음 타일 가져오기
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!turnActionControls.canDrawVowel}
              aria-busy={props.turnActionPending}
              onClick={() => requestDraw("VOWEL")}
            >
              모음 타일 가져오기
            </button>
            {bothBagsEmpty ? (
              <button
                className="primary-button"
                type="button"
                disabled={!turnActionControls.canPass}
                aria-busy={props.turnActionPending}
                onClick={props.onPass}
              >
                {props.turnActionPending ? "턴 넘기는 중..." : "턴 넘기기"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rack-panel" aria-labelledby="rack-heading">
        <header className="editor-section-header rack-heading-row">
          <div>
            <p className="step-label">MY RACK</p>
            <h2 id="rack-heading">내 타일</h2>
          </div>
          <strong>
            {rackTiles.length} / {snapshot.self.rack.length}
          </strong>
        </header>

        {controller.draft === null ? (
          <p className="editor-guidance">
            {activePlayer?.nickname ?? "다른 참가자"}님의 차례입니다. 내 랙은
            볼 수 있지만 타일을 배치할 수 없습니다.
          </p>
        ) : selfPlayer?.initialMeldCompleted === false ? (
          <p className="editor-guidance">
            첫 등록에는 내 랙에서 나온 physical Tile을 합계 6개 이상
            사용해야 합니다. 최종 판정은 서버가 수행합니다.
          </p>
        ) : null}

        <div className="rack-strip" role="list" aria-label="내 랙 타일 목록">
          {rackTiles.length === 0 ? (
            <p>현재 랙 영역에 남은 타일이 없습니다.</p>
          ) : (
            rackTiles.map((tile) => (
              <div role="listitem" key={tile.tileId}>
                <TileVisual
                  tile={tile}
                  assignedSymbol={
                    selected?.tileId === tile.tileId
                      ? selected.assignedSymbol
                      : undefined
                  }
                  selected={selected?.tileId === tile.tileId}
                  disabled={!controller.canEdit}
                  label={`${
                    tile.kind === "JOKER" ? "조커" : tile.physicalType
                  } 랙 타일 선택`}
                  onSelect={() => selectTile(tile)}
                  onDragStart={() => startDragging(tile)}
                  onDragEnd={() => {
                    dragSelectionRef.current = null;
                  }}
                />
              </div>
            ))
          )}
        </div>

        {selectedLocation !== null && controller.canEdit ? (
          <div className="selection-panel">
            <div>
              <span className="field-label">선택한 타일의 자모</span>
              <div className="symbol-picker" role="group" aria-label="자모 선택">
                {symbolOptions.map((symbol) => (
                  <button
                    className={
                      selected?.assignedSymbol === symbol ? "selected" : ""
                    }
                    type="button"
                    aria-pressed={selected?.assignedSymbol === symbol}
                    key={symbol}
                    onClick={() => {
                      if (selected === null) {
                        return;
                      }
                      setSelected({ ...selected, assignedSymbol: symbol });
                      if (selectedLocation.source === "BOARD") {
                        controller.changeAssignedSymbol(
                          selected.tileId,
                          symbol,
                        );
                      }
                    }}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            </div>
            <p className="selection-help">
              자모를 고른 뒤 빈 초성·중성·종성 칸을 누르거나 타일을
              드래그하세요.
            </p>
            {selectedLocation.source === "BOARD" ? (
              selectedLocation.tile.origin === "SELF_RACK" ? (
                <button
                  className="secondary-button rack-return-button"
                  type="button"
                  onClick={() =>
                    controller.returnTileToRack(selectedLocation.tile.tileId)
                  }
                >
                  내 랙으로 되돌리기
                </button>
              ) : (
                <p className="canonical-tile-help">
                  보드의 기존 타일은 랙으로 가져갈 수 없고 다른 보드 칸으로만
                  이동할 수 있습니다.
                </p>
              )
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
