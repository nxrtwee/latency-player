# Latency

Десктопный медиаплеер уровня Spotify, написанный с нуля на **Electron + Vite +
React + TypeScript**. В основе — архитектура подключаемых источников
воспроизведения (`PlaybackProvider`): локальные файлы и SoundCloud работают через
единое ядро, новый источник добавляется реализацией одного интерфейса.

Собственный UI (тёмная тема, неоновый акцент, кастомная рамка окна), реактивный
визуализатор, караоке-тексты (LRCLIB + Genius), персональные миксы и гибкое
оформление. Кроссплатформенно: десктоп (Windows) + мобильные порты (iOS, Android)
через Capacitor.

Написан чистым вайбкодингом — [icountedtheblink](https://github.com/nxrtwee) и Claude.

## Загрузки

Готовые сборки — на вкладке **[Releases](../../releases/latest)**:

| Платформа | Файл | Установка |
|-----------|------|-----------|
| **Windows** | `Latency-<версия>-x64.exe` (установщик) или `-portable.exe` | запустить установщик |
| **Android** | `Latency.apk` | включить «установка из неизвестных источников» → открыть APK |
| **iOS** | `Latency-unsigned.ipa` | подписать своим Apple ID через [AltStore](https://altstore.io/) / [Sideloadly](https://sideloadly.io/) (бесплатный аккаунт — перевыпуск раз в 7 дней) |

> ⚠️ **О мобильных версиях.** Плеер разрабатывался **исключительно для десктопа**.
> Мобильные порты (а тем более Android) сделаны «для галочки» — чтобы проект был
> кроссплатформенным. Они рабочие, но местами сырые: если встретите баги или
> недочёты в iOS/Android-версиях, имейте это в виду. Эталонный опыт — на десктопе.

## Возможности

- **Локальные файлы** — скан папок, чтение тегов и обложек (`music-metadata`),
  отдача через собственный протокол `media://`.
- **SoundCloud** — поиск треков и артистов, стрим через публичный API:
  progressive (MP3) и **HLS** (через `hls.js`); `client_id` подбирается
  автоматически; вход в аккаунт → персональные миксы и лайки.
- **Поиск по строчке** — помните фрагмент песни? Вкладка «Поиск» →
  режим «По строчке»: Genius → находим трек на SoundCloud.
- **10-полосный эквалайзер** — Web Audio BiquadFilter, 7 пресетов (Flat, Bass,
  Vocal, Electronic…), локальные файлы и SoundCloud.
- **Discord Rich Presence** — название трека и обложка в профиле Discord.
- **Комментарии SoundCloud** — вкладка с обложкой, визуализатором и всплывающими
  комментариями по таймкодам (как на оригинальном сайте SC).
- **Автопилот** — когда очередь кончается, плеер сам находит похожие треки и
  продолжает играть без остановки.
- **Офлайн-кэш** — скачанные треки SoundCloud играют без интернета, вкладка
  «Скачанное» в сайдбаре.
- **Единое ядро** — очередь, плеер-бар, лайки, плейлисты не зависят от источника.
- **Библиотека** — Home, поиск, артисты, плейлисты, «Любимое», недавнее.
- **Караоке-тексты** — LRCLIB (синхронные) + Genius (фолбэк), ручная синхронизация.
- **Визуализатор**, кастомные обои/акценты, караоке в полноэкранном плеере.
- Drag-and-drop и фильтр в панели очереди.
- Два языка: English / Русский.

## Разработка

```bash
npm install
npm run dev        # десктоп, дев-режим с hot-reload
npm run dev:mobile # мобильный таргет в браузере (http://127.0.0.1:5273)
```

> Если `npm run dev` падает с `Error: Electron uninstall` — бинарник Electron не
> распаковался при установке: `node node_modules/electron/install.js`.

## Сборка

```bash
npm run build      # main + preload + renderer в out/
npm run typecheck  # проверка типов (node + web)
npm run dist:win   # установщик (NSIS) + портативный exe в release/
```

> Для `dist:win` локально на Windows нужен включённый **Developer Mode** (иначе
> electron-builder падает на распаковке winCodeSign с `Cannot create symbolic
> link`). В CI собирается автоматически — см. ниже.

### Релизы (CI)

Все три артефакта собираются в облаке GitHub Actions и публикуются в Release при
пуше тега `v*`:

- **Windows** — `windows-latest`, electron-builder (NSIS + portable);
- **Android** — `ubuntu-latest`, Capacitor + Gradle (debug-APK, ставится сразу);
- **iOS** — `macos`, Capacitor + xcodebuild (неподписанный `.ipa`, подпись при
  сайдлоаде).

Мобильная обвязка (нативные правки, фоновое аудио, иконки) описана в
[`mobile/README.md`](mobile/README.md), [`mobile/android-notes.md`](mobile/android-notes.md)
и [`mobile/ios-notes.md`](mobile/ios-notes.md).

## Архитектура

```
src/
  shared/types.ts          — общие типы (Track, LibraryState, Playlist)
  main/
    index.ts               — окно, IPC, протокол media:// для локальных файлов
    library.ts             — скан папок, теги и кэш обложек (music-metadata)
    soundcloud.ts          — client_id, поиск, резолв стрима (progressive/HLS)
    lyrics.ts              — тексты (LRCLIB + Genius) + поиск по строчке
    discord.ts             — Discord Rich Presence (IPC-протокол)
    offline.ts             — офлайн-кэш SoundCloud-треков
    likes.ts / playlists.ts — персист в userData
  preload/index.ts         — безопасный мост window.api (contextBridge)
  renderer/src/
    providers/             — PlaybackProvider: local, soundcloud, registry
    store.ts               — zustand-стор: источники, лайки, плейлисты, плеер
    components/             — Sidebar, TrackList, PlayerBar, CommentsPage, Equalizer, …
mobile/                     — Capacitor-таргет (iOS + Android), реюз renderer
```

### Как добавить новый источник

1. Реализовать `PlaybackProvider` в `src/renderer/src/providers/<источник>.ts`.
2. Зарегистрировать его в `registry.ts`.
3. Отдавать треки с нужным `providerId` и `uri`.

Ядро (стор, UI, очередь) не меняется — оно работает с любым провайдером.

## Границы по легальности

- **Локальные файлы** — без ограничений.
- **SoundCloud** — через публичный API/стрим-URL и личный OAuth-токен самого
  пользователя (хранится только локально, в репозиторий не попадает).
- Обход DRM и риппинг защищённого аудио (Spotify/Яндекс) в проекте не делается.

## Лицензия

MIT
