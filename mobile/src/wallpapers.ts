// Bundled preset wallpapers (branded neon backgrounds). Imported as Vite assets
// so they ship inside the app bundle and can be picked in Settings → they feed
// the same custom-background mechanism (customBg = URL). Selecting one stores its
// (short) asset URL in lp.m.bg, like an uploaded image but without the dataURL.
import wp01 from '../assets/wallpapers/wp01.png'
import wp02 from '../assets/wallpapers/wp02.png'
import wp03 from '../assets/wallpapers/wp03.png'
import wp04 from '../assets/wallpapers/wp04.png'
import wp05 from '../assets/wallpapers/wp05.png'
import wp06 from '../assets/wallpapers/wp06.png'
import wp07 from '../assets/wallpapers/wp07.png'
import wp08 from '../assets/wallpapers/wp08.png'
import wp09 from '../assets/wallpapers/wp09.png'
import wp10 from '../assets/wallpapers/wp10.png'
import wp11 from '../assets/wallpapers/wp11.png'
import wp12 from '../assets/wallpapers/wp12.png'

export const WALLPAPERS: string[] = [
  wp01, wp02, wp03, wp04, wp05, wp06, wp07, wp08, wp09, wp10, wp11, wp12
]
