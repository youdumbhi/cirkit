# Cirkit

Cirkit is a browser-based digital logic playground for building, simulating, and sharing circuits. It combines a TypeScript/Vite frontend with a small Express backend so you can work locally, save projects to an account, and publish reusable ICs through a shared library.

## Features

- Drag logic components onto a grid workspace and wire them together
- Build with inputs, gates, sequential elements, displays, and output devices
- Create custom ICs from existing circuits and add them back to the palette
- Export and import circuits as `.json` files
- Sign in with Google to save circuits, recover drafts, and manage shared work
- Share circuits with `private`, `preview`, or `open` visibility
- Browse community circuits and publish/import reusable ICs through the IC Library

## Stack

- Vite + TypeScript frontend
- Express backend
- JSON-backed persistence

## Getting Started

Install dependencies:

```bash
npm install
npm --prefix server install
```

Run the full app locally:

```bash
npm run dev:full
```

Default local ports:

- frontend: `http://localhost:5173`
- backend: `http://localhost:4000`

You can also run each side separately:

```bash
npm run dev:client
npm run dev:server
```

## Build and Preview

Build both client and server:

```bash
npm run build:full
```

Start the built app:

```bash
npm run start:full
```

Other useful commands:

```bash
npm run build:client
npm run build:server
npm run preview
npm run start:server
```

## Environment

Frontend `.env` example:

```bash
VITE_API_BASE=http://localhost:4000
VITE_GOOGLE_CLIENT_ID=
```

Backend `server/.env` example:

```bash
PORT=4000
GOOGLE_CLIENT_ID=
# CIRKIT_STORAGE_DIR=
# CIRKIT_STORAGE_FILE=
# CIRKIT_BUNDLED_DATA_FILE=
# CIRKIT_SITE_KEY=
```

Notes:

- Set both Google client ID values if you want Google sign-in enabled.
- If `VITE_API_BASE` is omitted, the client falls back to `/api` or `/cirkit/api` based on the configured base path.
- Local Google sign-in works best on `localhost`.

## Project Layout

- `src/main.ts`: frontend workspace and app UI
- `src/style.css`: styling
- `server/src/index.ts`: backend API
- `server/src/storage.ts`: JSON persistence
- `server/src/builtin-content.ts`: bundled example and library content

## Deployment Notes

The project supports both root deployments and deployments under `/cirkit/`. In development, set `CIRKIT_BASE=/cirkit/` if you want the dev server to emulate the `/cirkit/` base path.
