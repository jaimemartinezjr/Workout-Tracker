import { useRef, useState, type PointerEvent } from "react";

type Props = {
  exerciseId: string;
  label: string;
  index: number;
  count: number;
  onMove: (offset: number) => void;
  onDrop: (targetId: string) => void;
};

/** Pointer capture keeps mouse, pen and touch drags attached to the handle. */
export default function ExerciseOrderControls({
  exerciseId, label, index, count, onMove, onDrop,
}: Props) {
  const origin = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    origin.current = null;
    setDragging(false);
  };

  const drop = (event: PointerEvent<HTMLButtonElement>) => {
    const start = origin.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const container = event.currentTarget.closest(".exercise-rows");
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-exercise-id]");
    if (start.moved && target && container?.contains(target)) {
      const targetId = target.dataset.exerciseId;
      if (targetId && targetId !== exerciseId) onDrop(targetId);
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
