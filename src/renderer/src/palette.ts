// Extract a couple of dominant colors from an image for the fullscreen backdrop.
// Pure canvas, downscaled — cheap and runs in the renderer.

export interface Palette {
  top: string
  bottom: string
}

const cache = new Map<string, Palette>()
const DEFAULT: Palette = { top: '#16241d', bottom: '#080b0a' }

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}
function rgb(r: number, g: number, b: number): string {
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`
}

export async function extractPalette(src: string): Promise<Palette> {
  if (!src) return DEFAULT
  const hit = cache.get(src)
  if (hit) return hit

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = 24
        const h = 24
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(DEFAULT)
        ctx.drawImage(img, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h).data

        // average color of the top half and bottom half, skipping near-black/white
        const acc = (y0: number, y1: number): [number, number, number] => {
          let r = 0
          let g = 0
          let b = 0
          let n = 0
          for (let y = y0; y < y1; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4
              const cr = data[i]
              const cg = data[i + 1]
              const cb = data[i + 2]
              const max = Math.max(cr, cg, cb)
              const min = Math.min(cr, cg, cb)
              if (max < 18 || min > 240) continue // skip pure black/white
              r += cr
              g += cg
              b += cb
              n++
            }
          }
          if (n === 0) return [22, 36, 29]
          return [r / n, g / n, b / n]
        }

        const [tr, tg, tb] = acc(0, h / 2)
        const [br, bg, bb] = acc(h / 2, h)
        // darken a touch so foreground text stays readable
        const pal: Palette = {
          top: rgb(tr * 0.7, tg * 0.7, tb * 0.7),
          bottom: rgb(br * 0.32, bg * 0.32, bb * 0.32)
        }
        cache.set(src, pal)
        resolve(pal)
      } catch {
        resolve(DEFAULT)
      }
    }
    img.onerror = () => resolve(DEFAULT)
    img.src = src
  })
}
