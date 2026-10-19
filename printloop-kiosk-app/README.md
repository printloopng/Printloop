# PrintLoop Kiosk App

Electron-based touchscreen UI for PrintLoop self-service printing kiosks.

## Features

- Full-screen kiosk mode
- 6-character code entry via on-screen keypad
- Job details display (pages, cost, paper size)
- PWG-Raster printing via IPP to local CUPS
- Polls the cloud every 10s for released jobs (doubles as the heartbeat)
- Settings management (API key, printer selection)
- Cross-platform: Windows (NSIS installer), Linux (AppImage), macOS (DMG)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ PrintLoop Kiosk App (Electron)                                  │
│ ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│ │ Main Process    │    │ Renderer        │    │ Preload      │ │
│ │ - Job poller    │◄───│ (React UI)      │◄───│ (IPC Bridge) │ │
│ │ - IPP Printing  │    │ - Code Entry    │    │              │ │
│ │ - File download │    │ - Job Details   │    │              │ │
│ │ - Printer Enum  │    │ - Printing      │    │              │ │
│ │ - Settings      │    │ - Settings      │    │              │ │
│ └────────┬────────┘    └─────────────────┘    └──────────────┘ │
│          │                                                │      │
│          ▼                                                ▼      │
│ ┌─────────────────┐                              ┌──────────┐ │
│ │ Local CUPS      │◄────────────── IPP ──────────│ Printer  │ │
│ │ (cups-local,    │                              │ (Network │ │
│ │  cups-browsed,  │                              │  or USB) │ │
│ │  ipp-usb)       │                              └──────────┘ │
│ └─────────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Start development (with hot reload)
npm run dev

# Build for production
npm run build

# Package for Windows
npm run package

# Package for Linux
npm run package:linux
```

## Configuration

The kiosk stores settings in `kiosk-settings.json` in the app data directory:

```json
{
  "apiKey": "kiosk_...",
  "printerUri": "ipp://localhost:60000/ipp/print",
  "pollInterval": 10000,
  "kioskName": "Main Kiosk"
}
```

Set `API_URL` in `.env` (required). Tenant is resolved by the backend from the
kiosk API key (`X-Kiosk-Key`).

First run will show the settings screen for configuration.

## Environment Variables

See `.env.example` — only `API_URL` is required. Files are downloaded through
short-lived signed URLs from the API, so the kiosk holds no storage credentials.

## Building Installers

### Windows (NSIS)
```bash
npm run package
# Output: dist/PrintLoop Kiosk Setup x.x.x.exe
```

### Linux (AppImage)
```bash
npm run package:linux
# Output: dist/PrintLoop-Kiosk-x.x.x.AppImage
```

## Printing Flow

The kiosk gets work from the cloud with one call, `POST /api/agent/poll`
(header `X-Kiosk-Key`), every `pollInterval` (10s). The API speeds this up to
2s while jobs are queued.

1. Customer pays online and gets a pickup code. Job is **READY**.
2. Customer types the code on the kiosk (or staff release it from the
   dashboard). Job is **RELEASING**, i.e. queued for this kiosk.
3. The next poll claims it atomically: **PRINTING**. The response carries the
   job, its files (signed download URLs) and queue counts.
4. Kiosk downloads each file (PDF, or pre-rendered PWG-Raster) and submits
   it to the printer over IPP with copies / sides / colour / paper.
5. Kiosk reports page progress, then `complete` → **DONE**. The customer
   sees each step on their jobs page.

Failure handling:

- Printer unreachable or stopped → the kiosk stops claiming (`max: 0`);
  jobs wait in the queue.
- Transient fault before anything printed → `failed` with
  `retryable: true` → job goes back to the queue instead of FAILED.
- Kiosk restarts mid-job → its next poll no longer lists the job in
  `inFlight`, so the API requeues it after 60s.
- Shop refunds or cancels a job mid-print → the poll returns it in
  `revoked`; the kiosk stops sending its remaining files.

Main-process code: `src/main/jobPoller.ts` (poll + print worker),
`src/main/ipp.ts` (printer I/O), `src/main/printJob.ts` (walk-up code flow).

## Printer Setup

Enter the printer's IPP address in settings, e.g.
`ipp://192.168.1.50/ipp/print` (network printer) or
`ipp://localhost:631/printers/<queue>` (local CUPS). **Check Printer**
queries it with Get-Printer-Attributes.

The API must run with `PRINT_DISPATCH_MODE=kiosk-pull` (or the
`printDispatchMode` system setting) for releases to go through the kiosk.

## License

Proprietary - PrintLoop SaaS v2