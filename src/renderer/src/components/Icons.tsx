// Minimal inline SVG icon set (lucide-style). All use currentColor so existing
// color CSS keeps working. Filled glyphs for transport controls, stroked for the rest.
import type { SVGProps, ReactNode } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 18, children, ...rest }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PlayIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polygon points="6 4 20 12 6 20" fill="currentColor" stroke="none" />
  </Svg>
)

export const PauseIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
  </Svg>
)

export const PrevIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polygon points="19 20 9 12 19 4" fill="currentColor" stroke="none" />
    <rect x="5" y="4" width="2.4" height="16" rx="1" fill="currentColor" stroke="none" />
  </Svg>
)

export const NextIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polygon points="5 4 15 12 5 20" fill="currentColor" stroke="none" />
    <rect x="16.6" y="4" width="2.4" height="16" rx="1" fill="currentColor" stroke="none" />
  </Svg>
)

export const ShuffleIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M16 3h5v5" />
    <path d="M4 20 21 3" />
    <path d="M21 16v5h-5" />
    <path d="M15 15l6 6" />
    <path d="M4 4l5 5" />
  </Svg>
)

export const RepeatIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </Svg>
)

export const RepeatOneIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    <path d="M11 10h1v4" />
  </Svg>
)

export const VolumeIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" stroke="none" />
    <path d="M16 9a3 3 0 0 1 0 6" />
    <path d="M19.5 6.5a7 7 0 0 1 0 11" />
  </Svg>
)

export const PlusIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
)

export const RefreshIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v5h-5" />
  </Svg>
)

export const CloseIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
)

export const SearchIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
)

const heartPath =
  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'

export const HeartIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d={heartPath} />
  </Svg>
)

export const HeartFilledIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d={heartPath} fill="currentColor" />
  </Svg>
)

export const HomeIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Svg>
)

export const CompassIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <polygon points="16 8 14 14 8 16 10 10" fill="currentColor" stroke="none" />
  </Svg>
)

export const ActivityIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3 12h4l2.5 7 5-16 2.5 9H21" />
  </Svg>
)

export const ClockIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)

export const FolderIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Svg>
)

export const SoundCloudIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 16v-4" />
    <path d="M7 16v-6" />
    <path d="M10 16V8" />
    <path d="M13 16V7" />
    <path d="M13 9.5a4 4 0 0 1 7 2.5 3 3 0 0 1-1 4h-6" />
  </Svg>
)

export const SpotifyIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M7.5 9.5c3-1 6.5-.6 9 1" />
    <path d="M8 12.5c2.4-.8 5-.4 7 .8" />
    <path d="M8.5 15.3c1.8-.6 3.8-.3 5.3.6" />
  </Svg>
)

export const YouTubeIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="3" />
    <polygon points="11 9.5 15 12 11 14.5" fill="currentColor" stroke="none" />
  </Svg>
)

export const DownloadIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 3v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 21h14" />
  </Svg>
)

export const MoreIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
)

export const QueueIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 6h16" />
    <path d="M4 12h10" />
    <path d="M4 18h10" />
    <polygon points="17 13 21 15.5 17 18" fill="currentColor" stroke="none" />
  </Svg>
)

export const DevicesIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="2" y="5" width="14" height="10" rx="2" />
    <rect x="16" y="9" width="6" height="10" rx="1.5" />
    <path d="M5 19h6" />
  </Svg>
)

export const ExpandIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 9V4h5" />
    <path d="M20 9V4h-5" />
    <path d="M4 15v5h5" />
    <path d="M20 15v5h-5" />
  </Svg>
)

export const ChevronDownIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)

export const SettingsIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </Svg>
)

export const LyricsIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 5h11" />
    <path d="M4 10h9" />
    <path d="M4 15h7" />
    <path d="M17 14a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
    <path d="M19.5 16V8l2.5 1.2" />
  </Svg>
)

export const ImageIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </Svg>
)

export const EditIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Svg>
)
