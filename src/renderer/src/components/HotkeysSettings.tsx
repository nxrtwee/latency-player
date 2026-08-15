import { useEffect, useMemo, useState } from 'react'
import { usePlayer } from '../store'
import { useT } from '../i18n'
import { PlusIcon, CloseIcon } from './Icons'
import {
  HOTKEY_ACTIONS,
  HOTKEY_CATEGORIES,
  HOTKEY_CATEGORY_LABEL,
  eventToCombo,
  formatCombo,
  isModifierless,
  setCaptureActive,
  type HotkeyActionId
} from '../keybindings'

function labelKeyFor(id: string): string {
  return HOTKEY_ACTIONS.find((a) => a.id === id)?.labelKey ?? id
}

/**
 * Hotkeys settings — the Discord-style binder. Shows the current bindings, and a
 * "+" that opens an action picker; choosing an action enters capture mode where
 * the next key / mouse button becomes its binding. Rendered only on desktop
 * (Settings gates on window.api.setGlobalHotkeys).
 */
export function HotkeysSettings(): JSX.Element {
  const t = useT()
  const keybindings = usePlayer((s) => s.keybindings)
  const setKeybinding = usePlayer((s) => s.setKeybinding)
  const clearKeybinding = usePlayer((s) => s.clearKeybinding)

  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  const [capturingId, setCapturingId] = useState<HotkeyActionId | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [warn, setWarn] = useState(false)

  const bound = HOTKEY_ACTIONS.filter((a) => keybindings[a.id])

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    return HOTKEY_CATEGORIES.map((cat) => ({
      cat,
      actions: HOTKEY_ACTIONS.filter(
        (a) => a.category === cat && (!q || t(a.labelKey).toLowerCase().includes(q))
      )
    })).filter((g) => g.actions.length > 0)
  }, [search, t])

  // Capture mode: the next key / mouse button becomes the binding. Listens in the
  // capture phase and swallows the event so it neither triggers a hotkey nor
  // leaks into the UI. Esc cancels; a lone modifier / bare click keeps waiting.
  useEffect(() => {
    if (!capturingId) return
    setCaptureActive(true)
    const commit = (combo: string): void => {
      const kb = usePlayer.getState().keybindings
      const prevOwner = Object.keys(kb).find((a) => kb[a] === combo && a !== capturingId)
      setKeybinding(capturingId, combo)
      setWarn(isModifierless(combo))
      setNote(prevOwner ? `${t('hotkeyReassigned')} “${t(labelKeyFor(prevOwner))}”` : null)
      setCapturingId(null)
    }
    const cancel = (): void => {
      setCapturingId(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.code === 'Escape') return cancel()
      const combo = eventToCombo(e)
      if (combo) commit(combo)
    }
    const onMouse = (e: MouseEvent): void => {
      const combo = eventToCombo(e)
      if (!combo) return // bare left/right click — let the UI handle it
      e.preventDefault()
      e.stopImmediatePropagation()
      commit(combo)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('mousedown', onMouse, { capture: true })
    return () => {
      setCaptureActive(false)
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('mousedown', onMouse, { capture: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturingId])

  const startPick = (): void => {
    setSearch('')
    setNote(null)
    setWarn(false)
    setPicking(true)
  }

  return (
    <div className="hotkey-list">
      {bound.length === 0 && <div className="set-row-sub">{t('noHotkeys')}</div>}

      {bound.map((a) => (
        <div key={a.id} className="hotkey-row">
          <span className="hotkey-row-label">{t(a.labelKey)}</span>
          <span className="kbd">{formatCombo(keybindings[a.id])}</span>
          <button
            className="icon-btn"
            title={t('clearBtn')}
            onClick={() => clearKeybinding(a.id)}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      ))}

      {note && <div className="hotkey-note">{note}</div>}
      {warn && <div className="hotkey-warn">{t('hotkeyGlobalWarn')}</div>}

      <button className="sync-btn ghost hotkey-add" onClick={startPick}>
        <PlusIcon size={15} />
        <span>{t('addHotkey')}</span>
      </button>

      {picking && (
        <div className="hotkey-picker-backdrop" onClick={() => setPicking(false)}>
          <div className="hotkey-picker" onClick={(e) => e.stopPropagation()}>
            <div className="hotkey-picker-head">
              <span>{t('pickAction')}</span>
              <button className="icon-btn" title={t('clearBtn')} onClick={() => setPicking(false)}>
                <CloseIcon size={14} />
              </button>
            </div>
            <input
              className="set-input"
              autoFocus
              placeholder={t('searchAction')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="hotkey-picker-body">
              {grouped.map((g) => (
                <div key={g.cat} className="hotkey-picker-group">
                  <div className="hotkey-picker-cat">{t(HOTKEY_CATEGORY_LABEL[g.cat])}</div>
                  {g.actions.map((a) => (
                    <button
                      key={a.id}
                      className="hotkey-picker-item"
                      onClick={() => {
                        setPicking(false)
                        setCapturingId(a.id)
                      }}
                    >
                      <span>{t(a.labelKey)}</span>
                      {keybindings[a.id] && (
                        <span className="kbd sm">{formatCombo(keybindings[a.id])}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {capturingId && (
        <div className="hotkey-capture-backdrop">
          <div className="hotkey-capture">
            <div className="hotkey-capture-title">{t('pressKeyPrompt')}</div>
            <div className="hotkey-capture-sub">{t('pressKeyCancel')}</div>
            <button className="sync-btn ghost" onClick={() => setCapturingId(null)}>
              {t('pressKeyCancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
