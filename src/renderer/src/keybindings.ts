// Client-owned hotkeys — the catalog of bindable actions, the dispatcher that
// runs them, and the combo (de)serialisation helpers shared by the settings UI,
// the in-app DOM listener (App.tsx) and the Electron global-shortcut bridge.
//
// A "combo" is a stable, layout-independent string built from KeyboardEvent.code
// (+ ordered modifiers), e.g. `Ctrl+Shift+KeyL`, `Space`, `ArrowRight`, or a
// mouse button `Mouse3` / `Alt+Mouse4`. Storing codes (not `.key`) means a bind
// set on a US layout still fires on a Russian layout — the physical key matches.

import { usePlayer } from './store'

export type HotkeyCategory = 'playback' | 'seekvol' | 'library' | 'panels' | 'nav'

export type HotkeyActionId =
  | 'togglePlay'
  | 'next'
  | 'prev'
  | 'toggleShuffle'
  | 'cycleRepeat'
  | 'toggleAutopilot'
  | 'seekBack'
  | 'seekFwd'
  | 'volUp'
  | 'volDown'
  | 'muteToggle'
  | 'likeCurrent'
  | 'toggleLyrics'
  | 'toggleRightPanel'
  | 'toggleSidebar'
  | 'toggleSettings'
  | 'toggleEqualizer'
  | 'goHome'
  | 'goExplore'
  | 'goLikes'
  | 'goRecent'

export interface HotkeyAction {
  id: HotkeyActionId
  category: HotkeyCategory
  labelKey: string
}

// Catalog, grouped by category (the picker renders these under category headers).
export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: 'togglePlay', category: 'playback', labelKey: 'hkTogglePlay' },
  { id: 'next', category: 'playback', labelKey: 'hkNext' },
  { id: 'prev', category: 'playback', labelKey: 'hkPrev' },
  { id: 'toggleShuffle', category: 'playback', labelKey: 'hkShuffle' },
  { id: 'cycleRepeat', category: 'playback', labelKey: 'hkRepeat' },
  { id: 'toggleAutopilot', category: 'playback', labelKey: 'hkAutopilot' },

  { id: 'seekBack', category: 'seekvol', labelKey: 'hkSeekBack' },
  { id: 'seekFwd', category: 'seekvol', labelKey: 'hkSeekFwd' },
  { id: 'volUp', category: 'seekvol', labelKey: 'hkVolUp' },
  { id: 'volDown', category: 'seekvol', labelKey: 'hkVolDown' },
  { id: 'muteToggle', category: 'seekvol', labelKey: 'hkMute' },

  { id: 'likeCurrent', category: 'library', labelKey: 'hkLike' },

  { id: 'toggleLyrics', category: 'panels', labelKey: 'hkLyrics' },
  { id: 'toggleRightPanel', category: 'panels', labelKey: 'hkRightPanel' },
  { id: 'toggleSidebar', category: 'panels', labelKey: 'hkSidebar' },
  { id: 'toggleSettings', category: 'panels', labelKey: 'hkSettings' },
  { id: 'toggleEqualizer', category: 'panels', labelKey: 'hkEqualizer' },

  { id: 'goHome', category: 'nav', labelKey: 'hkGoHome' },
  { id: 'goExplore', category: 'nav', labelKey: 'hkGoExplore' },
  { id: 'goLikes', category: 'nav', labelKey: 'hkGoLikes' },
  { id: 'goRecent', category: 'nav', labelKey: 'hkGoRecent' }
]

export const HOTKEY_CATEGORIES: HotkeyCategory[] = [
  'playback',
  'seekvol',
  'library',
  'panels',
  'nav'
]

export const HOTKEY_CATEGORY_LABEL: Record<HotkeyCategory, string> = {
  playback: 'hkCatPlayback',
  seekvol: 'hkCatSeekVol',
  library: 'hkCatLibrary',
  panels: 'hkCatPanels',
  nav: 'hkCatNav'
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

// Mute is emulated (there is no mute state in the store): remember the level we
// silenced from so the same key restores it.
let mutePrevVolume: number | null = null

export function runHotkeyAction(id: HotkeyActionId): void {
  const s = usePlayer.getState()
  switch (id) {
    case 'togglePlay':
      s.togglePlay()
      break
    case 'next':
      s.next()
      break
    case 'prev':
      s.prev()
      break
    case 'toggleShuffle':
      s.toggleShuffle()
      break
    case 'cycleRepeat':
      s.cycleRepeat()
      break
    case 'toggleAutopilot':
      s.toggleAutopilot()
      break
    case 'seekBack':
      s.seek(clamp(s.positionSec - 5, 0, s.durationSec || s.positionSec))
      break
    case 'seekFwd':
      s.seek(clamp(s.positionSec + 5, 0, s.durationSec || s.positionSec + 5))
      break
    case 'volUp':
      s.setVolume(clamp(s.volume + 0.05, 0, 1))
      break
    case 'volDown':
      s.setVolume(clamp(s.volume - 0.05, 0, 1))
      break
    case 'muteToggle':
      if (s.volume > 0) {
        mutePrevVolume = s.volume
        s.setVolume(0)
      } else {
        s.setVolume(mutePrevVolume && mutePrevVolume > 0 ? mutePrevVolume : 0.5)
        mutePrevVolume = null
      }
      break
    case 'likeCurrent': {
      const tr = s.currentIndex >= 0 ? s.queue[s.currentIndex] : undefined
      if (tr) void s.toggleLike(tr)
      break
    }
    case 'toggleLyrics':
      s.toggleLyrics()
      break
    case 'toggleRightPanel':
      s.toggleRightPanel()
      break
    case 'toggleSidebar':
      s.toggleSidebar()
      break
    case 'toggleSettings':
      s.setSettingsOpen(!s.settingsOpen)
      break
    case 'toggleEqualizer':
      s.setEqOpen(!s.eqOpen)
      break
    case 'goHome':
      s.setSource('home')
      break
    case 'goExplore':
      s.setSource('explore')
      break
    case 'goLikes':
      s.setSource('likes')
      break
    case 'goRecent':
      s.setSource('recent')
      break
  }
}

// ---- combo (de)serialisation -------------------------------------------------

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight'
])

