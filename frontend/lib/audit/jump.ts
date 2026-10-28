/** DOM ids shared between the panels and the parts of the screen they point at. */
export const ASSISTANT_INPUT_ID = "assistant-input";
export const itemRowId = (menuItemId: string) => `item-${menuItemId}`;

const FLASH_CLASSES = ["bg-warning-soft"];
const FLASH_MS = 1800;

/**
 * Scrolls to an item's row and flashes it. Returns false when the row is not on screen, for
 * example because a filter or search is hiding it, so the caller can say so.
 */
export function showItemRow(menuItemId: string): boolean {
  const row = document.getElementById(itemRowId(menuItemId));
  if (!row) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  row.classList.add(...FLASH_CLASSES);
  window.setTimeout(() => row.classList.remove(...FLASH_CLASSES), FLASH_MS);
  return true;
}

/** Puts the cursor in the assistant's message box, so the owner can answer straight away. */
export function focusAssistant(): void {
  document.getElementById(ASSISTANT_INPUT_ID)?.focus();
}
