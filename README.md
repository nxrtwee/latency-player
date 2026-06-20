# latency player

Десктопный медиаплеер (Electron + Vite + React + TypeScript) с архитектурой
подключаемых источников воспроизведения (`PlaybackProvider`).

## Возможности

- **Локальные файлы** — скан папок, теги и обложки (`music-metadata`).
- **SoundCloud** — поиск и стрим через публичный API; progressive (MP3) и HLS
  (через `hls.js`).
- **Your Likes** — лайки для треков любого источника.
- **Плейлисты** — создание/переименование/удаление, добавление треков из любого
  источника (поповер «+»).
- **Очередь** восстанавливается после перезапуска (на паузе).
- Плеер-бар: play/pause, prev/next, перемотка, громкость, shuffle, repeat,
  обложка и лайк текущего трека.

## Запуск

```bash
npm install
npm run dev        # дев-режим с hot-reload
```

> Если `npm run dev` падает с `Error: Electron uninstall` — бинарник Electron не
> распаковался при установке. Лечится так:
> ```bash
> node node_modules/electron/install.js
> # если dist всё ещё неполный — распаковать кэшированный zip вручную:
> #   unzip "$LOCALAPPDATA/electron/Cache/<hash>/electron-*.zip" -d node_modules/electron/dist
> #   printf 'electron.exe' > node_modules/electron/path.txt
> ```

## Сборка

```bash
npm run build      # main + preload + renderer в out/
npm run typecheck  # проверка типов (node + web)
npm run dist:win   # установщик (NSIS) + портативный exe в release/
```

> Для `dist:win` нужен включённый **Developer Mode** Windows (Параметры → Для
> разработчиков), иначе electron-builder падает при распаковке winCodeSign с
> `Cannot create symbolic link`. Сборка идёт с `CSC_IDENTITY_AUTO_DISCOVERY=false`
> (без подписи). Результат — в `release/`: `*-x64.exe` (установщик),
> `*-portable.exe`, `win-unpacked/`.

## Архитектура

```
src/
  shared/types.ts          — общие типы (Track, LibraryState, Playlist)
  main/
    index.ts               — окно, IPC, протокол media:// для локальных файлов
    library.ts             — скан папок, теги и кэш обложек (music-metadata)
    soundcloud.ts          — client_id, поиск, резолв стрима (progressive/HLS)
    likes.ts               — персист лайков (userData/likes.json)
    playlists.ts           — персист плейлистов (userData/playlists.json)
  preload/index.ts         — безопасный мост window.api (contextBridge)
  renderer/src/
    providers/
      types.ts             — интерфейс PlaybackProvider / PlaybackHandle
      local.ts             — локальные файлы (HTMLAudioElement)
      soundcloud.ts        — SoundCloud (progressive + HLS через hls.js)
      registry.ts          — реестр провайдеров (единая точка расширения)
    store.ts               — zustand-стор: источники, лайки, плейлисты, плеер,
                             персист очереди
    components/             — Sidebar, TrackList, PlayerBar, PlaylistMenu, Icons
```

### Как добавить новый источник (например SoundCloud)

1. Реализовать `PlaybackProvider` в `src/renderer/src/providers/soundcloud.ts`.
2. Зарегистрировать его в `registry.ts`.
3. Отдавать треки с `providerId: 'soundcloud'` и нужным `uri`.

Ядро (стор, UI, очередь) не меняется — оно работает с любым провайдером.

## Границы по легальности

- **Локальные файлы** — без ограничений.
- **SoundCloud** — через публичный API/стрим-URL.
- **Spotify / YouTube** — только официальные SDK/embed (без риппинга потока).
- Обход DRM и риппинг защищённого аудио (Spotify/Яндекс) в проекте не делается.
