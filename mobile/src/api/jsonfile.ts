// The JSON-file transport for the cross-platform likes sync (shared/sync.ts).
//
// The desktop half is two Electron dialogs (`dialog:saveJson` / `dialog:openJson`).
// A WebView has neither, so:
//   • Export writes the text through @capacitor/filesystem into a directory the
//     user can actually reach — Documents first (iOS: visible in Files.app under
//     "Latency", thanks to UIFileSharingEnabled; Android: the public Documents
//     folder), then the app's external files dir, then private app storage. The
//     returned string is where it landed, so the UI can say it out loud instead of
//     leaving the user to guess.
//   • Import reuses the one picker the app has (picker.ts) and reads the File as
//     text — no plugin needed, and it can reach iCloud/Drive/Downloads.
//
// In a desktop browser (dev preview) there is no Filesystem plugin, so the export
// falls back to a plain anchor download.
import { blobToBase64, fsPlugin, isNative } from './capfs'
import { pickFile } from './picker'

/** Capacitor Directory values, in the order we try them for a user-visible write. */
const WRITE_DIRS = [
  'DOCUMENTS', // iOS: app Documents (Files.app) — Android: public Documents
  'EXTERNAL', // Android: /Android/data/<pkg>/files — reachable over USB/MTP
  'DATA' // last resort: private app storage (still readable by an import here)
]

function anchorDownload(name: string, text: string): string {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked late: Safari needs the URL to outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return name
}

/**
 * Write `text` to `name` and resolve with a human-readable location (null only if
 * every directory refused). Mirrors the desktop `saveJsonFile`, whose null means
 * "the user cancelled the save dialog" — there is no dialog here, so a phone
 * export cannot be cancelled, only fail.
 */
export async function saveJsonFile(name: string, text: string): Promise<string | null> {
  const plugin = fsPlugin()
  if (!isNative() || !plugin) return anchorDownload(name, text)
  // writeFile without `encoding` takes base64 bytes, so the file on disk is real
  // UTF-8 JSON rather than a base64 blob (see capfs.ts).
  const data = await blobToBase64(new Blob([text], { type: 'application/json' }))
  for (const directory of WRITE_DIRS) {
    try {
      const { uri } = await plugin.writeFile({ path: name, directory, data, recursive: true })
      // A file:// URI is noise in a settings row; the tail is what the user needs
      // to find it. Documents/EXTERNAL land where a file manager can see them.
      return decodeURIComponent(uri).replace(/^file:\/\//, '')
    } catch {
      /* directory unavailable on this OS version — try the next */
    }
  }
  return null
}

/** Open the picker and read the chosen file as text (null when dismissed). */
export async function openJsonFile(): Promise<{ name: string; text: string } | null> {
  // Both the MIME type and the extension: iOS matches UTTypes, some Android
  // pickers only match the suffix, and a file arriving from a cloud provider can
  // carry no type at all.
  const file = await pickFile('application/json,.json')
  if (!file) return null
  return { name: file.name, text: await file.text() }
}
