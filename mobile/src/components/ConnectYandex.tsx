// Yandex Music connect sheet. Auto OAuth capture needs a native WebView; until
// then the user opens Yandex's sign-in page, authorizes, and pastes back the
// resulting redirect URL (which carries #access_token=…) or the bare token.
// setToken parses the token out of a pasted URL. Stored locally only.
import { useState } from 'react'
import { usePlayer } from '@renderer/store'
import { setToken, OAUTH_URL } from '../api/yandex'
import { useT } from '../i18n'
import { Portal } from './Portal'

export function ConnectYandex({ onClose }: { onClose: () => void }): JSX.Element {
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
    await usePlayer.getState().loadYmAuth()
    const me = usePlayer.getState().ymAuth
    if (!me) {
      setToken('')
      setErr(true)
      setBusy(false)
      return
    }
    await usePlayer.getState().loadMyWave()
    setBusy(false)
    onClose()
  }

  return (
    <Portal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grab" />
          <div className="sheet-title">{t('connectYM')}</div>
          <div className="set-hint" style={{ marginTop: 8 }}>
            {t('ymTokenHint')}
          </div>
          <a className="se-tap ghost" href={OAUTH_URL} target="_blank" rel="noreferrer" style={{ marginTop: 10, display: 'block', textAlign: 'center' }}>
            {t('ymGetToken')}
          </a>
          <textarea
            className="sc-token-input"
            placeholder="https://music.yandex.ru/…#access_token=… / AQAA…"
            value={token}
            onChange={(e) => setTok(e.target.value)}
            rows={2}
            autoCapitalize="off"
            autoCorrect="off"
          />
          {err && (
            <div className="set-hint" style={{ color: '#ff8a8a' }}>
              {t('ymTokenBad')}
            </div>
          )}
          <button
            className="se-tap"
            disabled={!token.trim() || busy}
            onClick={connect}
            style={{ marginTop: 12 }}
          >
            {busy ? '…' : t('connect')}
          </button>
        </div>
      </div>
    </Portal>
  )
}
