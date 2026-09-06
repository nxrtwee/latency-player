import { usePlayer } from '../store'
import { useT } from '../i18n'
import { BackIcon } from './Icons'

/**
 * Go back one page. Renders nothing with an empty history, so it only ever shows
 * up where it has somewhere to go.
 *
 * Both shells use it, in the corner each has free: the desktop floats it over the
 * top-left of the centre panel (App.tsx), the phone puts it in the top bar's right
 * rail, where the left side is taken by the title (mobile/src/shell/TopBar.tsx).
 * `className` carries that difference; the styling of each lives with its shell.
 */
export function BackButton({ className = '' }: { className?: string }): JSX.Element | null {
  const canGoBack = usePlayer((s) => s.navBack.length > 0)
  const goBack = usePlayer((s) => s.goBack)
  const t = useT()

  if (!canGoBack) return null

  return (
    <button className={`nav-back ${className}`.trim()} onClick={goBack} title={t('back')} aria-label={t('back')}>
      <BackIcon size={18} />
    </button>
  )
}
