import {
  type NumberTilePlayingPlatformSnapshotV2,
  type NumberTilePrivateRackTileViewV2,
  type NumberTileTablePlacementV2,
  type TileId,
} from "@hangul-rummikub/shared";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
} from "react";

import {
  findNumberTileDraftReusableEmptyMeldIndex,
  findNumberTileDraftTile,
  type NumberTileDraftPlacement,
  type NumberTileTurnDraft,
} from "./number-tile-turn-draft.js";
import {
  NUMBER_TILE_COLOR_MARKERS,
  classifyNumberTileDraftMeld,
  numberTileDraftMeldIsValid,
  numberTileInitialMeldValueHint,
  numberTilePlacementLabel,
  sortNumberTileRackTiles,
  type NumberTileMeldClassification,
  type NumberTileRackSortMode,
} from "./number-tile-ux.js";
import type { NumberTileTurnDraftController } from "./use-number-tile-turn-draft.js";

type ConfirmAction = "DRAW" | "PASS";

type TileButtonProps = Readonly<{
  tile:
    | NumberTilePrivateRackTileViewV2
    | NumberTileTablePlacementV2
    | NumberTileDraftPlacement;
  selected?: boolean;
  disabled?: boolean;
  dragging?: boolean;
  dragEnabled?: boolean;
  locationLabel: string;
  interactionLabel: string;
  buttonRef?: RefCallback<HTMLButtonElement>;
  onSelect: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}>;

function TileButton(props: TileButtonProps) {
  const color =
    props.tile.kind === "ORDINARY"
      ? props.tile.color
      : null;
  const number =
    props.tile.kind === "ORDINARY"
      ? props.tile.number
      : null;
  const label = numberTilePlacementLabel(props.tile);

  return (
    <button
      ref={props.buttonRef}
      className={`number-tile${props.tile.kind === "JOKER" ? " joker" : ""}${
        color === null ? "" : ` ${color.toLowerCase()}`
      }${
        props.selected ? " selected" : ""
      }${
        props.dragging ? " dragging" : ""
      }`}
      type="button"
      aria-label={`${label}, ${props.locationLabel}. ${props.interactionLabel}`}
      aria-pressed={props.selected === undefined ? undefined : props.selected}
      disabled={props.disabled}
      data-drag-enabled={props.dragEnabled === true ? "true" : undefined}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        props.onSelect();
      }}
      onPointerDown={props.onPointerDown}
    >
      <span className="number-tile-marker" aria-hidden="true">
        {props.tile.kind === "JOKER"
          ? "★"
          : NUMBER_TILE_COLOR_MARKERS[props.tile.color]}
      </span>
      <strong aria-hidden="true">{number ?? "J"}</strong>
      {props.tile.kind === "JOKER" ? (
        <small aria-hidden="true">JOKER</small>
      ) : null}
    </button>
  );
}

type NumberTileDropTarget =
  | Readonly<{ kind: "MELD"; meldIndex: number }>
  | Readonly<{ kind: "NEW_MELD" }>
  | Readonly<{ kind: "RACK" }>;

type NumberTileFocusTarget =
  | Readonly<{ kind: "RACK_TILE"; tileId: TileId }>
  | Readonly<{ kind: "MELD"; meldIndex: number }>;

type NumberTilePointerDrag = {
  tileId: TileId;
  pointerId: number;
  captureElement: HTMLButtonElement;
  startX: number;
  startY: number;
  started: boolean;
};

const NUMBER_TILE_DRAG_THRESHOLD_PX = 6;

function dropTargetKey(target: NumberTileDropTarget): string {
  return target.kind === "MELD"
    ? `MELD:${target.meldIndex}`
    : target.kind;
}

function meldStatusLabel(classification: NumberTileMeldClassification): string {
  switch (classification.status) {
    case "VALID":
      return classification.interpretation.kind === "GROUP"
        ? "✓ 같은 숫자 조합"
        : "✓ 연속 숫자 조합";
    case "INCOMPLETE":
      return "● 조합을 만드는 중";
    case "INVALID":
      return "! 아직 유효한 조합이 아닙니다";
  }
}

