/**
 * Allowed key codes for `input keyevent`. We deliberately enumerate a
 * conservative set instead of accepting arbitrary codes — keeps the surface
 * predictable for the LLM and avoids exotic events.
 */
export type AllowedKeyCode =
  | 'BACK'
  | 'HOME'
  | 'MENU'
  | 'APP_SWITCH'
  | 'POWER'
  | 'ENTER'
  | 'TAB'
  | 'DEL'
  | 'FORWARD_DEL'
  | 'ESCAPE'
  | 'DPAD_UP'
  | 'DPAD_DOWN'
  | 'DPAD_LEFT'
  | 'DPAD_RIGHT'
  | 'DPAD_CENTER'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'
  | 'VOLUME_MUTE'
  | 'PAGE_UP'
  | 'PAGE_DOWN'
  | 'MOVE_HOME'
  | 'MOVE_END'
  | 'SEARCH';

export const ALLOWED_KEY_CODES: readonly AllowedKeyCode[] = [
  'BACK', 'HOME', 'MENU', 'APP_SWITCH', 'POWER',
  'ENTER', 'TAB', 'DEL', 'FORWARD_DEL', 'ESCAPE',
  'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT', 'DPAD_CENTER',
  'VOLUME_UP', 'VOLUME_DOWN', 'VOLUME_MUTE',
  'PAGE_UP', 'PAGE_DOWN', 'MOVE_HOME', 'MOVE_END',
  'SEARCH',
];

export interface InputResult {
  readonly action: 'tap' | 'text' | 'key' | 'swipe';
  readonly serial?: string;
}
