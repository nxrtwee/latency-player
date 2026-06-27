// Generates build/icon.ico (multi-size) from build/icon.png.
//
// Why this exists: the window/taskbar icon used to be the raw 1030×1030 PNG,
// which Windows (and electron-builder) downscale on the fly to 16/24/32 px with
// low-quality scaling → the micro icon looked distorted. A real .ico carries a
// crisp, properly-resampled bitmap for each small size, so Windows just picks
// the right one. Pure Node (zlib only), no native deps. Re-run if icon.png
// changes:  node build/make-ico.cjs
'use strict'
const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

const SRC = path.join(__dirname, 'icon.png')
const OUT = path.join(__dirname, 'icon.ico')
const SIZES = [256, 128, 64, 48, 32, 24, 16]

// ---- CRC32 (PNG chunks) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---- decode an 8-bit RGBA, non-interlaced PNG to a flat Uint8 RGBA buffer ----
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let off = 8
  let w = 0
  let h = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      const bitDepth = data[8]
      const colorType = data[9]
      const interlace = data[12]
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0)
        throw new Error(`unsupported PNG (bd=${bitDepth} ct=${colorType} il=${interlace})`)
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = 4
  const stride = w * bpp
  const out = Buffer.alloc(w * h * bpp)
  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]
    const rowStart = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const rawVal = raw[rowStart + x]
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let val
      switch (filter) {
        case 0: val = rawVal; break
        case 1: val = rawVal + a; break
        case 2: val = rawVal + b; break
        case 3: val = rawVal + ((a + b) >> 1); break
        case 4: val = rawVal + paeth(a, b, c); break
        default: throw new Error('bad filter ' + filter)
      }
      out[y * stride + x] = val & 0xff
    }
  }
  return { w, h, data: out }
}

// ---- high-quality area-average downscale with premultiplied alpha ----
// (premultiplying keeps fully-transparent pixels from bleeding their stale RGB
// into the edges of the shrunk icon.)
function resize(src, dw, dh) {
  const { w: sw, h: sh, data } = src
  const out = Buffer.alloc(dw * dh * 4)
  const sx = sw / dw
  const sy = sh / dh
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * sy
    const y1 = (dy + 1) * sy
    const iy0 = Math.floor(y0)
    const iy1 = Math.ceil(y1)
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * sx
      const x1 = (dx + 1) * sx
      const ix0 = Math.floor(x0)
      const ix1 = Math.ceil(x1)
      let rA = 0
      let gA = 0
      let bA = 0
      let aSum = 0
      let wSum = 0
      for (let yy = iy0; yy < iy1; yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy)
        if (wy <= 0) continue
        for (let xx = ix0; xx < ix1; xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx)
          if (wx <= 0) continue
          const wgt = wx * wy
          const i = (yy * sw + xx) * 4
          const a = data[i + 3] / 255
          rA += data[i] * a * wgt
          gA += data[i + 1] * a * wgt
          bA += data[i + 2] * a * wgt
          aSum += a * wgt
          wSum += wgt
        }
      }
      const o = (dy * dw + dx) * 4
      if (aSum > 0) {
        out[o] = Math.round(rA / aSum)
        out[o + 1] = Math.round(gA / aSum)
        out[o + 2] = Math.round(bA / aSum)
        out[o + 3] = Math.round((aSum / wSum) * 255)
      } else {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0
      }
    }
  }
  return { w: dw, h: dh, data: out }
}

// ---- encode RGBA → PNG buffer ----
function encodePng(img) {
  const { w, h, data } = img
  const stride = w * 4
  const rawSize = h * (stride + 1)
  const raw = Buffer.alloc(rawSize)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const chunk = (type, payload) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(payload.length, 0)
    const typeBuf = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, payload])), 0)
    return Buffer.concat([len, typeBuf, payload, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---- pack PNG entries into an .ico ----
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(entries.length * 16)
  let offset = 6 + entries.length * 16
  entries.forEach((e, i) => {
    const base = i * 16
    dir[base] = e.size >= 256 ? 0 : e.size // width (0 = 256)
    dir[base + 1] = e.size >= 256 ? 0 : e.size // height
    dir[base + 2] = 0 // palette
    dir[base + 3] = 0 // reserved
    dir.writeUInt16LE(1, base + 4) // color planes
    dir.writeUInt16LE(32, base + 6) // bits per pixel
    dir.writeUInt32LE(e.png.length, base + 8) // data size
    dir.writeUInt32LE(offset, base + 12) // data offset
    offset += e.png.length
  })
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)])
}

const src = decodePng(fs.readFileSync(SRC))
console.log(`source ${src.w}×${src.h}`)
const entries = SIZES.map((size) => {
  const img = size === src.w ? src : resize(src, size, size)
  const png = encodePng(img)
  console.log(`  ${size}px → ${png.length} bytes`)
  return { size, png }
})
fs.writeFileSync(OUT, buildIco(entries))
console.log(`wrote ${OUT} (${fs.statSync(OUT).size} bytes, ${entries.length} sizes)`)
