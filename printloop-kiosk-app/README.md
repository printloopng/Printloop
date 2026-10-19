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

The kiosk key and printer are entered on the settings screen. The PrintLoop
server address is built in (`https://api.printloop.app`).
The tenant is resolved by the backend from the kiosk API key (`X-Kiosk-Key`).

First run will show the settings screen for configuration.

## Environment Variables

See `.env.example`. `API_URL` there overrides the built-in server address for
development and staging only. Files are downloaded through
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

## License

Proprietary - PrintLoop SaaS v2