# PDFlab

A React Native document/PDF tools app with an Express backend — organized as a monorepo.

## Project Structure

```
/                 Root — monorepo scripts
├── app/          React Native frontend (Expo Router)
├── backend/      Express API server
├── components/   Shared React Native components
├── config/       Frontend configuration (API URLs, etc.)
├── services/     Frontend service layer
└── ...
```

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- Android Studio / Xcode (for mobile)

## Quick Start

### 1. Install everything

```bash
npm run install:all
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add your ANTHROPIC_API_KEY at minimum
```

### 3. Run both frontend + backend

```bash
npm run dev
```

## Individual Scripts

| Script                  | Description                             |
| ----------------------- | --------------------------------------- |
| `npm run dev`           | Run frontend + backend in parallel      |
| `npm run dev:app`       | Run Expo dev server only                |
| `npm run dev:backend`   | Run backend with auto-reload only       |
| `npm run start:backend` | Run backend (production mode)           |
| `npm run install:all`   | Install dependencies for root + backend |
| `npm run android`       | Build & run on Android device/emulator  |
| `npm run ios`           | Build & run on iOS simulator            |

## Configuring the Backend URL for Mobile Testing

The frontend reads the API URL from `app.json` → `expo.extra.apiUrl`.

**Default:** `http://localhost:5000/api` (for running in web browser or emulator)

### Local development with a real device

1. Make sure your phone and computer are on the **same Wi-Fi network**.
2. Find your computer's local IP address:
   - **Windows:** `ipconfig` → look for IPv4 Address (e.g. `192.168.1.42`)
   - **macOS/Linux:** `ifconfig` or `ip addr`
3. Update `app.json`:
   ```json
   "extra": {
     "apiUrl": "http://192.168.1.42:5000/api"
   }
   ```
4. Restart the Expo dev server (`npm run dev:app`).

### Local development with an emulator

For Android emulators use `10.0.2.2` (which maps to `localhost`):

```json
"extra": {
  "apiUrl": "http://10.0.2.2:5000/api"
}
```

## Backend

The backend is a standalone Express server located in `/backend`.

| Endpoint Group | Base Path         | Description                                    |
| -------------- | ----------------- | ---------------------------------------------- |
| PDF Tools      | `/api/pdf/*`      | 45+ PDF manipulation endpoints                 |
| Conversion     | `/api/convert/*`  | Format conversion (image↔PDF, text→PDF, etc.)  |
| AI             | `/api/ai/*`       | Document AI (summarize, translate, chat, etc.) |
| Documents      | `/api/document/*` | Document CRUD operations                       |
| Health         | `/health`         | Server status and memory info                  |

The backend binds to `0.0.0.0` by default so it is reachable from other devices on the LAN.

### Environment Variables

See [backend/.env.example](backend/.env.example) for the full list. Key variables:

| Variable            | Default   | Description              |
| ------------------- | --------- | ------------------------ |
| `PORT`              | `5000`    | Server port              |
| `HOST`              | `0.0.0.0` | Bind address             |
| `ANTHROPIC_API_KEY` | —         | Required for AI features |
| `FRONTEND_URL`      | `*`       | CORS origin              |
| `MAX_FILE_SIZE_MB`  | `50`      | Upload size limit        |

### Running the Backend

The backend runs locally as part of the monorepo:

- Entry point: `node src/server.js`
- Default port: `5000`
- Configurable via environment variables (see `.env.example`)
- Run with: `npm run dev:backend` (development) or `npm run start:backend` (production)

## EPUB Viewer (Internal Notes)

### Where the code lives

| File                             | Purpose                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `app/epub-viewer.tsx`            | Viewer screen — WebView with epub.js rendering, TOC modal, settings modal, progress bar   |
| `services/epubService.ts`        | URI normalisation, base64 reading, reading-progress & settings persistence (AsyncStorage) |
| `services/epubBundledScripts.ts` | Auto-generated base64 bundles of `jszip.min.js` and `epub.min.js` for offline WebView use |
| `scripts/bundle-epub-scripts.js` | Node script that regenerates `epubBundledScripts.ts` from `node_modules`                  |

### How file opening routes to the EPUB viewer

Files typed `"epub"` (by extension or MIME `application/epub+zip`) are routed to `/epub-viewer` with `{ uri, name }` params from three entry points:

1. **Home tab** (`app/(tabs)/index.tsx`) — `handleFilePress()`
2. **Library** (`app/library.tsx`) — extension check `".epub"`
3. **File details** (`app/file-details.tsx`) — `type === "epub"`

The route is registered in `app/_layout.tsx` as `<Stack.Screen name="epub-viewer" />`.

### Dependencies added for EPUB

| Package  | Why                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------- |
| `epubjs` | EPUB rendering engine; its minified dist is bundled as base64 in the WebView HTML for offline support |

> `jszip` and `react-native-webview` were already dependencies used by other features.

### Regenerating bundled scripts

After upgrading `epubjs` or `jszip`, run:

```bash
node scripts/bundle-epub-scripts.js
```

## Learn More

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Express 5.x](https://expressjs.com/)
