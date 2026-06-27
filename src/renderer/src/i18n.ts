import { usePlayer } from './store'

type Lang = 'en' | 'ru'

// UI chrome strings. Brand/product names (Latency, SoundCloud, Spotify,
// YouTube Music, Genius, LRCLIB) are intentionally not translated.
const dict: Record<string, { en: string; ru: string }> = {
  // sidebar sections
  discover: { en: 'Discover', ru: 'Обзор' },
  yourMusic: { en: 'Your Music', ru: 'Моя музыка' },
  sources: { en: 'Sources', ru: 'Источники' },
  madeForYou: { en: 'Made For You', ru: 'Для вас' },
  recentArtists: { en: 'Recent Artists', ru: 'Недавние артисты' },
  profile: { en: 'Profile', ru: 'Профиль' },
  guest: { en: 'Guest', ru: 'Гость' },
  viewProfile: { en: 'View profile', ru: 'Открыть профиль' },
  changePhoto: { en: 'Change photo', ru: 'Сменить фото' },
  removePhoto: { en: 'Remove photo', ru: 'Убрать фото' },
  yourName: { en: 'Your name', ru: 'Ваше имя' },
  editName: { en: 'Edit name', ru: 'Изменить имя' },
  seeAll: { en: 'See all', ru: 'Все' },
  plays: { en: 'plays', ru: 'прослушиваний' },
  rating: { en: 'rating', ru: 'оценка' },
  frameAvatar: { en: 'Frame avatar', ru: 'Кадрирование аватара' },
  account: { en: 'Account', ru: 'Аккаунт' },
  connectedAs: { en: 'Connected as', ru: 'Подключён как' },
  notConnected: { en: 'Not connected', ru: 'Не подключён' },
  localProfile: { en: 'Local profile', ru: 'Локальный профиль' },
  scAccountDesc: {
    en: 'Connect SoundCloud for personal mixes, likes and your real profile.',
    ru: 'Подключите SoundCloud для персональных миксов, лайков и реального профиля.'
  },
  useScIdentity: { en: 'Use SoundCloud name & photo', ru: 'Имя и фото из SoundCloud' },
  playlists: { en: 'Playlists', ru: 'Плейлисты' },
  // nav
  home: { en: 'Home', ru: 'Главная' },
  explore: { en: 'Explore', ru: 'Поиск' },
  activity: { en: 'Activity', ru: 'Активность' },
  yourLikes: { en: 'Your Likes', ru: 'Любимое' },
  recentlyPlayed: { en: 'Recently Played', ru: 'Недавнее' },
  localFiles: { en: 'Local Files', ru: 'Локальные файлы' },
  downloaded: { en: 'Downloaded', ru: 'Скачанное' },
  downloadedDesc: { en: 'Tracks saved for offline playback.', ru: 'Треки, сохранённые для офлайна.' },
  emptyOffline: {
    en: 'No downloads yet. Tap the ↓ on any SoundCloud track.',
    ru: 'Пока ничего не скачано. Нажмите ↓ на треке SoundCloud.'
  },
  settings: { en: 'Settings', ru: 'Настройки' },
  newPlaylist: { en: 'New playlist', ru: 'Новый плейлист' },
  noPlaylists: { en: 'No playlists yet', ru: 'Пока нет плейлистов' },
  folders: { en: 'Folders', ru: 'Папки' },
  addMusicFolder: { en: 'Add music folder', ru: 'Добавить папку' },
  noFolders: { en: 'No folders yet', ru: 'Папок пока нет' },
  // page meta
  playlist: { en: 'Playlist', ru: 'Плейлист' },
  history: { en: 'History', ru: 'История' },
  library: { en: 'Library', ru: 'Библиотека' },
  source: { en: 'Source', ru: 'Источник' },
  artist: { en: 'Artist', ru: 'Артист' },
  mix: { en: 'Mix', ru: 'Микс' },
  likesDesc: { en: 'All the music you love in one place.', ru: 'Вся любимая музыка в одном месте.' },
  recentDesc: { en: 'Your latest listens.', ru: 'Последние прослушивания.' },
  localDesc: { en: 'Music from your folders.', ru: 'Музыка из ваших папок.' },
  tracks: { en: 'tracks', ru: 'треков' },
  // table
  title: { en: 'Title', ru: 'Название' },
  // common
  play: { en: 'Play', ru: 'Слушать' },
  // tracklist actions
  downloadAll: { en: 'Download all', ru: 'Скачать всё' },
  downloadingAll: { en: 'Downloading…', ru: 'Скачивание…' },
  moreActions: { en: 'More', ru: 'Ещё' },
  addAllToQueue: { en: 'Add all to queue', ru: 'Добавить всё в очередь' },
  addAllToPlaylist: { en: 'Add all to playlist', ru: 'Добавить всё в плейлист' },
  noPlaylistsYet: { en: 'No playlists yet', ru: 'Пока нет плейлистов' },
  newPlaylistPh: { en: 'New playlist…', ru: 'Новый плейлист…' },
  add: { en: 'Add', ru: 'Добавить' },
  back: { en: 'Back', ru: 'Назад' },
  // empty / loading
  emptyLikes: { en: 'No liked tracks yet. Tap the heart on any track.', ru: 'Пока нет лайков. Нажмите сердечко на треке.' },
  emptyRecent: { en: 'Nothing played yet.', ru: 'Пока ничего не играли.' },
  emptyPlaylist: { en: 'This playlist is empty. Add tracks with the ··· menu.', ru: 'Плейлист пуст. Добавьте треки через меню ···.' },
  emptyLocal: { en: 'Add a music folder to get started.', ru: 'Добавьте папку с музыкой, чтобы начать.' },
  scanning: { en: 'Scanning…', ru: 'Сканирование…' },
  filterTracks: { en: 'Filter these tracks…', ru: 'Фильтр по трекам…' },
  // explore
  exploreSub: { en: 'Search millions of tracks and stream them instantly.', ru: 'Ищите миллионы треков и слушайте сразу.' },
  explorePlaceholder: { en: 'What do you want to listen to?', ru: 'Что хотите послушать?' },
  search: { en: 'Search', ru: 'Искать' },
  profiles: { en: 'Profiles', ru: 'Профили' },
  searching: { en: 'Searching SoundCloud…', ru: 'Поиск в SoundCloud…' },
  // search modes (Explore tab)
  searchModeTracks: { en: 'Tracks', ru: 'Треки' },
  searchModeLyrics: { en: 'By lyrics', ru: 'По строчке' },
  lyricsPlaceholder: { en: 'Type a line from the song…', ru: 'Введите строчку из песни…' },
  lyricSearchHint: {
    en: 'Remember a line? Type it and we’ll find the track.',
    ru: 'Помните строчку? Введите её — и мы найдём трек.'
  },
  nothingFound: { en: 'Nothing found', ru: 'Ничего не найдено' },
  openingTrack: { en: 'Finding on SoundCloud…', ru: 'Ищем на SoundCloud…' },
  // autopilot
  autopilot: { en: 'Autopilot', ru: 'Автоплей' },
  autopilotOn: { en: 'Autopilot: on — related tracks keep playing', ru: 'Автоплей включён — похожие треки продолжат играть' },
  autopilotOff: { en: 'Autopilot: off', ru: 'Автоплей выключен' },
  autopilotFinding: { en: 'Autopilot: finding similar tracks…', ru: 'Автоплей: ищем похожие треки…' },
  // comments
  comments: { en: 'Comments', ru: 'Комментарии' },
  commentsSidebar: { en: 'Comments', ru: 'Комментарии' },
  commentsLoading: { en: 'Loading comments…', ru: 'Загрузка комментариев…' },
  noComments: { en: 'No comments on this track.', ru: 'У этого трека нет комментариев.' },
  commentsScOnly: {
    en: 'Comments are available for SoundCloud tracks.',
    ru: 'Комментарии доступны для треков SoundCloud.'
  },
  commentsScOnlySub: {
    en: 'Play a SoundCloud track to see timed comments scroll along with it.',
    ru: 'Включите трек из SoundCloud — комментарии поедут по таймкодам вместе с ним.'
  },
  noCommentsSub: {
    en: 'Be the first wave — nobody has dropped a comment here yet.',
    ru: 'Здесь пока тихо — ни одного комментария по таймкодам.'
  },
  // equalizer
  equalizer: { en: 'Equalizer', ru: 'Эквалайзер' },
  eqEnabled: { en: 'Enabled', ru: 'Включён' },
  eqPreset: { en: 'Preset', ru: 'Пресет' },
  eqReset: { en: 'Reset', ru: 'Сброс' },
  eqLocalOnly: {
    en: 'Works for both local files and SoundCloud streams.',
    ru: 'Работает и для локальных файлов, и для потоков SoundCloud.'
  },
  eqFlat: { en: 'Flat', ru: 'Ровный' },
  eqBassBoost: { en: 'Bass Boost', ru: 'Усиление баса' },
  eqTrebleBoost: { en: 'Treble Boost', ru: 'Усиление верхов' },
  eqVocal: { en: 'Vocal', ru: 'Вокал' },
  eqElectronic: { en: 'Electronic', ru: 'Электроника' },
  eqRock: { en: 'Rock', ru: 'Рок' },
  eqLoudness: { en: 'Loudness', ru: 'Громкость' },
  // right panel
  nowPlaying: { en: 'Now Playing', ru: 'Сейчас играет' },
  collapsePanel: { en: 'Collapse panel', ru: 'Свернуть панель' },
  changeCover: { en: 'Change cover', ru: 'Сменить обложку' },
  resetCover: { en: 'Reset to default cover', ru: 'Сбросить обложку' },
  playerBarWidth: { en: 'Player bar width', ru: 'Ширина плеера' },
  playerBarWidthSub: {
    en: 'Width of the floating player bar (nextgen).',
    ru: 'Ширина плавающей полосы плеера (nextgen).'
  },
  trackBackground: { en: 'Track background', ru: 'Фон трека' },
  kbgImage: { en: 'Image…', ru: 'Изображение…' },
  kbgVideoFile: { en: 'Video file…', ru: 'Видео-файл…' },
  kbgLinkPh: { en: 'Video URL or YouTube…', ru: 'Ссылка на видео или YouTube…' },
  kbgReset: { en: 'Remove track background', ru: 'Убрать фон трека' },
  nextInQueue: { en: 'Next in Queue', ru: 'Очередь' },
  clear: { en: 'Clear', ru: 'Очистить' },
  queueEmpty: { en: 'Queue is empty', ru: 'Очередь пуста' },
  filterQueue: { en: 'Filter queue…', ru: 'Фильтр очереди…' },
  removeFromQueue: { en: 'Remove from queue', ru: 'Убрать из очереди' },
  noQueueMatch: { en: 'No matching tracks', ru: 'Ничего не найдено' },
  nothingPlaying: { en: 'Nothing playing', ru: 'Ничего не играет' },
  // home
  welcome: { en: 'Welcome', ru: 'Добро пожаловать' },
  thisIs: { en: 'This is', ru: 'Это' },
  welcomeBlurb: {
    en: 'One player for everything you listen to — your local library and SoundCloud streaming side by side. Like tracks, build playlists, and pick up right where you left off.',
    ru: 'Один плеер для всего: локальная библиотека и стриминг SoundCloud рядом. Лайкайте треки, собирайте плейлисты и продолжайте с того же места.'
  },
  whatListen: { en: 'What do you want to', ru: 'Что хотите' },
  listen: { en: 'listen', ru: 'послушать' },
  jumpBackIn: { en: 'Jump back in', ru: 'Вернуться к' },
  yourPlaylists: { en: 'Your playlists', ru: 'Ваши плейлисты' },
  yourMixes: { en: 'Your Mixes', ru: 'Ваши миксы' },
  refreshedDaily: { en: 'refreshed daily · from your likes', ru: 'обновляется ежедневно · по лайкам' },
  realMixes: { en: 'real mixes from your SoundCloud', ru: 'настоящие миксы из SoundCloud' },
  fromScLikes: { en: 'from your SoundCloud likes', ru: 'по вашим лайкам SoundCloud' },
  signOut: { en: 'Sign out', ru: 'Выйти' },
  signInSc: { en: 'Sign in with SoundCloud', ru: 'Войти через SoundCloud' },
  signInYm: { en: 'Sign in with Yandex', ru: 'Войти через Яндекс' },
  yandexMusic: { en: 'Yandex Music', ru: 'Яндекс Музыка' },
  myWave: { en: 'My Wave', ru: 'Моя волна' },
  myWaveSub: { en: 'Personal radio · Yandex Music', ru: 'Персональная волна · Яндекс Музыка' },
  myWaveHeadline: {
    en: 'An endless wave, tuned to you',
    ru: 'Бесконечная волна под ваш вкус'
  },
  myWaveBlurb: {
    en: 'My Wave is a personal stream from Yandex Music that never stops — it learns from what you play and keeps the music flowing on its own, picking the next track for you. Press play and just listen; the wave refills itself as it goes.',
    ru: 'Моя волна — персональный поток из Яндекс Музыки, который не заканчивается: он подстраивается под то, что вы слушаете, и сам продолжает играть, подбирая следующий трек. Нажмите «Слушать» и просто слушайте — волна пополняется на ходу.'
  },
  playWave: { en: 'Listen', ru: 'Слушать' },
  waveTagMood: { en: 'By mood', ru: 'По настроению' },
  waveTagCharacter: { en: 'By character', ru: 'По характеру' },
  waveTagLanguage: { en: 'By language', ru: 'По языку' },
  waveNowPlaying: { en: 'In the wave now', ru: 'Сейчас в волне' },
  ymAccount: { en: 'Yandex Music account', ru: 'Аккаунт Яндекс Музыки' },
  ymPlusHint: {
    en: 'Works without a VPN in Russia. Without signing in, tracks play 30-second previews; after you sign in with your Yandex account they play in full (subject to your Yandex Plus).',
    ru: 'Работает без VPN в России. Без входа треки играют 30-секундные превью; после входа своим аккаунтом Яндекс — целиком (в рамках вашей подписки Яндекс Плюс).'
  },
  connecting: { en: 'Connecting…', ru: 'Подключение…' },
  importLikes: { en: 'Import likes', ru: 'Импортировать лайки' },
  importing: { en: 'Importing…', ru: 'Импорт…' },
  imported: { en: 'Imported', ru: 'Импортировано' },
  importedNone: { en: 'Nothing new to import', ru: 'Нет новых для импорта' },
  removeImported: { en: 'Remove imported', ru: 'Убрать импортированные' },
  removing: { en: 'Removing…', ru: 'Удаление…' },
  removed: { en: 'Removed', ru: 'Удалено' },
  removedNone: { en: 'Nothing to remove', ru: 'Нечего убирать' },
  wantRealMixes: { en: 'Want real, accurate mixes?', ru: 'Хотите настоящие точные миксы?' },
  promoSub: {
    en: 'These mixes are auto-generated and can be a bit off. Sign in with SoundCloud to get your real personalized mixes.',
    ru: 'Эти миксы сгенерированы автоматически и могут быть неточными. Войдите через SoundCloud, чтобы получить настоящие персональные миксы.'
  },
  // settings
  appearance: { en: 'Appearance', ru: 'Оформление' },
  skin: { en: 'Interface skin', ru: 'Стиль интерфейса' },
  collapseSidebar: { en: 'Collapse sidebar', ru: 'Свернуть панель' },
  expandSidebar: { en: 'Expand sidebar', ru: 'Развернуть панель' },
  skinSub: { en: 'oldgen — classic · nextgen — cinematic', ru: 'oldgen — классика · nextgen — кино' },
  theme: { en: 'Theme', ru: 'Тема' },
  customColor: { en: 'Custom', ru: 'Свой цвет' },
  language: { en: 'Language', ru: 'Язык' },
  compactMode: { en: 'Compact mode', ru: 'Компактный режим' },
  compactSub: { en: 'Tighter rows and spacing', ru: 'Плотнее строки и отступы' },
  customBackground: { en: 'Custom background', ru: 'Свой фон' },
  chooseImage: { en: 'Choose image…', ru: 'Выбрать изображение…' },
  changeImage: { en: 'Change image…', ru: 'Сменить изображение…' },
  adjustFraming: { en: 'Adjust framing…', ru: 'Кадрировать…' },
  frameBackground: { en: 'Frame background', ru: 'Кадрирование фона' },
  frameHint: { en: 'Drag to reposition · scroll or slider to zoom', ru: 'Тяните, чтобы сместить · колесо или ползунок для зума' },
  zoom: { en: 'Zoom', ru: 'Масштаб' },
  reset: { en: 'Reset', ru: 'Сброс' },
  done: { en: 'Done', ru: 'Готово' },
  changeBackground: { en: 'Change background', ru: 'Сменить фон' },
  backgroundScope: { en: 'Apply background to', ru: 'Где применять фон' },
  scopeGlobal: { en: 'Everywhere', ru: 'Везде' },
  scopeInterface: { en: 'Interface', ru: 'Интерфейс' },
  scopeFullscreen: { en: 'Fullscreen', ru: 'Полноэкранный' },
  remove: { en: 'Remove', ru: 'Убрать' },
  playback: { en: 'Playback', ru: 'Воспроизведение' },
  resumeSession: { en: 'Resume last session', ru: 'Возобновлять сессию' },
  resumeSub: { en: 'Restore the queue on startup', ru: 'Восстанавливать очередь при запуске' },
  lyrics: { en: 'Lyrics', ru: 'Тексты' },
  geniusFallback: { en: 'Genius fallback', ru: 'Запасной Genius' },
  geniusSub: { en: 'Fetch plain lyrics from Genius when LRCLIB has none', ru: 'Брать текст из Genius, если нет в LRCLIB' },
  textSize: { en: 'Text size', ru: 'Размер текста' },
  scAccount: { en: 'SoundCloud account', ru: 'Аккаунт SoundCloud' },
  storage: { en: 'Storage', ru: 'Хранилище' },
  lyricsCache: { en: 'Lyrics cache', ru: 'Кэш текстов' },
  mixesCache: { en: 'Mixes cache', ru: 'Кэш миксов' },
  offlineCache: { en: 'Offline tracks', ru: 'Офлайн-треки' },
  offlineCacheSub: {
    en: 'Downloaded SoundCloud tracks play without internet.',
    ru: 'Скачанные треки SoundCloud играют без интернета.'
  },
  clearBtn: { en: 'Clear', ru: 'Очистить' },
  cleared: { en: 'Cleared', ru: 'Очищено' },
  rebuild: { en: 'Rebuild', ru: 'Пересобрать' },
  rebuilt: { en: 'Rebuilt', ru: 'Готово' },
  system: { en: 'System', ru: 'Система' },
  discord: { en: 'Discord', ru: 'Discord' },
  discordRpc: { en: 'Rich Presence', ru: 'Rich Presence' },
  discordSub: {
    en: 'Show what you’re listening to on your Discord profile.',
    ru: 'Показывать, что вы слушаете, в профиле Discord.'
  },
  discordAppId: { en: 'Application ID', ru: 'Application ID' },
  discordAppIdHint: {
    en: 'Create an app at discord.com/developers, then paste its Application ID here.',
    ru: 'Создайте приложение на discord.com/developers и вставьте его Application ID сюда.'
  },
  launchStartup: { en: 'Launch at startup', ru: 'Запуск при старте системы' },
  launchSub: { en: 'Open Latency when you sign in to Windows', ru: 'Открывать Latency при входе в Windows' },
  about: { en: 'About', ru: 'О приложении' },
  aboutText: {
    en: 'Latency is an advanced media player with visuals on par with the popular ones — written in pure vibecoding, so keep that in mind if you hit bugs or rough edges.',
    ru: 'Latency — это продвинутый медиаплеер с визуалом не уступающим популярным плеерам, написанный чистым вайбкодингом, так что если будут баги и недочёты — имейте это в виду.'
  },
  developers: { en: 'Developers', ru: 'Разработчики' },
  // activity
  yourStats: { en: 'Your stats', ru: 'Статистика' },
  tracksPlayed: { en: 'tracks played', ru: 'треков сыграно' },
  listeningTime: { en: 'listening time', ru: 'время прослушивания' },
  likedTracks: { en: 'liked tracks', ru: 'лайков' },
  topArtist: { en: 'top artist', ru: 'топ-артист' },
  recentActivity: { en: 'Recent activity', ru: 'Недавняя активность' },
  noActivity: { en: 'No activity yet — play something to get started.', ru: 'Активности пока нет — включите что-нибудь.' },
  played: { en: 'played', ru: 'сыграл' },
  sourcesLabel: { en: 'Sources', ru: 'Источники' },
  local: { en: 'local', ru: 'локальные' },
  // artist / mix
  followers: { en: 'followers', ru: 'подписчиков' },
  listeners: { en: 'monthly listeners', ru: 'слушателей в месяц' },
  similarArtists: { en: 'Fans also like', ru: 'Похожие артисты' },
  albums: { en: 'Albums', ru: 'Альбомы' },
  album: { en: 'Album', ru: 'Альбом' },
  albumsAndPlaylists: { en: 'Albums & playlists', ru: 'Альбомы и плейлисты' },
  searchAlbumsTitle: { en: 'Albums in search', ru: 'Альбомы в поиске' },
  searchAlbumsSub: { en: 'Show artist albums in search results', ru: 'Показывать альбомы артистов в поиске' },
  searchPlaylistsTitle: { en: 'Playlists in search', ru: 'Плейлисты в поиске' },
  searchPlaylistsSub: {
    en: 'Show editorial/user playlists in search results',
    ru: 'Показывать плейлисты (подборки) в поиске'
  },
  homeMixesTitle: { en: 'SoundCloud mixes on home', ru: 'Миксы SoundCloud на главной' },
  homeMixesSub: {
    en: 'Show the "Your Mixes" section on the home page',
    ru: 'Показывать секцию «Ваши миксы» на домашней'
  },
  myWaveBannerSub: {
    en: 'Endless personal radio from Yandex',
    ru: 'Бесконечное персональное радио Яндекса'
  },
  loadingTracks: { en: 'Loading tracks…', ru: 'Загрузка треков…' },
  noArtistTracks: { en: 'No tracks found for this artist.', ru: 'Треки артиста не найдены.' },
  dailyMix: { en: 'Daily mix · updates every day', ru: 'Ежедневный микс · обновляется каждый день' },
  // lyrics / fullscreen
  searchingLyrics: { en: 'Searching lyrics…', ru: 'Поиск текста…' },
  noLyrics: { en: 'No lyrics found for this track.', ru: 'Текст для этого трека не найден.' },
  checkedSources: { en: 'Checked LRCLIB & Genius', ru: 'Проверено в LRCLIB и Genius' },
  syncManually: { en: 'Sync manually', ru: 'Синхронизировать' },
  editSync: { en: 'Edit sync', ru: 'Изменить синхро' },
  resetLyrics: { en: 'Reset', ru: 'Сбросить текст' },
  manualSynced: { en: 'Manually synced', ru: 'Ручная синхронизация' },
  approxSync: { en: 'approximate sync', ru: 'примерная синхро' },
  plainLyricsNote: {
    en: 'Unsynced lyrics — tap “Sync manually” to time them',
    ru: 'Текст без синхронизации — нажмите «Синхронизировать», чтобы расставить тайминги'
  }
}

export function t(key: string, lang: Lang): string {
  const e = dict[key]
  return e ? e[lang] : key
}

export function useT(): (key: string) => string {
  const lang = usePlayer((s) => s.lang)
  return (key: string) => t(key, lang)
}