function canonicalMeldClassification(
  meld: { kind: "GROUP" | "RUN" | null },
): NumberTileMeldClassification {
  return meld.kind === null
    ? { status: "INVALID" }
    : {
    status: "VALID",
    interpretation: { kind: meld.kind, jokerRole: null },
  };
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
  const draft = props.controller.draft;
  const [selectedTileId, setSelectedTileId] = useState<TileId | null>(null);
  const [activeMeldIndex, setActiveMeldIndex] = useState<number | null>(null);
  const [draggedTileId, setDraggedTileId] = useState<TileId | null>(null);
  const [dropTarget, setDropTarget] = useState<NumberTileDropTarget | null>(
    null,
  );
  const [interactionMessage, setInteractionMessage] = useState<string | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState<ConfirmAction | null>(null);
  const [rackSortMode, setRackSortMode] =
    useState<NumberTileRackSortMode>("DEFAULT");
  const [focusRequestVersion, setFocusRequestVersion] = useState(0);
  const drawButtonRef = useRef<HTMLButtonElement>(null);
  const passButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationButtonRef = useRef<HTMLButtonElement>(null);
  const rackTileButtonRefs = useRef(new Map<TileId, HTMLButtonElement>());
  const meldActivationButtonRefs = useRef(
    new Map<number, HTMLButtonElement>(),
  );
  const pendingFocusTargetRef = useRef<NumberTileFocusTarget | null>(null);
  const draggedTileIdRef = useRef<TileId | null>(null);
  const pointerDragRef = useRef<NumberTilePointerDrag | null>(null);
  const pointerMoveHandlerRef = useRef<(event: PointerEvent) => void>(() => {});
  const pointerUpHandlerRef = useRef<(event: PointerEvent) => void>(() => {});
  const pointerCancelHandlerRef = useRef<(event: PointerEvent) => void>(
    () => {},
  );
  const suppressClickTileIdRef = useRef<TileId | null>(null);
  const suppressClickTimeoutRef = useRef<number | null>(null);
  const draftBaseline = draft?.baseline ?? null;
  const previousDraftBaselineRef = useRef(draftBaseline);

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

  useEffect(() => {
    if (previousDraftBaselineRef.current === draftBaseline) {
      return;
    }
    previousDraftBaselineRef.current = draftBaseline;
    draggedTileIdRef.current = null;
    pointerDragRef.current = null;
    suppressClickTileIdRef.current = null;
    setSelectedTileId(null);
    setActiveMeldIndex(null);
    setDraggedTileId(null);
    setDropTarget(null);
    setInteractionMessage(null);
    setConfirmation(null);
    pendingFocusTargetRef.current = null;
  }, [draftBaseline]);

  useEffect(() => () => {
    if (suppressClickTimeoutRef.current !== null) {
      window.clearTimeout(suppressClickTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (
      draft === null ||
      (activeMeldIndex !== null &&
        draft.table.melds[activeMeldIndex] === undefined)
    ) {
      setActiveMeldIndex(null);
    }
  }, [activeMeldIndex, draft]);

  useEffect(() => {
    if (!props.controller.canEdit) {
      draggedTileIdRef.current = null;
      pointerDragRef.current = null;
      setDraggedTileId(null);
      setDropTarget(null);
    }
  }, [props.controller.canEdit]);

  function isMeldLocked(meldIndex: number): boolean {
    const meld = draft?.table.melds[meldIndex];
    return (
      draft === null ||
      meld === undefined ||
      !props.controller.canEdit ||
      (draft.mode === "INITIAL_MELD" &&
        meld.origin === "CANONICAL_TABLE")
    );
  }

  function adjustedMeldIndexAfterMove(
    tileId: TileId,
    targetMeldIndex: number,
  ): number {
    if (draft === null) {
      return targetMeldIndex;
    }
    const source = findNumberTileDraftTile(draft, tileId);
    if (
      source?.source === "TABLE" &&
      source.meldIndex !== targetMeldIndex &&
      source.meldIndex < targetMeldIndex &&
      source.tileIndex === 0 &&
      draft.table.melds[source.meldIndex]?.tiles.length === 1
    ) {
      return targetMeldIndex - 1;
    }
    return targetMeldIndex;
  }

  function newMeldIndexAfterMove(tileId: TileId): number {
    if (draft === null) {
      return 0;
    }
    const reusable = findNumberTileDraftReusableEmptyMeldIndex(draft);
    if (reusable !== null) {
      return adjustedMeldIndexAfterMove(tileId, reusable);
    }
    const source = findNumberTileDraftTile(draft, tileId);
    const prunesSourceMeld =
      source?.source === "TABLE" &&
      draft.table.melds[source.meldIndex]?.tiles.length === 1;
    return draft.table.melds.length - (prunesSourceMeld ? 1 : 0);
  }

  function clearDragState(): void {
    draggedTileIdRef.current = null;
    setDraggedTileId(null);
    setDropTarget(null);
  }

  function requestFocus(target: NumberTileFocusTarget): void {
    pendingFocusTargetRef.current = target;
    setFocusRequestVersion((current) => current + 1);
  }

  function finishDrag(): void {
    const completedTileId = draggedTileIdRef.current;
    if (completedTileId !== null) {
      suppressClickTileIdRef.current = completedTileId;
      if (suppressClickTimeoutRef.current !== null) {
        window.clearTimeout(suppressClickTimeoutRef.current);
      }
      suppressClickTimeoutRef.current = window.setTimeout(() => {
        if (suppressClickTileIdRef.current === completedTileId) {
          suppressClickTileIdRef.current = null;
        }
        suppressClickTimeoutRef.current = null;
      }, 100);
    }
    clearDragState();
  }

  function ignoreClickAfterDrag(tileId: TileId): boolean {
    if (suppressClickTileIdRef.current !== tileId) {
      return false;
    }
    suppressClickTileIdRef.current = null;
    return true;
  }

  function startTileDrag(tileId: TileId): boolean {
    if (draft === null || !props.controller.canEdit) {
      return false;
    }
    const source = findNumberTileDraftTile(draft, tileId);
    if (
      source === null ||
      (source.source === "TABLE" && isMeldLocked(source.meldIndex))
    ) {
      return false;
    }
    draggedTileIdRef.current = tileId;
    setDraggedTileId(tileId);
    setSelectedTileId(null);
    setDropTarget(null);
    setInteractionMessage(null);
    props.controller.clearFeedback();
    return true;
  }

  function showDropTarget(target: NumberTileDropTarget): void {
    setDropTarget((current) =>
      current !== null && dropTargetKey(current) === dropTargetKey(target)
        ? current
        : target,
    );
  }

  function canDropOnMeld(tileId: TileId, meldIndex: number): boolean {
    if (draft === null || isMeldLocked(meldIndex)) {
      return false;
    }
    const source = findNumberTileDraftTile(draft, tileId);
    return (
      source !== null &&
      !(source.source === "TABLE" && isMeldLocked(source.meldIndex))
    );
  }

  function placeTileOnMeld(tileId: TileId, meldIndex: number): void {
    if (draft === null || !canDropOnMeld(tileId, meldIndex)) {
      setInteractionMessage("선택한 조합에는 이 타일을 놓을 수 없습니다.");
      return;
    }
    const source = findNumberTileDraftTile(draft, tileId);
    if (source?.source === "TABLE" && source.meldIndex === meldIndex) {
      setActiveMeldIndex(meldIndex);
      setSelectedTileId(null);
      setInteractionMessage(null);
      return;
    }
    const finalMeldIndex = adjustedMeldIndexAfterMove(tileId, meldIndex);
    props.controller.clearFeedback();
    props.controller.appendTileToMeld(tileId, meldIndex);
    setActiveMeldIndex(finalMeldIndex);
    setSelectedTileId(null);
    setInteractionMessage(null);
  }

  function placeTileInNewMeld(tileId: TileId): void {
    if (draft === null || !props.controller.canEdit) {
      return;
    }
    const source = findNumberTileDraftTile(draft, tileId);
    if (
      source === null ||
      (source.source === "TABLE" && isMeldLocked(source.meldIndex))
    ) {
      setInteractionMessage("이 타일로 새 조합을 만들 수 없습니다.");
      return;
    }
    const finalMeldIndex = newMeldIndexAfterMove(tileId);
    props.controller.clearFeedback();
    props.controller.placeTileInNewMeld(tileId);
    setActiveMeldIndex(finalMeldIndex);
    setSelectedTileId(null);
    setInteractionMessage(null);
  }

  function placeRackTile(tileId: TileId): void {
    if (ignoreClickAfterDrag(tileId) || draft === null) {
      return;
    }
    const source = findNumberTileDraftTile(draft, tileId);
    if (source?.source !== "AVAILABLE_RACK") {
      return;
    }
    const displayedRackIndex = displayedRackTiles.findIndex(
      (tile) => tile.tileId === tileId,
    );
    const nextRackTile =
      displayedRackTiles[displayedRackIndex + 1] ??
      displayedRackTiles[displayedRackIndex - 1] ??
      null;
    const reusableMeldIndex = findNumberTileDraftReusableEmptyMeldIndex(draft);
    const targetMeldIndex =
      activeMeldIndex !== null && !isMeldLocked(activeMeldIndex)
        ? activeMeldIndex
        : reusableMeldIndex;
    if (targetMeldIndex === null) {
      requestFocus(nextRackTile === null
        ? { kind: "MELD", meldIndex: newMeldIndexAfterMove(tileId) }
        : { kind: "RACK_TILE", tileId: nextRackTile.tileId });
      placeTileInNewMeld(tileId);
      return;
    }
    requestFocus(nextRackTile === null
      ? {
          kind: "MELD",
          meldIndex: adjustedMeldIndexAfterMove(tileId, targetMeldIndex),
        }
      : { kind: "RACK_TILE", tileId: nextRackTile.tileId });
    placeTileOnMeld(tileId, targetMeldIndex);
  }

  function returnPlacedTileToRack(tileId: TileId): void {
    if (draft === null) {
      return;
    }
    const source = findNumberTileDraftTile(draft, tileId);
    if (source?.source !== "TABLE") {
      return;
    }
    if (source.tile.origin === "CANONICAL_TABLE") {
      setInteractionMessage(
        "공개 테이블의 타일은 내 랙으로 가져올 수 없습니다.",
      );
      return;
    }
    const removesSourceMeld =
      draft.table.melds[source.meldIndex]?.tiles.length === 1;
    requestFocus({ kind: "RACK_TILE", tileId });
    props.controller.clearFeedback();
    props.controller.returnTileToRack(tileId);
    setActiveMeldIndex((current) => {
      if (!removesSourceMeld || current === null) {
        return current;
      }
      if (current === source.meldIndex) {
        return null;
      }
      return current > source.meldIndex ? current - 1 : current;
    });
    setSelectedTileId(null);
    setInteractionMessage("타일을 내 랙으로 되돌렸습니다.");
  }

  function selectTableTile(tileId: TileId): void {
    if (ignoreClickAfterDrag(tileId) || draft === null) {
      return;
    }
    const source = findNumberTileDraftTile(draft, tileId);
    if (source?.source !== "TABLE") {
      return;
    }
    setSelectedTileId((current) => current === tileId ? null : tileId);
    setActiveMeldIndex(source.meldIndex);
    setInteractionMessage(
      source.tile.origin === "CANONICAL_TABLE"
        ? "옮길 조합을 선택하세요. 공개 테이블 타일은 랙으로 가져올 수 없습니다."
        : null,
    );
    props.controller.clearFeedback();
  }

  function activateMeld(meldIndex: number): void {
    if (draft === null || isMeldLocked(meldIndex)) {
      return;
    }
    const selected = selectedTileId === null
      ? null
      : findNumberTileDraftTile(draft, selectedTileId);
    if (
      selected?.source === "TABLE" &&
      selected.meldIndex !== meldIndex
    ) {
      requestFocus({
        kind: "MELD",
        meldIndex: adjustedMeldIndexAfterMove(
          selected.tile.tileId,
          meldIndex,
        ),
      });
      placeTileOnMeld(selected.tile.tileId, meldIndex);
      return;
    }
    setActiveMeldIndex(meldIndex);
    setInteractionMessage(null);
    props.controller.clearFeedback();
  }

  function activateMeldFromCard(
    event: ReactMouseEvent<HTMLElement>,
    meldIndex: number,
  ): void {
    if (
      event.target instanceof Element &&
      event.target.closest("button, select, input") !== null
    ) {
      return;
    }
    activateMeld(meldIndex);
  }

  function activateNewMeld(): void {
    if (draft === null || !props.controller.canEdit) {
      return;
    }
    const selected = selectedTileId === null
      ? null
      : findNumberTileDraftTile(draft, selectedTileId);
    if (
      selected?.source === "TABLE" &&
      !isMeldLocked(selected.meldIndex)
    ) {
      const finalMeldIndex = newMeldIndexAfterMove(selected.tile.tileId);
      requestFocus({
        kind: "MELD",
        meldIndex: finalMeldIndex,
      });
      placeTileInNewMeld(selected.tile.tileId);
      setSelectedTileId(null);
      return;
    }
    const reusableMeldIndex = findNumberTileDraftReusableEmptyMeldIndex(draft);
    if (reusableMeldIndex !== null) {
      setActiveMeldIndex(reusableMeldIndex);
    } else {
      setActiveMeldIndex(draft.table.melds.length);
      props.controller.addMeld();
    }
    setSelectedTileId(null);
    setInteractionMessage(null);
    props.controller.clearFeedback();
  }

  function pointerDropTargetAt(
    clientX: number,
    clientY: number,
  ): NumberTileDropTarget | null {
    const element = document.elementFromPoint(clientX, clientY);
    if (element === null) {
      return null;
    }
    const meldElement = element.closest("[data-number-drop-meld-index]") as
      | HTMLElement
      | null;
    if (meldElement !== null) {
      const meldIndex = Number(meldElement.dataset.numberDropMeldIndex);
      return Number.isInteger(meldIndex)
        ? { kind: "MELD", meldIndex }
        : null;
    }
    if (element.closest("[data-number-drop-new-meld]") !== null) {
      return { kind: "NEW_MELD" };
    }
    if (element.closest("[data-number-drop-rack]") !== null) {
      return { kind: "RACK" };
    }
    return null;
  }

  function canUseDropTarget(
    tileId: TileId,
    target: NumberTileDropTarget,
  ): boolean {
    if (draft === null) {
      return false;
    }
    if (target.kind === "MELD") {
      return canDropOnMeld(tileId, target.meldIndex);
    }
    const source = findNumberTileDraftTile(draft, tileId);
    if (source === null) {
      return false;
    }
    if (target.kind === "RACK") {
      return source.source === "TABLE";
    }
    return !(
      source.source === "TABLE" && isMeldLocked(source.meldIndex)
    );
  }

  function beginPointerCandidate(
    event: ReactPointerEvent<HTMLButtonElement>,
    tileId: TileId,
  ): void {
    if (
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      draft === null ||
      !props.controller.canEdit
    ) {
      return;
    }
    const source = findNumberTileDraftTile(draft, tileId);
    if (
      source === null ||
      (source.source === "TABLE" && isMeldLocked(source.meldIndex))
    ) {
      return;
    }
    pointerDragRef.current = {
      tileId,
      pointerId: event.pointerId,
      captureElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePointerCandidate(
    event: PointerEvent,
  ): void {
    const candidate = pointerDragRef.current;
    if (candidate === null || candidate.pointerId !== event.pointerId) {
      return;
    }
    if (!candidate.started) {
      const distance = Math.hypot(
        event.clientX - candidate.startX,
        event.clientY - candidate.startY,
      );
      if (distance < NUMBER_TILE_DRAG_THRESHOLD_PX) {
        return;
      }
      if (!startTileDrag(candidate.tileId)) {
        pointerDragRef.current = null;
        if (candidate.captureElement.hasPointerCapture(event.pointerId)) {
          candidate.captureElement.releasePointerCapture(event.pointerId);
        }
        return;
      }
      candidate.started = true;
    }
    event.preventDefault();
    const target = pointerDropTargetAt(event.clientX, event.clientY);
    if (target === null || !canUseDropTarget(candidate.tileId, target)) {
      setDropTarget(null);
      return;
    }
    showDropTarget(target);
  }

  function endPointerCandidate(
    event: PointerEvent,
  ): void {
    const candidate = pointerDragRef.current;
    if (candidate === null || candidate.pointerId !== event.pointerId) {
      return;
    }
    pointerDragRef.current = null;
    if (candidate.captureElement.hasPointerCapture(event.pointerId)) {
      candidate.captureElement.releasePointerCapture(event.pointerId);
    }
    if (!candidate.started) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const target = pointerDropTargetAt(event.clientX, event.clientY);
    if (target === null || !canUseDropTarget(candidate.tileId, target)) {
      setInteractionMessage("이 위치에는 타일을 놓을 수 없습니다.");
    } else if (target.kind === "MELD") {
      requestFocus({
        kind: "MELD",
        meldIndex: adjustedMeldIndexAfterMove(
          candidate.tileId,
          target.meldIndex,
        ),
      });
      placeTileOnMeld(candidate.tileId, target.meldIndex);
    } else if (target.kind === "NEW_MELD") {
      requestFocus({
        kind: "MELD",
        meldIndex: newMeldIndexAfterMove(candidate.tileId),
      });
      placeTileInNewMeld(candidate.tileId);
    } else {
      returnPlacedTileToRack(candidate.tileId);
    }
    finishDrag();
  }

  function cancelPointerCandidate(
    event: PointerEvent,
  ): void {
    const candidate = pointerDragRef.current;
    if (candidate === null || candidate.pointerId !== event.pointerId) {
      return;
    }
    pointerDragRef.current = null;
    if (candidate.captureElement.hasPointerCapture(event.pointerId)) {
      candidate.captureElement.releasePointerCapture(event.pointerId);
    }
    clearDragState();
  }

  pointerMoveHandlerRef.current = movePointerCandidate;
  pointerUpHandlerRef.current = endPointerCandidate;
  pointerCancelHandlerRef.current = cancelPointerCandidate;

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      pointerMoveHandlerRef.current(event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      pointerUpHandlerRef.current(event);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      pointerCancelHandlerRef.current(event);
    };
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
      pointerDragRef.current = null;
      draggedTileIdRef.current = null;
    };
  }, []);

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
  const dragged =
    draft === null || draggedTileId === null
      ? null
      : findNumberTileDraftTile(draft, draggedTileId);
  const rackDropBlocked =
    dragged?.source === "TABLE" &&
    dragged.tile.origin === "CANONICAL_TABLE";
  const currentDropTargetKey =
    dropTarget === null ? null : dropTargetKey(dropTarget);
  const rackTiles =
    draft?.availableRackTiles ?? props.snapshot.game.privateState.rack;
  const displayedRackTiles = useMemo(
    () => sortNumberTileRackTiles(rackTiles, rackSortMode),
    [rackSortMode, rackTiles],
  );

  useEffect(() => {
    const target = pendingFocusTargetRef.current;
    pendingFocusTargetRef.current = null;
    if (target === null) {
      return;
    }
    const element = target.kind === "RACK_TILE"
      ? rackTileButtonRefs.current.get(target.tileId)
      : meldActivationButtonRefs.current.get(target.meldIndex);
    if (element !== undefined) {
      element.focus();
    }
  }, [activeMeldIndex, displayedRackTiles, draft, focusRequestVersion]);
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
    draft.table.melds.length > 0 &&
    draft.table.melds.every(numberTileDraftMeldIsValid);

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

      <p className="number-editor-guide">
        <strong>조합 만들기:</strong> 랙 타일을 누르면 현재 편집 중인
        조합에 바로 들어갑니다. 데스크톱에서는 타일을 원하는 조합으로
        끌어놓을 수도 있습니다.
      </p>

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
      {interactionMessage !== null ? (
        <p className="notice" role="status">
          {interactionMessage}
        </p>
      ) : null}

      {draft?.mode === "INITIAL_MELD" ? (
        <p className="number-rule-hint">
          첫 등록: 내 타일만 사용해 합계 30점 이상
          <strong>
            현재 조합 점수 {numberTileInitialMeldValueHint(draft.table.melds)} / 30
          </strong>
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
            const classification = draftMeld === undefined
              ? canonicalMeldClassification(meld)
              : classifyNumberTileDraftMeld(draftMeld);
            const locked = isMeldLocked(meldIndex);
            const active = !locked && activeMeldIndex === meldIndex;
            const highlighted =
              currentDropTargetKey === `MELD:${meldIndex}`;
            return (
              <article
                className={`number-meld-card${locked ? " locked" : ""}${
                  active ? " active" : ""
                }${highlighted ? " is-drop-target" : ""}${
                  meld.tiles.length === 0 ? " empty" : ""
                }`}
                key={`number-meld-${meldIndex}`}
                aria-labelledby={`number-meld-${meldIndex}-title number-meld-${meldIndex}-status`}
                data-number-drop-meld-index={meldIndex}
                onClick={(event) => activateMeldFromCard(event, meldIndex)}
              >
                <header>
                  <div>
                    <span
                      className="group-number"
                      id={`number-meld-${meldIndex}-title`}
                    >
                      조합 {meldIndex + 1}
                    </span>
                    <strong
                      id={`number-meld-${meldIndex}-status`}
                      className={`number-meld-status ${classification.status.toLowerCase()}`}
                    >
                      {meldStatusLabel(classification)}
                    </strong>
                  </div>
                  <div className="number-meld-card-actions">
                    {draftMeld !== undefined && !locked ? (
                      <button
                        ref={(element) => {
                          if (element === null) {
                            meldActivationButtonRefs.current.delete(meldIndex);
                          } else {
                            meldActivationButtonRefs.current.set(
                              meldIndex,
                              element,
                            );
                          }
                        }}
                        className={`compact-button number-activate-meld${
                          active ? " active" : ""
                        }`}
                        type="button"
                        aria-pressed={active}
                        aria-label={
                          selected?.source === "TABLE" &&
                          selected.meldIndex !== meldIndex
                            ? `선택한 타일을 조합 ${meldIndex + 1}로 이동`
                            : `조합 ${meldIndex + 1}, 편집 대상으로 선택`
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          activateMeld(meldIndex);
                        }}
                      >
                        {active
                          ? "● 여기에 추가 중"
                          : selected?.source === "TABLE" &&
                              selected.meldIndex !== meldIndex
                            ? "여기로 이동"
                            : "편집 대상으로 선택"}
                      </button>
                    ) : (
                      <span className="lock-label">읽기 전용</span>
                    )}
                    {draftMeld !== undefined &&
                    !locked &&
                    draftMeld.tiles.length === 0 ? (
                      <button
                        className="text-button number-remove-empty-meld"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.controller.removeEmptyMeld(meldIndex);
                          setActiveMeldIndex((current) =>
                            current === meldIndex
                              ? null
                              : current !== null && current > meldIndex
                                ? current - 1
                                : current,
                          );
                        }}
                      >
                        비우기
                      </button>
                    ) : null}
                  </div>
                </header>
                <div className="number-meld-tiles">
                  {meld.tiles.map((tile, tileIndex) => {
                    const draftPlacement = draftMeld?.tiles[tileIndex];
                    return (
                      <TileButton
                        key={tile.tileId}
                        tile={tile}
                        selected={selectedTileId === tile.tileId}
                        dragging={draggedTileId === tile.tileId}
                        dragEnabled={!locked}
                        disabled={locked}
                        locationLabel={`조합 ${meldIndex + 1}`}
                        interactionLabel={
                          locked
                            ? "읽기 전용"
                            : draftPlacement?.origin === "SELF_RACK"
                              ? "누르면 선택하고, 다른 조합이나 내 랙으로 옮길 수 있습니다"
                              : "누르면 선택하고, 끌어서 다른 조합으로 옮길 수 있습니다"
                        }
                        onSelect={() => selectTableTile(tile.tileId)}
                        onPointerDown={(event) =>
                          beginPointerCandidate(event, tile.tileId)
                        }
                      />
                    );
                  })}
                  {meld.tiles.length === 0 ? (
                    <span className="empty-group-copy">
                      {active
                        ? "랙 타일을 누르거나 여기로 끌어놓으세요."
                        : "이 조합을 선택하면 랙 타일이 여기에 들어갑니다."}
                    </span>
                  ) : null}
                </div>
              </article>
            );
          },
        )}
        {(draft?.table.melds.length ?? props.snapshot.game.table.melds.length) === 0 ? (
          <div className="empty-board-copy number-empty-table-copy">
            <strong>아직 공개된 조합이 없습니다.</strong>
            <span>첫 등록을 기다리고 있습니다.</span>
            <span>
              랙 타일을 눌러 같은 숫자 또는 같은 색의 연속 숫자 3개 이상을
              만드세요. 첫 등록은 합계 30점 이상이어야 합니다.
            </span>
          </div>
        ) : null}
      </div>

      {draft !== null ? (
        <div
          className="number-editor-toolbar"
          role="group"
          aria-label="조합 편집 도구"
        >
          <button
            className={`secondary-button number-add-meld${
              currentDropTargetKey === "NEW_MELD" ? " is-drop-target" : ""
            }`}
            type="button"
            data-number-drop-new-meld
            aria-label={
              selected?.source === "TABLE"
                ? "선택한 타일로 새 조합 만들기"
                : "+ 새 조합 만들기"
            }
            disabled={!props.controller.canEdit}
            onClick={activateNewMeld}
          >
            {draggedTileId === null
              ? "+ 새 조합 만들기"
              : "+ 여기에 놓아 새 조합 만들기"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!props.controller.canEdit || draft.history.length === 0}
            onClick={() => {
              props.controller.undo();
              setActiveMeldIndex(null);
              setSelectedTileId(null);
              setInteractionMessage(null);
              clearDragState();
            }}
          >
            실행 취소
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!props.controller.canEdit || !props.controller.isDirty}
            onClick={() => {
              props.controller.reset();
              setActiveMeldIndex(null);
              setSelectedTileId(null);
              setInteractionMessage(null);
              clearDragState();
            }}
          >
            배치 초기화
          </button>
        </div>
      ) : null}

      <section
        className={`number-rack${
          currentDropTargetKey === "RACK" ? " is-drop-target" : ""
        }${
          currentDropTargetKey === "RACK" && rackDropBlocked
            ? " is-drop-blocked"
            : ""
        }`}
        aria-labelledby="number-rack-heading"
        data-number-drop-rack
      >
        <div className="number-rack-heading">
          <div>
            <h3 id="number-rack-heading">내 랙</h3>
            <span className="number-rack-count">{rackTiles.length}개</span>
          </div>
          <div className="number-rack-sort" role="group" aria-label="내 랙 정렬">
            {([
              ["DEFAULT", "기본"],
              ["NUMBER", "숫자순"],
              ["COLOR", "색상순"],
            ] as const).map(([mode, label]) => (
              <button
                className="compact-button"
                type="button"
                key={mode}
                aria-pressed={rackSortMode === mode}
                onClick={() => setRackSortMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="number-rack-tiles">
          {displayedRackTiles.map((tile) => (
            <TileButton
              key={tile.tileId}
              tile={tile}
              dragging={draggedTileId === tile.tileId}
              dragEnabled={props.controller.canEdit}
              disabled={!props.controller.canEdit}
              locationLabel="내 랙"
              interactionLabel="누르면 현재 편집 중인 조합에 추가되고, 끌어서 원하는 조합으로 옮길 수 있습니다"
              buttonRef={(element) => {
                if (element === null) {
                  rackTileButtonRefs.current.delete(tile.tileId);
                } else {
                  rackTileButtonRefs.current.set(tile.tileId, element);
                }
              }}
              onSelect={() => placeRackTile(tile.tileId)}
              onPointerDown={(event) =>
                beginPointerCandidate(event, tile.tileId)
              }
            />
          ))}
          {rackTiles.length === 0 ? (
            <p>랙에 남은 타일이 없습니다.</p>
          ) : null}
        </div>
        {draft === null ? (
          <p className="selection-help">상대 차례에는 내 랙을 읽기 전용으로 표시합니다.</p>
        ) : null}
        {dragged?.source === "TABLE" ? (
          <p
            className={`number-rack-drop-message${
              rackDropBlocked ? " blocked" : ""
            }`}
          >
            {rackDropBlocked
              ? "공개 테이블 타일은 내 랙으로 가져올 수 없습니다."
              : "여기에 놓아 내 랙으로 되돌리기"}
          </p>
        ) : null}
        {selected?.source === "TABLE" && selected.tile.origin === "SELF_RACK" ? (
          <button className="text-button" type="button" disabled={!props.controller.canEdit} onClick={() => {
            returnPlacedTileToRack(selected.tile.tileId);
          }}>
            선택한 타일을 랙으로 되돌리기
          </button>
        ) : null}
      </section>

      {draft !== null ? (
        <div className="number-submit-panel">
          <button
            className="primary-button"
            type="button"
            disabled={!canSubmitDraft}
            aria-busy={props.submitPending}
            onClick={() => props.onSubmit(draft)}
          >
            {props.submitPending ? "제출 중..." : "조합 제출"}
          </button>
          {!draft.table.melds.every(numberTileDraftMeldIsValid) ? (
            <p>모든 조합을 유효하게 완성해주세요.</p>
          ) : null}
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
                : "패스"}
          </button>
        )}
      </div>

      {confirmation !== null ? (
        <section className="draw-confirmation" aria-labelledby="number-action-confirmation">
          <p id="number-action-confirmation" role="status">
            편집 중인 배치는 저장되지 않습니다. {confirmation === "DRAW" ? "타일을 가져올까요?" : "패스할까요?"}
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
