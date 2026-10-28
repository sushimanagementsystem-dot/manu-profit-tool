import type { Operation, ResultItem } from "@/lib/api/types";

/** The figures a client can change in the results table. */
export type EditField = "name" | "unitsSold" | "grossPrice" | "cost";

export type Validation = { ok: true; value: string } | { ok: false; message: string };

const MAX_NAME = 200;
// The API keeps four decimals; asking for no more here means it never rejects what we accept.
const AMOUNT = /^\d{1,10}(\.\d{1,4})?$/;

/** "1,580" and "1 580" read as 1580; "12,5" is ambiguous, so it is refused rather than guessed. */
function normaliseNumber(raw: string): string | null {
  const text = raw.trim().replace(/^[€$£]\s*/, "");
  if (/^\d{1,3}([ ,]\d{3})+(\.\d+)?$/.test(text)) return text.replace(/[ ,]/g, "");
  return text;
}

/** Checks what the client typed and returns the value in the form the API takes. */
export function validateEdit(field: EditField, raw: string): Validation {
  if (field === "name") {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) return { ok: false, message: "Enter a name." };
    if (name.length > MAX_NAME) return { ok: false, message: `Keep it under ${MAX_NAME} characters.` };
    return { ok: true, value: name };
  }

  const text = normaliseNumber(raw);
  if (field === "cost" && (text === null || text === "")) return { ok: true, value: "" };
  if (!text) return { ok: false, message: "Enter a number." };
  if (/,/.test(text)) return { ok: false, message: "Use a dot for decimals, for example 12.50." };
  if (!AMOUNT.test(text)) {
    return { ok: false, message: "Enter a number with up to 4 decimals, no letters or minus sign." };
  }
  if (field === "grossPrice" && Number(text) === 0) {
    return { ok: false, message: "A selling price must be more than zero." };
  }
  // Normalised so "012.50" is compared and sent as 12.5.
  return { ok: true, value: Number(text).toString() };
}

/** The value an editor starts from: what is on screen, without formatting. */
export function startValue(field: EditField, item: ResultItem): string {
  switch (field) {
    case "name":
      return item.name;
    case "unitsSold":
      return trimZeros(item.unitsSold);
    case "grossPrice":
      return trimZeros(item.grossPrice);
    case "cost":
      return item.costSource === "MANUAL" ? trimZeros(item.costPerPortion.value) : "";
  }
}

/** "320.0000" → "320"; the API returns four decimals the client never typed. */
export function trimZeros(value: string | null): string {
  if (value === null) return "";
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

const sameNumber = (a: string, b: string) => Number(a) === Number(b);

/**
 * The operations for one edit, or null when nothing would change (so no revision is created for
 * a click that confirmed the value already there).
 */
export function buildOperations(field: EditField, item: ResultItem, value: string): Operation[] | null {
  const id = item.menuItemId;
  switch (field) {
    case "name":
      return value === item.name ? null : [{ op: "RENAME_MENU_ITEM", menuItemId: id, name: value }];
    case "unitsSold":
      return item.unitsSold !== null && sameNumber(item.unitsSold, value)
        ? null
        : [{ op: "SET_UNITS_SOLD", menuItemId: id, quantity: value }];
    case "grossPrice":
      return item.grossPrice !== null && sameNumber(item.grossPrice, value)
        ? null
        : [{ op: "SET_SELLING_PRICE", menuItemId: id, grossPrice: value }];
    case "cost": {
      if (value === "") {
        // Clearing only means something when a hand-entered cost exists to clear.
        return item.costSource === "MANUAL" ? [{ op: "SET_ITEM_COST", menuItemId: id, cost: null }] : null;
      }
      const unchanged =
        item.costSource === "MANUAL" && item.costPerPortion.value !== null && sameNumber(item.costPerPortion.value, value);
      return unchanged ? null : [{ op: "SET_ITEM_COST", menuItemId: id, cost: value }];
    }
  }
}

export const FIELD_LABELS: Record<EditField, string> = {
  name: "name",
  unitsSold: "units sold",
  grossPrice: "menu price",
  cost: "cost per portion",
};
