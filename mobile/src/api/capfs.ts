// Capacitor native-storage plumbing, shared by the modules that keep files on the
// device: offline downloads (offline.ts) and imported local tracks (localfiles.ts).
//
// The plugins are reached through the global `Capacitor` bridge rather than a
// bundle import, so the web build (and the dev preview in a desktop browser) has
// no build-order coupling to the native plugins — `isNative()` is simply false
// there and every caller falls back to a browser-only path.

/** The subset of @capacitor/filesystem we use. */
export interface FilesystemPlugin {
  mkdir: (o: { path: string; directory: string; recursive?: boolean }) => Promise<void>
  deleteFile: (o: { path: string; directory: string }) => Promise<void>
  getUri: (o: { path: string; directory: string }) => Promise<{ uri: string }>
  stat: (o: { path: string; directory: string }) => Promise<{ size?: number }>
  // no encoding => data is the file's bytes as a base64 string, both ways
  readFile: (o: { path: string; directory: string }) => Promise<{ data: string }>
  writeFile: (o: {
    path: string
    directory: string
    data: string
    recursive?: boolean
  }) => Promise<{ uri: string }>
}

/** The subset of @capacitor/file-transfer we use (native streaming download). */
export interface FileTransferPlugin {
  // Downloads url -> an absolute file path (file:// from Filesystem.getUri),
  // streamed natively to disk, following redirects.
  downloadFile: (o: { url: string; path: string }) => Promise<{ path?: string }>
}

interface CapGlobal {
  isNativePlatform?: () => boolean
  convertFileSrc?: (uri: string) => string
  Plugins?: { Filesystem?: FilesystemPlugin; FileTransfer?: FileTransferPlugin }
}

/** Capacitor Directory.Data — private, app-scoped, survives restarts. */
export const DATA_DIR = 'DATA'

const cap = (): CapGlobal | undefined => (window as unknown as { Capacitor?: CapGlobal }).Capacitor

export const isNative = (): boolean => !!cap()?.isNativePlatform?.()
export const fsPlugin = (): FilesystemPlugin | undefined => cap()?.Plugins?.Filesystem
export const transferPlugin = (): FileTransferPlugin | undefined => cap()?.Plugins?.FileTransfer
export const convertSrc = (): ((uri: string) => string) | undefined => cap()?.convertFileSrc

/** base64 -> Blob (chunked to avoid building a huge argument list). */
export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** Blob/File -> base64 (no data: prefix), for Filesystem.writeFile. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = String(fr.result || '')
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    fr.onerror = () => reject(fr.error || new Error('read failed'))
    fr.readAsDataURL(blob)
  })
}