const MOD_TOKENS = ['Ctrl', 'Alt', 'Shift', 'Meta']

function isKeyboardEvent(e: KeyboardEvent | MouseEvent): e is KeyboardEvent {
  return typeof (e as KeyboardEvent).code === 'string'
}

function modifiers(e: KeyboardEvent | MouseEvent): string[] {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Meta')
  return mods
}

/**
 * Turn a keyboard/mouse event into a combo string, or null when the event is not
 * a bindable chord: a lone modifier key, or a bare left/right mouse click (those
 * stay reserved for the UI and context menu).
 */
export function eventToCombo(e: KeyboardEvent | MouseEvent): string | null {
  const mods = modifiers(e)
  if (isKeyboardEvent(e)) {
    const code = e.code
    if (!code || MODIFIER_CODES.has(code)) return null
    return [...mods, code].join('+')
  }
  const btn = e.button
  if ((btn === 0 || btn === 2) && mods.length === 0) return null
  return [...mods, `Mouse${btn}`].join('+')
}

const MOUSE_LABEL: Record<string, string> = {
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  Mouse3: 'Mouse 4',
  Mouse4: 'Mouse 5'
}

const ARROW_LABEL: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓'
}

function labelForKey(code: string): string {
  if (code in ARROW_LABEL) return ARROW_LABEL[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6)
  if (code === 'Meta') return 'Win'
  return code
}

/** Human-readable rendering of a combo for the settings chip. */
export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((p) => {
      if (p === 'Meta') return 'Win'
      if (MOD_TOKENS.includes(p)) return p
      if (p in MOUSE_LABEL) return MOUSE_LABEL[p]
      if (p.startsWith('Mouse')) return 'Mouse ' + p.slice(5)
      return labelForKey(p)
    })
    .join(' + ')
}

const KEY_TO_ACCEL: Record<string, string> = {
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`'
}

function codeToAccelKey(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  if (code in KEY_TO_ACCEL) return KEY_TO_ACCEL[code]
  return null
}

/**
 * Convert a combo to an Electron accelerator for global registration, or null
 * when it cannot be a global shortcut (mouse buttons, or a key with no
 * accelerator mapping). Such combos still work in-app via the DOM listener.
 */
export function comboToAccelerator(combo: string): string | null {
  const parts = combo.split('+')
  if (parts.some((p) => p.startsWith('Mouse'))) return null
  const out: string[] = []
  for (const p of parts) {
    if (p === 'Ctrl') out.push('Control')
    else if (p === 'Alt') out.push('Alt')
    else if (p === 'Shift') out.push('Shift')
    else if (p === 'Meta') out.push('Super')
    else {
      const k = codeToAccelKey(p)
      if (!k) return null
      out.push(k)
    }
  }
  return out.length ? out.join('+') : null
}

/** True for a keyboard combo with no modifier — globally hijacks that key. */
export function isModifierless(combo: string): boolean {
  const parts = combo.split('+')
  if (parts.some((p) => p.startsWith('Mouse'))) return false
  return !parts.some((p) => MOD_TOKENS.includes(p))
}

/**
 * True when a combo should be registered as an OS-global shortcut. Only combos
 * that (a) map to an accelerator and (b) carry at least one modifier qualify —
 * a bare key registered globally would be hijacked while typing in ANY app
 * (including other programs), which we never want. Mouse buttons and modifierless
 * keys fall back to the in-app DOM listener, which stands down inside text fields.
 */
export function isGlobalCombo(combo: string): boolean {
  return comboToAccelerator(combo) !== null && !isModifierless(combo)
}

// While the settings UI is capturing a new binding, the global DOM dispatcher
// must stand down so the pressed key is recorded, not acted on.
let _captureActive = false
export function setCaptureActive(v: boolean): void {
  _captureActive = v
}
export function isCaptureActive(): boolean {
  return _captureActive
}
