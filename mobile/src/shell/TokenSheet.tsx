import { useEffect, useRef, useState } from 'react'
import { useT } from '@renderer/i18n'
import { CloseIcon } from '@renderer/components/Icons'
import { OAUTH_URL } from '../api/yandex'
import { setTokenPromptHandler, type TokenRequest } from '../api/tokenRequest'

/**
 * The one screen the desktop genuinely doesn't have: paste-a-token sign-in.
 *
 * Desktop opens an Electron OAuth window; a phone can't (auto-capture needs a
 * native WebView), so the shim's `scLogin` / `ymLogin` route through
 * api/tokenRequest.ts and this sheet collects the token. Everything else — the
 * connect button, the spinner, the resulting `scAuth` — is the shared
 * ProfilePage, untouched.
 *
 * It wears the desktop modal DOM (`.modal-backdrop > .modal > .modal-head +
 * .modal-body`, `.set-block` / `.set-label` / `.set-hint` / `.set-input` /
 * `.sync-btn`) so it inherits the nextgen panel, radius and animation instead of
 * inventing a phone-only sheet. portrait.css already re-flows `.modal` to the
 * phone width.
 */
export function TokenSheet(): JSX.Element | null {
  const t = useT()
  const [req, setReq] = useState<TokenRequest | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState(false)
  // Held in a ref so the unmount cleanup can cancel a request in flight without
  // re-registering the handler on every state change.
  const pending = useRef<TokenRequest | null>(null)

  useEffect(() => {
    setTokenPromptHandler((r) => {
      pending.current = r
      setReq(r)
      setText('')
      setBad(false)
      setBusy(false)
    })
    return () => {
      setTokenPromptHandler(null)
      pending.current?.resolve(null)
      pending.current = null
    }
  }, [])

  const settle = (value: string | null): void => {
    const r = pending.current
    pending.current = null
    setReq(null)
    r?.resolve(value)
  }

  if (!req) return null

  const isSc = req.service === 'sc'

  const submit = async (): Promise<void> => {
    const raw = text.trim()
    if (!raw || busy) return
    setBusy(true)
    setBad(false)
    const ok = await req.verify(raw).catch(() => false)
    if (!ok) {
      // Stay open: a mistyped paste shouldn't cost the whole flow.
      setBusy(false)
      setBad(true)
      return
    }
    settle(raw)
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && settle(null)}>
      <div className="modal m-token" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t(isSc ? 'pasteTokenSc' : 'pasteTokenYm')}</h2>
          <button className="icon-btn" onClick={() => settle(null)} title="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          <section className="set-block">
            <div className="set-label">{isSc ? 'SoundCloud' : t('yandexMusic')}</div>
            <div className="set-hint">{t(isSc ? 'scTokenHint' : 'ymTokenHint')}</div>
            {/* Yandex's implicit flow hands the token back in a redirect URL, so
                the sheet can send the user straight there; SoundCloud has no
                equivalent public page. */}
            {!isSc && (
              <a className="sync-btn ghost" href={OAUTH_URL} target="_blank" rel="noreferrer">
                {t('ymGetToken')}
              </a>
            )}
            <textarea
              className="set-input m-token-input"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={isSc ? 'OAuth 2-…' : 'https://…#access_token=… / AQAA…'}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {bad && <div className="set-hint m-token-bad">{t('tokenBad')}</div>}
            <button
              className="sync-btn primary"
              disabled={!text.trim() || busy}
              onClick={() => void submit()}
            >
              {busy ? t('connecting') : t('connect')}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
