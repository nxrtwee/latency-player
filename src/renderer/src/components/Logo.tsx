// The "latency" L mark: a cascade of L-shaped bars, front one in a neon
// blue→purple→pink gradient with ghosted copies receding behind it.
export function Logo({ size = 30 }: { size?: number }): JSX.Element {
  const L = '30,8 52,8 52,70 92,70 92,92 30,92'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 124 104"
      fill="none"
      aria-label="latency"
      style={{ filter: 'drop-shadow(0 0 6px rgba(123, 92, 255, 0.55))' }}
    >
      <defs>
        <linearGradient id="lp-logo" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#2fe1ff" />
          <stop offset="0.5" stopColor="#7b5cff" />
          <stop offset="1" stopColor="#ff48d0" />
        </linearGradient>
      </defs>
      <g transform="skewX(-9)">
        <polygon points={L} transform="translate(46 6)" fill="#7b5cff" opacity="0.12" />
        <polygon points={L} transform="translate(31 4)" fill="#7b5cff" opacity="0.2" />
        <polygon points={L} transform="translate(16 2)" fill="#8a5cff" opacity="0.32" />
        <polygon points={L} fill="url(#lp-logo)" />
      </g>
    </svg>
  )
}
