import { useEffect, useRef, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import type { Locale } from "../lib/i18n";
import "./exercise-reorder.css";

interface Drag {
  pointerId: number;
  startY: number;
  clientY: number;
  rows: HTMLElement[];
  source: number;
  target: number;
  scroller: HTMLElement;
  frame?: number;
  onEscape: (event: KeyboardEvent) => void;
}

const rowSelector = "[data-exercise-reorder-item]";

function scrollContainer(row: HTMLElement): HTMLElement {
  for (let parent = row.parentElement; parent; parent = parent.parentElement) {
    if (/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement;
}

function previewDrop(drag: Drag) {
  const target = drag.rows.reduce((index, row, rowIndex) => {
    if (rowIndex === drag.source) return index;
    const bounds = row.getBoundingClientRect();
    return index + Number(drag.clientY > bounds.top + bounds.height / 2);
  }, 0);
  if (target === drag.target) return;
  delete drag.rows[drag.target].dataset.exerciseDrop;
  if (target !== drag.source) drag.rows[target].dataset.exerciseDrop = target < drag.source ? "before" : "after";
  drag.target = target;
}

function scrollAtEdge(drag: Drag) {
  const page = drag.scroller === document.scrollingElement || drag.scroller === document.documentElement;
  const bounds = page ? { top: 0, bottom: window.innerHeight } : drag.scroller.getBoundingClientRect();
  const edge = Math.min(page ? 100 : 56, (bounds.bottom - bounds.top) / 3);
  const speed = (distance: number) => 1 + Math.round(17 * Math.min(1, Math.max(0, distance / edge)));
  const fromTop = drag.clientY - bounds.top;
  const fromBottom = bounds.bottom - drag.clientY;
  if (fromTop < edge) drag.scroller.scrollBy({ top: -speed(edge - fromTop), behavior: "instant" });
  else if (fromBottom < edge) drag.scroller.scrollBy({ top: speed(edge - fromBottom), behavior: "instant" });
}

function resetDrag(drag: Drag | undefined) {
  if (!drag) return;
  if (drag.frame !== undefined) cancelAnimationFrame(drag.frame);
  window.removeEventListener("keydown", drag.onEscape, true);
  delete drag.rows[drag.source].dataset.exerciseDragging;
  delete drag.rows[drag.target].dataset.exerciseDrop;
}

// The arrow buttons on each row provide the alternative to dragging.
export function ExerciseDragHandle({ locale, onMove }: { locale: Locale; onMove: (index: number) => void }) {
  const dragRef = useRef<Drag>(undefined);
  useEffect(() => () => resetDrag(dragRef.current), []);

  const start = (event: PointerEvent<HTMLSpanElement>) => {
    if (!event.isPrimary || event.button !== 0 || dragRef.current) return;
    const row = event.currentTarget.closest<HTMLElement>(rowSelector);
    if (!row?.parentElement) return;
    const rows = Array.from(row.parentElement.children).filter((item): item is HTMLElement => item instanceof HTMLElement && item.matches(rowSelector));
    const source = rows.indexOf(row);
    if (source < 0 || rows.length < 2) return;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      clientY: event.clientY,
      rows,
      source,
      target: source,
      scroller: scrollContainer(row),
      onEscape: (keyEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        const drag = dragRef.current;
        resetDrag(drag);
        dragRef.current = undefined;
        if (drag && handle.hasPointerCapture(drag.pointerId)) handle.releasePointerCapture(drag.pointerId);
      }
    };
  };

  const move = (event: PointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.clientY = event.clientY;
    if (drag.frame === undefined) {
      if (Math.abs(drag.clientY - drag.startY) < 6) return;
      drag.rows[drag.source].dataset.exerciseDragging = "";
      window.addEventListener("keydown", drag.onEscape, true);
      const scroll = () => {
        const before = drag.scroller.scrollTop;
        scrollAtEdge(drag);
        if (drag.scroller.scrollTop !== before) previewDrop(drag);
        drag.frame = requestAnimationFrame(scroll);
      };
      drag.frame = requestAnimationFrame(scroll);
    }
    previewDrop(drag);
  };

  const stop = (event: PointerEvent<HTMLSpanElement>, drop = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drop && drag.frame !== undefined) {
      drag.clientY = event.clientY;
      previewDrop(drag);
    }
    resetDrag(drag);
    dragRef.current = undefined;
    if (drop && drag.target !== drag.source) onMove(drag.target);
  };

  return (
    <span
      className="exercise-drag-handle"
      title={locale === "vi" ? "Kéo để đổi thứ tự bài tập" : "Drag to reorder exercise"}
      aria-hidden="true"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={(event) => stop(event, true)}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(event) => event.preventDefault()}
    >
      <GripVertical size={21} />
    </span>
  );
}
