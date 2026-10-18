// The menus: which items each screen shows, where their hit regions are, and
// how the keyboard, the mouse, and touch move between and confirm them
// (`specs/ui.md`).

import type { PointerSample, UpdateApi } from "@clockwyrks/simple-2d";
import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { CaromState, MenuRect, Screen, View } from "./game";
import { returnToTitle, startMatch } from "./world";

/** The how-to screen's single item, which returns to the title. */
export const HOWTO_ITEMS = ["BACK"] as const;

/** The items the menu on `screen` shows, or none on a screen with no menu. */
export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return HOWTO_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    case "countdown":
    case "playing":
      return [];
  }
}

const ITEM_W = 360;
const ITEM_H = 54;
const ITEM_GAP = 14;

/** Where each menu's first item's top edge sits. */
const MENU_TOP: Readonly<Record<Screen, number>> = {
  title: 372,
  howto: 610,
  paused: 300,
  matchover: 420,
  countdown: 0,
  playing: 0,
};

/** The hit region of item `index` on `screen`'s menu, or `null` if it has none. */
export function menuItemRect(screen: Screen, index: number): MenuRect | null {
  const count = menuItems(screen).length;
  if (!Number.isInteger(index) || index < 0 || index >= count) return null;
  return {
    x: FIELD_CX - ITEM_W / 2,
    y: MENU_TOP[screen] + index * (ITEM_H + ITEM_GAP),
    w: ITEM_W,
    h: ITEM_H,
  };
}

/** The item whose region holds the point, or `null` when none does. */
export function itemAt(screen: Screen, x: number, y: number): number | null {
  const count = menuItems(screen).length;
  for (let i = 0; i < count; i++) {
    const r = menuItemRect(screen, i);
    if (r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return null;
}

function wrap(index: number, count: number): number {
  return ((index % count) + count) % count;
}

/** Confirms the item at `menuIndex` on the current menu screen. */
export function confirmItem(state: View): CaromState {
  const index = state.menuIndex;
  switch (state.screen) {
    case "title": {
      const chosen = { ...state, titleIndex: index };
      if (index === 0) return startMatch(chosen, "solo");
      if (index === 1) return startMatch(chosen, "versus");
      if (index === 2) return { ...chosen, screen: "howto", menuIndex: 0 };
      return chosen;
    }
    case "howto":
      return returnToTitle(state);
    case "paused":
      if (index === 0) return { ...state, screen: state.resumeScreen };
      if (index === 1) return startMatch(state, state.mode);
      if (index === 2) return returnToTitle(state);
      return { ...state };
    case "matchover":
      if (index === 0) return startMatch(state, state.mode);
      if (index === 1) return returnToTitle(state);
      return { ...state };
    case "countdown":
    case "playing":
      return { ...state };
  }
}

type Input = UpdateApi["input"];

function upEdge(input: Input): boolean {
  // Both are read so neither edge lingers into the menu's next read.
  const p1 = input.pressed("p1-up");
  const p2 = input.pressed("p2-up");
  return p1 || p2;
}

function downEdge(input: Input): boolean {
  const p1 = input.pressed("p1-down");
  const p2 = input.pressed("p2-down");
  return p1 || p2;
}

/**
 * The keyboard's effect on a menu screen. Up is applied before down and
 * movement before `confirm`, so a frame carrying several edges does the first
 * of them alone. Returns the state and whether the keyboard confirmed.
 */
export function menuKeyboard(
  state: View,
  input: Input,
): { state: CaromState; confirmed: boolean } {
  const count = menuItems(state.screen).length;
  const up = upEdge(input);
  const down = downEdge(input);
  const confirm = input.pressed("confirm");
  const back = input.pressed("back");

  if (up) {
    return {
      state: { ...state, menuIndex: wrap(state.menuIndex - 1, count) },
      confirmed: false,
    };
  }
  if (down) {
    return {
      state: { ...state, menuIndex: wrap(state.menuIndex + 1, count) },
      confirmed: false,
    };
  }
  if (confirm) return { state: confirmItem(state), confirmed: true };
  if (back && (state.screen === "howto" || state.screen === "matchover")) {
    return { state: returnToTitle(state), confirmed: true };
  }
  return { state: { ...state }, confirmed: false };
}

function isPrimaryButton(sample: PointerSample): boolean {
  return sample.button === null || sample.button === "primary";
}

/**
 * The pointer's and touch contacts' effect on a menu screen, applied after the
 * keyboard's. Every sample over an item highlights it; a press and its release
 * inside one item's region confirm it. Only the primary pointer is followed,
 * which is the mouse or the first finger down.
 */
export function menuPointer(
  state: View,
  samples: readonly PointerSample[],
): CaromState {
  const screen = state.screen;
  let menuIndex = state.menuIndex;
  let press =
    state.press !== null && state.press.screen === screen ? state.press : null;

  for (const sample of samples) {
    if (!sample.primary) continue;
    const item = itemAt(screen, sample.x, sample.y);
    if (item !== null) menuIndex = item;

    if (sample.type === "down" && isPrimaryButton(sample)) {
      press = { id: sample.id, screen, item };
    } else if (sample.type === "up" && isPrimaryButton(sample)) {
      const confirms =
        press !== null &&
        press.id === sample.id &&
        press.item !== null &&
        press.item === item;
      press = null;
      if (confirms) {
        return confirmItem({ ...state, menuIndex, press: null });
      }
    }
  }
  return { ...state, menuIndex, press };
}
