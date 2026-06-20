// SoundCloud connect sheet. Auto OAuth capture needs a native WKWebView
// (ios-notes §6); until then the user pastes their web-session OAuth token,
// which unlocks the same authenticated flows as desktop (real mixes, your
// likes). Token is stored locally only.
import { useState } from 'react'
import { usePlayer } from '@renderer/store'
import { setToken } from '../api/soundcloud'
import { useT } from '../i18n'
import { Portal } from './Portal'

export function ConnectSC({ onClose }: { onClose: () => void }): JSX.Element {
  const t = useT()
  const [token, setTok] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const connect = async (): Promise<void> => {
    const tk = token.trim()
    if (!tk) return
    setBusy(true)
    setErr(false)
    setToken(tk)
    const me = await usePlayer.getState().loadScAuth().then(() => usePlayer.getState().scAuth)
    if (!me) {
      setToken('')
      setErr(true)
      setBusy(false)
      return
    }
    await usePlayer.getState().generateMixes(true)
    setBusy(false)
    onClose()
  }

  return (
    <Portal>
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-title">{t('connectSC')}</div>
        <div className="set-hint" style={{ marginTop: 8 }}>{t('scTokenHint')}</div>
        <textarea
          className="sc-token-input"
          placeholder="OAuth 2-…"
          value={token}
          onChange={(e) => setTok(e.target.value)}
          rows={2}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {err && <div className="set-hint" style={{ color: '#ff8a8a' }}>{t('scTokenBad')}</div>}
        <button className="se-tap" disabled={!token.trim() || busy} onClick={connect} style={{ marginTop: 12 }}>
          {busy ? '…' : t('connect')}
        </button>
      </div>
    </div>
    </Portal>
  )
}
