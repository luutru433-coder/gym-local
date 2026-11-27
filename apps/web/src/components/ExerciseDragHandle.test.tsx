import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExerciseDragHandle } from "./ExerciseDragHandle";

const title = "Drag to reorder exercise";

function arrange() {
  const onMove = vi.fn();
  render(
    <ol style={{ overflowY: "auto" }}>
      {[0, 1, 2].map((index) => (
        <li key={index} data-exercise-reorder-item>
          <ExerciseDragHandle locale="en" onMove={(target) => onMove(index, target)} />
        </li>
      ))}
      <li>Not an exercise</li>
    </ol>
  );
  const rows = screen.getAllByRole("listitem").slice(0, 3);
  const scroller = screen.getByRole("list");
  rows.forEach((row, index) => vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 120 + index * 80 - scroller.scrollTop, 300, 70)));
  const handles = screen.getAllByTitle(title);
  handles.forEach((handle) => { handle.setPointerCapture = vi.fn(); });
  return { handles, rows, onMove, scroller };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("exercise drag handle", () => {
  it.each([
    { source: 0, target: 2, fromY: 145, toY: 323, edge: "after", pointerType: "touch" },
    { source: 2, target: 0, fromY: 305, toY: 139, edge: "before", pointerType: "mouse" }
  ])("moves $source to $target on $pointerType release", ({ source, target, fromY, toY, edge, pointerType }) => {
    const { handles, rows, onMove } = arrange();
    const pointer = { pointerId: 1, isPrimary: true, pointerType };
    fireEvent.pointerDown(handles[source], { ...pointer, clientY: fromY });
    expect(handles[source].setPointerCapture).toHaveBeenCalledWith(1);
    fireEvent.pointerMove(handles[source], { ...pointer, clientY: toY });
    expect(rows[source].dataset.exerciseDragging).toBe("");
    expect(rows[target].dataset.exerciseDrop).toBe(edge);
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.pointerUp(handles[source], { ...pointer, clientY: toY });
    expect(onMove).toHaveBeenCalledExactlyOnceWith(source, target);
    expect(rows[source].dataset.exerciseDragging).toBeUndefined();
    expect(rows[target].dataset.exerciseDrop).toBeUndefined();
  });

  it("does not move for a tap, a drop at the original position, or a cancelled drag", () => {
    const { handles: [handle], rows, onMove } = arrange();
    const pointer = { pointerId: 1, isPrimary: true, pointerType: "touch" };
    fireEvent.pointerDown(handle, { ...pointer, clientY: 145 });
    fireEvent.pointerUp(handle, { ...pointer, clientY: 148 });
    fireEvent.pointerDown(handle, { ...pointer, clientY: 145 });
    fireEvent.pointerMove(handle, { ...pointer, clientY: 320 });
    fireEvent.pointerUp(handle, { ...pointer, clientY: 145 });
    fireEvent.pointerDown(handle, { ...pointer, clientY: 145 });
    fireEvent.pointerMove(handle, { ...pointer, clientY: 320 });
    fireEvent.pointerCancel(handle, pointer);
    expect(onMove).not.toHaveBeenCalled();
    expect(rows[0].dataset.exerciseDragging).toBeUndefined();
    expect(rows[2].dataset.exerciseDrop).toBeUndefined();
  });

  it("scrolls and advances the drop target while a touch stays near the scroll container edge", () => {
    vi.useFakeTimers();
    const { handles: [handle], rows, onMove, scroller } = arrange();
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 300, 190));
    const scrollBy = vi.fn((options?: ScrollToOptions | number, y?: number) => {
      scroller.scrollTop += (typeof options === "number" ? y : options?.top) ?? 0;
    });
    scroller.scrollBy = scrollBy;
    const pointer = { pointerId: 1, isPrimary: true, pointerType: "touch" };
    fireEvent.pointerDown(handle, { ...pointer, clientY: 145 });
    fireEvent.pointerMove(handle, { ...pointer, clientY: 280 });
    expect(rows[1].dataset.exerciseDrop).toBe("after");
    for (let frame = 0; frame < 3; frame++) vi.advanceTimersToNextFrame();
    expect(scrollBy).toHaveBeenCalledWith({ top: expect.any(Number), behavior: "instant" });
    expect(rows[1].dataset.exerciseDrop).toBeUndefined();
    expect(rows[2].dataset.exerciseDrop).toBe("after");
    fireEvent.pointerUp(handle, { ...pointer, clientY: 280 });
    expect(onMove).toHaveBeenCalledExactlyOnceWith(0, 2);
    scrollBy.mockClear();
    vi.advanceTimersToNextFrame();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
