import type { DragEvent } from "react";

/**
 * Drags the whole block, not the handle it was grabbed by.
 *
 * A drag starts on the little `⠿`, because a card whose every pixel is draggable
 * cannot also be clicked, and its text cannot be selected. But the browser's default
 * drag image is the element the drag *started on* — so grabbing the handle left you
 * pushing a 20px grey square around the screen with no sense of what was moving.
 *
 * The offset is where inside the block the pointer actually was, so the image sits
 * under the cursor exactly where it was picked up rather than snapping its corner to
 * the pointer.
 *
 * The browser snapshots the element as it is at this instant. Any styling the drag
 * itself applies — the source going half-transparent — happens on the next render and
 * so does not end up baked into the image being dragged.
 */
export function dragWholeBlock(event: DragEvent, block: HTMLElement | null | undefined) {
  if (!block) return;
  const rect = block.getBoundingClientRect();
  event.dataTransfer.setDragImage(
    block,
    event.clientX - rect.left,
    event.clientY - rect.top,
  );
}
