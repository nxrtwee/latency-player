// Mobile i18n. Reads the language from the shared store (usePlayer.lang, already
// persisted) so the Settings toggle drives a live re-render everywhere t() is used.
import { usePlayer } from '@renderer/store'

type Lang = 'en' | 'ru'

const STRINGS: Record<string, { ru: string; en: string }> = {
  // tabs
  home: { ru: 'Главная', en: 'Home' },
  search: { ru: 'Поиск', en: 'Search' },
  library: { ru: 'Библиотека', en: 'Library' },
  profile: { ru: 'Профиль', en: 'Profile' },
  settings: { ru: 'Настройки', en: 'Settings' },
  // home
  greetMorning: { ru: 'Доброе утро', en: 'Good morning' },
  greetDay: { ru: 'Добрый день', en: 'Good afternoon' },
  greetEvening: { ru: 'Добрый вечер', en: 'Good evening' },
  greetNight: { ru: 'Доброй ночи', en: 'Good night' },
  whatListen1: { ru: 'Что хотите', en: 'What do you want' },
  whatListen2: { ru: 'послушать?', en: 'to hear?' },
  liked: { ru: 'Любимое', en: 'Liked' },
  recent: { ru: 'Недавнее', en: 'Recent' },
  activity: { ru: 'Активность', en: 'Activity' },
  stats: { ru: 'статистика', en: 'stats' },
  yourMixes: { ru: 'Ваши миксы', en: 'Your mixes' },
  mixesEmpty: {
    ru: 'Послушай что-нибудь или добавь в Любимое — соберём персональные миксы.',
    en: 'Play something or add to Liked — we’ll build personal mixes.'
  },
  jumpBack: { ru: 'Вернуться к', en: 'Jump back in' },
  yourPlaylists: { ru: 'Ваши плейлисты', en: 'Your playlists' },
  all: { ru: 'Все', en: 'All' },
  foot: { ru: 'latency · стриминг и музыка в одном месте', en: 'latency · streaming and music in one place' },
  // search
  searchPh: { ru: 'Поиск трека, артиста или микса', en: 'Search a track, artist or mix' },
  popular: { ru: 'Популярные запросы', en: 'Popular searches' },
  recentSearches: { ru: 'Недавние запросы', en: 'Recent searches' },
  recentArtists: { ru: 'Недавние авторы', en: 'Recent artists' },
  results: { ru: 'Результаты', en: 'Results' },
  nothingFound: { ru: 'Ничего не нашлось — попробуй другой запрос.', en: 'Nothing found — try another query.' },
  searchModeTracks: { ru: 'Треки', en: 'Tracks' },
  searchModeLyrics: { ru: 'По строчке', en: 'By lyrics' },
  lyricSearchPh: { ru: 'Введите строчку из песни', en: 'Type a line from the song' },
  lyricSearchHint: {
    ru: 'Помните строчку, но не название? Введите её — найдём трек.',
    en: 'Remember a line but not the title? Type it — we’ll find the track.'
  },
  // library
  myLibrary: { ru: 'Моя библиотека', en: 'My library' },
  playlists: { ru: 'Плейлисты', en: 'Playlists' },
  tracks: { ru: 'Треки', en: 'Tracks' },
  artists: { ru: 'Артисты', en: 'Artists' },
  albums: { ru: 'Альбомы', en: 'Albums' },
  newPlaylist: { ru: 'Создать новый плейлист', en: 'Create new playlist' },
  addToPlaylist: { ru: 'Добавить в плейлист', en: 'Add to playlist' },
  create: { ru: 'Создать', en: 'Create' },
  localFiles: { ru: 'Локальные файлы', en: 'Local files' },
  ownAudio: { ru: 'Свои аудиофайлы', en: 'Your own audio' },
  noPlaylists: { ru: 'Плейлистов пока нет — создай первый.', en: 'No playlists yet — create one.' },
  promptName: { ru: 'Название плейлиста', en: 'Playlist name' },
  // player / common
  nowPlaying: { ru: 'Сейчас играет', en: 'Now playing' },
  queue: { ru: 'Очередь', en: 'Queue' },
  lyrics: { ru: 'Текст', en: 'Lyrics' },
  noLyrics: { ru: 'Текст не найден.', en: 'No lyrics found.' },
  manualSync: { ru: 'Синхронизировать', en: 'Sync manually' },
  editSync: { ru: 'Изменить синхрон', en: 'Edit sync' },
  tapBeat: { ru: 'Тапай в начале каждой строки', en: 'Tap at the start of each line' },
  save: { ru: 'Сохранить', en: 'Save' },
  reset: { ru: 'Сброс', en: 'Reset' },
  listen: { ru: 'Слушать', en: 'Play' },
  empty: { ru: 'Пока пусто.', en: 'Nothing here yet.' },
  // settings
  appearance: { ru: 'Оформление', en: 'Appearance' },
  accent: { ru: 'Акцент', en: 'Accent' },
  acc_magenta: { ru: 'Магента', en: 'Magenta' },
  acc_violet: { ru: 'Фиолет', en: 'Violet' },
  acc_blue: { ru: 'Синий', en: 'Blue' },
  acc_green: { ru: 'Зелёный', en: 'Green' },
  acc_orange: { ru: 'Оранж', en: 'Orange' },
  appBg: { ru: 'Фон приложения', en: 'App background' },
  presets: { ru: 'Готовые фоны', en: 'Presets' },
  downloads: { ru: 'Скачанное', en: 'Downloads' },
  downloadAll: { ru: 'Скачать всё', en: 'Download all' },
  downloading: { ru: 'Скачивание…', en: 'Downloading…' },
  downloaded: { ru: 'Скачано', en: 'Downloaded' },
  noDownloads: { ru: 'Пока нет загрузок. Скачивайте треки для офлайна.', en: 'No downloads yet. Save tracks for offline.' },
  clearAll: { ru: 'Очистить', en: 'Clear all' },
  offlineSub: { ru: 'Слушать офлайн', en: 'Listen offline' },
  choose: { ru: 'Выбрать изображение', en: 'Choose image' },
  replace: { ru: 'Заменить', en: 'Replace' },
  remove: { ru: 'Убрать', en: 'Remove' },
  language: { ru: 'Язык', en: 'Language' },
  playback: { ru: 'Воспроизведение', en: 'Playback' },
  resumeSession: { ru: 'Возобновлять сессию', en: 'Resume session' },
  resumeSub: { ru: 'Восстанавливать очередь при запуске', en: 'Restore the queue on launch' },
  scAccount: { ru: 'Аккаунт SoundCloud', en: 'SoundCloud account' },
  scSoon: { ru: 'Вход скоро (нужен натив)', en: 'Sign-in soon (needs native)' },
  scSub: { ru: 'Личные миксы и лайки появятся после нативного входа.', en: 'Personal mixes and likes after native sign-in.' },
  connectSC: { ru: 'Подключить SoundCloud', en: 'Connect SoundCloud' },
  connect: { ru: 'Подключить', en: 'Connect' },
  disconnect: { ru: 'Отключить', en: 'Disconnect' },
  mySCLikes: { ru: 'Мои лайки SoundCloud', en: 'My SoundCloud likes' },
  scTokenHint: {
    ru: 'Войди на soundcloud.com, открой DevTools → Network → любой запрос к api-v2 → скопируй заголовок Authorization (OAuth …) и вставь сюда. На устройстве авто-вход появится позже.',
    en: 'Sign in at soundcloud.com, open DevTools → Network → any api-v2 request → copy the Authorization (OAuth …) header and paste it here. On-device auto sign-in comes later.'
  },
  scTokenBad: { ru: 'Токен не подошёл. Проверь и попробуй снова.', en: 'Token didn’t work. Check it and retry.' },
  ymAccount: { ru: 'Аккаунт Яндекс Музыки', en: 'Yandex Music account' },
  ymSub: { ru: 'Моя волна и лайки появятся после входа.', en: 'My Wave and likes appear after sign-in.' },
  connectYM: { ru: 'Подключить Яндекс Музыку', en: 'Connect Yandex Music' },
  ymTokenHint: {
    ru: 'Откройте страницу входа Яндекса, авторизуйтесь, затем скопируйте адрес из строки браузера (он содержит access_token) и вставьте сюда. Можно вставить и сам токен. Авто-вход на устройстве появится позже.',
    en: 'Open the Yandex sign-in page, log in, then copy the address bar URL (it contains access_token) and paste it here. The bare token works too. On-device auto sign-in comes later.'
  },
  ymGetToken: { ru: 'Открыть страницу входа Яндекса', en: 'Open Yandex sign-in page' },
  ymTokenBad: { ru: 'Токен не подошёл. Проверь и попробуй снова.', en: 'Token didn’t work. Check it and retry.' },
  importYMLikes: { ru: 'Импортировать лайки', en: 'Import likes' },
  importLikes: { ru: 'Импортировать лайки', en: 'Import likes' },
  importing: { ru: 'Импорт…', en: 'Importing…' },
  importedN: { ru: 'Импортировано', en: 'Imported' },
  myWave: { ru: 'Моя волна', en: 'My Wave' },
  waveSub: { ru: 'Персональный поток Яндекс Музыки', en: 'Your personal Yandex Music stream' },
  playWave: { ru: 'Слушать волну', en: 'Play wave' },
  similarArtists: { ru: 'Похожие артисты', en: 'Similar artists' },
  listeners: { ru: 'слушателей/мес', en: 'monthly listeners' },
  playlistsSec: { ru: 'Плейлисты', en: 'Playlists' },
  data: { ru: 'Данные', en: 'Data' },
  savedQueue: { ru: 'Сохранённая очередь', en: 'Saved queue' },
  clear: { ru: 'Очистить', en: 'Clear' },
  cleared: { ru: 'Очищено', en: 'Cleared' },
  about: { ru: 'О приложении', en: 'About' },
  aboutText: {
    ru: 'Latency — медиаплеер с локальными файлами и стримингом в одном месте. Мобильная версия.',
    en: 'Latency — a media player with local files and streaming in one place. Mobile edition.'
  },
  developers: { ru: 'Разработка', en: 'Developers' },
  // activity
  yourStats: { ru: 'Ваша статистика', en: 'Your stats' },
  played: { ru: 'Прослушано', en: 'Played' },
  time: { ru: 'Время', en: 'Time' },
  likes: { ru: 'Лайки', en: 'Likes' },
  topArtist: { ru: 'Топ-артист', en: 'Top artist' },
  sources: { ru: 'Источники', en: 'Sources' },
  local: { ru: 'локальные', en: 'local' },
  recentActivity: { ru: 'Недавняя активность', en: 'Recent activity' },
  nothingPlayed: { ru: 'Пока ничего не прослушано.', en: 'Nothing played yet.' },
  // local files
  available: { ru: 'доступно', en: 'available' },
  addFiles: { ru: 'Добавить файлы', en: 'Add files' },
  playAll: { ru: 'Слушать всё', en: 'Play all' },
  localEmpty: {
    ru: 'Добавьте свои аудиофайлы — они играют локально, с живым визуализатором.',
    en: 'Add your audio files — they play locally with a live visualizer.'
  },
  localFile: { ru: 'Локальный файл', en: 'Local file' },
  unavailable: { ru: 'Недоступно — переимпортируйте', en: 'Unavailable — re-import' },
  clearList: { ru: 'Очистить список', en: 'Clear list' },
  // profile
  listener: { ru: 'Слушатель', en: 'Listener' },
  bio: { ru: 'Слушаю музыку и делюсь вайбом', en: 'Listening and sharing the vibe' },
  followers: { ru: 'Подписчики', en: 'Followers' },
  changePhoto: { ru: 'Сменить фото', en: 'Change photo' },
  changeName: { ru: 'Сменить имя', en: 'Change name' },
  crop: { ru: 'Кадрировать', en: 'Crop' },
  done: { ru: 'Готово', en: 'Done' },
  changeCover: { ru: 'Сменить обложку', en: 'Change cover' },
  resetCover: { ru: 'Вернуть обложку', en: 'Reset cover' },
  trackBackground: { ru: 'Фон трека', en: 'Track background' },
  kbgImage: { ru: 'Изображение', en: 'Image' },
  kbgReset: { ru: 'Убрать фон', en: 'Remove background' },
  autopilot: { ru: 'Автопилот', en: 'Autopilot' },
  moreActions: { ru: 'Ещё', en: 'More' },
  addAllToQueue: { ru: 'Добавить всё в очередь', en: 'Add all to queue' },
  addAllToPlaylist: { ru: 'Добавить всё в плейлист', en: 'Add all to playlist' },
  comments: { ru: 'Комментарии', en: 'Comments' },
  commentsScOnly: { ru: 'Комментарии есть только у треков SoundCloud.', en: 'Comments are only available on SoundCloud tracks.' },
  noComments: { ru: 'Пока нет комментариев.', en: 'No comments yet.' },
  artistSc: { ru: 'Артист SoundCloud', en: 'SoundCloud artist' },
  artistYm: { ru: 'Артист Яндекс Музыки', en: 'Yandex Music artist' },
  removeImported: { ru: 'Убрать импортированные лайки', en: 'Remove imported likes' },
  removed: { ru: 'Убрано', en: 'Removed' },
  deletePlaylist: { ru: 'Удалить плейлист', en: 'Delete playlist' },
  hideScMixes: { ru: 'Скрыть миксы SoundCloud', en: 'Hide SoundCloud mixes' },
  hideScMixesSub: { ru: 'Убрать секцию миксов с главной', en: 'Remove the mixes section from Home' }
}

export type TKey = keyof typeof STRINGS

/** Hook: returns a translator bound to the current store language. */
export function useT(): (key: TKey) => string {
  const lang = usePlayer((s) => s.lang) as Lang
  return (key: TKey) => STRINGS[key]?.[lang] ?? STRINGS[key]?.en ?? String(key)
}
