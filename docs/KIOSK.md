# PrintLoop kiosk — install guide

Set up a shop computer to receive jobs from the PrintLoop cloud and
drive the local printer. The product path is **`printloop-kiosk-app/`**
(Electron) — it includes the touchscreen UI **and** cloud poll + print
dispatch. There is no separate headless agent anymore.

---

## Before you start

You need three pieces from a PrintLoop platform admin:

1. **Cloud URL** — e.g. `https://api.printloop.app`
2. **Kiosk API key** — Admin → Kiosks → "Add kiosk" (treat like a password)
3. **Printer details** — depending on transport:
   - **spooler** (recommended): printer already works from Word/browser on that PC
   - **ipp**: printer LAN IP
   - **raw9100**: LAN IP (Sharp MX / JetDirect-only)

---

## Windows

```powershell
cd printloop-kiosk-app
npm install
npm run package
# Installer lands in printloop-kiosk-app\dist\
```

Run the Setup.exe, then open **PrintLoop Kiosk**. First launch walks
you through cloud URL, kiosk key, and printer. Re-open setup later with
**Ctrl+Shift+S**. Quit with **Ctrl+Shift+Q**.

Optional helpers on the PC: SumatraPDF (faithful PDF spool) and
Ghostscript (PDF→PostScript fallback).

---

## Linux

```bash
cd printloop-kiosk-app
npm install
npm run package:linux
# Install the .AppImage / .deb / .rpm from dist/
```

Needs CUPS (`lp`) on the machine. First launch uses the same setup wizard.

---

## Transports

| Transport | When to use |
|---|---|
| `spooler` | Default. Any printer already installed on the OS |
| `ipp` | Network printer that speaks IPP |
| `raw9100` | Sharp MX / JetDirect-only devices |

Configured in the kiosk setup wizard (or kiosk settings).

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Kiosk offline in admin | Cloud URL + API key; PC has outbound HTTPS |
| Jobs stuck READY | Kiosk running and heartbeating; printer online |
| Blank / wrong prints | Prefer `spooler` + SumatraPDF; verify OS print works first |
| Can't open setup | Ctrl+Shift+S; or wipe kiosk local settings and relaunch |

Admin console: **Kiosks** shows online/offline from heartbeats.
Jobs: status should move READY → PRINTING → PRINTED after the kiosk
claims them.
