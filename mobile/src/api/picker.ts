// The one file dialog the app has on mobile.
//
// A hidden <input type="file"> is the only picker available to a WebView (there is
// no Capacitor file-open plugin in this project), and it is what gives us a real
// File with bytes we can copy into app storage. Everything that opens a dialog —
// track import (localfiles.ts), cover/background images and video wallpapers
// (shim.ts, wallpaper.ts) — goes through here so the cancel handling below exists
// once instead of three times.
//
// Detecting a cancel takes three signals, because a pending promise would leave
// the caller's spinner (or the store's `loading` flag) on forever:
//   • the `cancel` event — modern WebViews only,
//   • regaining window focus with no `change`,
//   • the user touching the app again.
// A selection always fires `change` as the dialog closes, i.e. before either
// fallback can run, so none of them can drop files the user actually picked.

/**
 * Open the system file dialog and resolve with what the user chose (empty when
 * they cancel). Must be called from a user gesture — every caller is a tap.
 */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    let settled = false
    const finish = (files: File[]): void => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pointerdown', onPointer)
      input.remove()
      resolve(files)
    }
    // The delay is for WebViews that restore focus just before firing `change`.
    function onFocus(): void {
      setTimeout(() => finish([]), 800)
    }
    function onPointer(): void {
      finish([])
    }
    input.addEventListener('change', () => finish(Array.from(input.files || [])))
    input.addEventListener('cancel', () => finish([]))
    document.body.appendChild(input)
    // Armed a beat late so the tap that opened the picker doesn't cancel it.
    setTimeout(() => {
      if (settled) return
      window.addEventListener('focus', onFocus)
      window.addEventListener('pointerdown', onPointer)
    }, 400)
    input.click()
  })
}

/** First picked file, or null when the dialog was dismissed. */
export async function pickFile(accept: string): Promise<File | null> {
  const [file] = await pickFiles(accept, false)
  return file ?? null
}
