import { useRef, useState, type PointerEvent } from "react";

type Props = {
  exerciseId: string;
  label: string;
  index: number;
  count: number;
  onMove: (offset: number) => void;
  onDrop: (targetId: string, placement: "before" | "after") => void;
};

/** Pointer capture keeps mouse, pen and touch drags attached to the handle. */
export default function ExerciseOrderControls({
  exerciseId, label, index, count, onMove, onDrop,
}: Props) {
  const origin = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const destination = useRef<{ row: HTMLElement; placement: "before" | "after" } | null>(null);

  const clearDestination = () => {
    destination.current?.row.removeAttribute("data-drop-placement");
    destination.current = null;
  };

  const updateDestination = (event: PointerEvent<HTMLButtonElement>) => {
    clearDestination();
    const container = event.currentTarget.closest(".exercise-rows");
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top - 20 || event.clientY > bounds.bottom + 20) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-exercise-id]"))
      .filter((row) => row.dataset.exerciseId !== exerciseId);
    // Choose the nearest row, including the gaps between rows.
    const row = rows.reduce<HTMLElement | null>((nearest, candidate) => {
      const distance = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return Math.max(rect.top - event.clientY, event.clientY - rect.bottom, 0);
      };
      return !nearest || distance(candidate) < distance(nearest) ? candidate : nearest;
    }, null);
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    row.dataset.dropPlacement = placement;
    destination.current = { row, placement };
  };

  const reset = () => {
    clearDestination();
    origin.current = null;
    setDragging(false);
  };

  const drop = (event: PointerEvent<HTMLButtonElement>) => {
    const start = origin.current;
    if (!start || event.pointerId !== start.pointerId) return;
    if (start.moved) {
      updateDestination(event);
      const target = destination.current;
      const targetId = target?.row.dataset.exerciseId;
      if (target && targetId) onDrop(targetId, target.placement);
    }
    reset();
  };

  return (
    <div className="exercise-order-controls">
      <button
        className={`exercise-order-handle${dragging ? " is-dragging" : ""}`}
        type="button"
        aria-label={`Drag to reorder ${label}`}
        title="Drag to reorder, or use the up and down arrow keys"
        disabled={count < 2}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          origin.current = {
            pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
          };
        }}
        onPointerMove={(event) => {
          const start = origin.current;
          if (!start || start.pointerId !== event.pointerId) return;
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 6) {
            start.moved = true;
            setDragging(true);
          }
          if (start.moved) {
            if (event.clientY < 60) window.scrollBy(0, -18);
            if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 18);
            updateDestination(event);
          }
        }}
        onPointerUp={drop}
        onPointerCancel={reset}
        onLostPointerCapture={reset}
        onKeyDown={(event) => {
          if (event.key === "Escape") reset();
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            onMove(event.key === "ArrowUp" ? -1 : 1);
          }
        }}
      >
        <span aria-hidden="true">⠿</span>
        <span>Drag<span className="exercise-order-extra"> to reorder</span></span>
      </button>
      <span className="exercise-order-position">{index + 1} of {count}</span>
      <button
        className="exercise-order-step"
        type="button"
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >↑</button>
      <button
        className="exercise-order-step"
        type="button"
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >↓</button>
    </div>
  );
}
