// Video wallpapers on mobile (`window.api.pickVideo`).
//
// The store treats a background as a plain URL string it can put in `<video src>`
// and remember in localStorage (`lp.bg`, `lp.karaokeBgs`, `lp.karaokeBgAll`), so
// whatever we hand back has to survive a reload. That rules out both of the easy
// answers: a `blob:` URL dies with the page, and a `data:` URL of a video is tens
// of megabytes of base64 in a ~5 MB localStorage.
//
// So on a native build the file is copied into Directory.Data/bg and the URL we
// return is Capacitor's `convertFileSrc` form — served by the app's own local
// server, which means the WebView streams it with range requests instead of
// holding the whole clip in memory, and the string keeps working after a restart.
// (Audio deliberately does the opposite — see offline.ts — because it also feeds
// the Web Audio analyser, which needs a same-origin blob.)
//
// In a desktop browser there is no Filesystem plugin, so the pick falls back to a
// session-only blob: URL: the wallpaper works until the page reloads. Same
// degradation as an imported track without its bytes.
import { blobToBase64, convertSrc, DATA_DIR, fsPlugin, isNative } from './capfs'
import { md5 } from './md5'
import { pickFile } from './picker'

const FOLDER = 'bg'
/** Paths of the copies we own, so a replaced wallpaper doesn't leak its file. */
const INDEX_KEY = 'lp.m.bgfiles'
// Where the store keeps background URLs. A copy is deleted only when none of
// these mentions it any more.
const REF_KEYS = ['lp.bg', 'lp.karaokeBgs', 'lp.karaokeBgAll']
/**
 * Above this the base64 round-trip through the bridge (roughly 1.4x the file in
 * memory, twice over) is a real out-of-memory risk on a cheap phone, and a
 * wallpaper is not worth crashing the app for. Such a pick still works for the
 * session — it just doesn't persist.
 */
const MAX_PERSIST_BYTES = 64 * 1024 * 1024

interface BgFile {
  path: string
  url: string
}

function readIndex(): BgFile[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    return raw ? (JSON.parse(raw) as BgFile[]) : []
  } catch {
    return []
  }
}
function writeIndex(list: BgFile[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list))
  } catch {
    /* non-fatal: worst case an old copy is never collected */
  }
}

/** Extension of a filename, lowercased, without the dot ('mp4' by default). */
function extOf(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : 'mp4'
}

/**
 * Delete the copies nothing points at any more. Runs on every pick rather than on
 * "replace", because one file can be the app background and any number of
 * per-track karaoke backgrounds at the same time — the only honest test is
 * whether its URL still appears in the store's own keys.
 *
 * The wallpaper being replaced right now is still in `lp.bg` (the store writes the
 * new one only after this resolves), so it survives one more pick and is collected
 * by the next — two copies on disk at worst, and never a live one deleted.
 */
async function collect(keep: string): Promise<BgFile[]> {
  const index = readIndex()
  if (!index.length) return index
  const refs = REF_KEYS.map((k) => localStorage.getItem(k) || '').join('\n')
  const plugin = fsPlugin()
  const alive: BgFile[] = []
  for (const entry of index) {
    if (entry.url === keep || refs.includes(entry.url)) {
      alive.push(entry)
      continue
    }
    try {
      await plugin?.deleteFile({ path: entry.path, directory: DATA_DIR })
    } catch {
      /* already gone */
    }
  }
  return alive
}

/**
 * Copy a picked video into app storage and return the URL to play it from, or
 * undefined when there is no native filesystem / the write failed.
 */
async function persist(file: File): Promise<string | undefined> {
  const plugin = fsPlugin()
  const convert = convertSrc()
  if (!isNative() || !plugin || !convert) return undefined
  if (file.size > MAX_PERSIST_BYTES) return undefined
  // Named after the bytes, not the filename: two picks of the same clip reuse one
  // copy, and the name is filesystem-safe whatever the source was called.
  const path = `${FOLDER}/${md5(`${file.name}:${file.size}:${file.lastModified}`)}.${extOf(file.name)}`
  try {
    try {
      await plugin.mkdir({ path: FOLDER, directory: DATA_DIR, recursive: true })
    } catch {
      /* already exists */
    }
    await plugin.writeFile({
      path,
      directory: DATA_DIR,
      data: await blobToBase64(file),
      recursive: true
    })
    const st = await plugin.stat({ path, directory: DATA_DIR })
    if (!st.size) return undefined
    const { uri } = await plugin.getUri({ path, directory: DATA_DIR })
    const url = convert(uri)
    writeIndex([...(await collect(url)).filter((e) => e.path !== path), { path, url }])
    return url
  } catch {
    return undefined
  }
}

/**
 * Open the picker and resolve with a URL the renderer can use as a video
 * background (null when the user cancels). Mirrors the desktop dialog:pickVideo
 * IPC the shared store calls.
 */
export async function pickVideoFile(): Promise<string | null> {
  const file = await pickFile('video/*')
  if (!file) return null
  return (await persist(file)) ?? URL.createObjectURL(file)
}
