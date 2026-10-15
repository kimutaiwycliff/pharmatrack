# ADR-015 — Receipt printers and barcode scanners on web, Android and desktop
**Status:** Accepted (built October 2026; awaiting hardware testing)

## Context
Pharmacies in Kenya use USB and Bluetooth barcode scanners and 58/80 mm thermal
receipt printers (Xprinter, Epson TM, Rongta, generic POS-58, Sunmi terminals'
built-in printers). Before this, scanning worked everywhere in keyboard (HID)
mode, but printing was the browser dialog (web/desktop) or a shared PDF
(Android), and staff had no way to see whether a device was connected. ADR-013
left the Android printer library open until there was a real printer to test.

## Decision
1. **One receipt format, every client.** `packages/core/src/printing` builds
   ESC/POS bytes (PC437 text folding, align/bold/size, cut, cash-drawer kick,
   QR) and lays the receipt out for 58 mm (32 cols) or 80 mm (48 cols). Clients
   only *transport* bytes. A plain-text preview of the same layout is shown in
   settings and unit-tested.
2. **One health model.** `printerHealth` reads ESC/POS `DLE EOT 1/2/4` replies
   (ready / paper low / out of paper / cover open / offline); printers that never
   answer show "connected" (we can't see their paper). `scannerHealth` uses a
   native connect signal where the platform has one (Android) and a last-scan
   heartbeat elsewhere (browsers block keyboard-device detection via WebHID).
   POS headers on all three clients show both as coloured badges.
3. **Transports.**
   - *Web:* the browser print dialog (default), or direct ESC/POS over **Web
     Serial** (Chrome/Edge: USB-serial and paired Bluetooth-SPP printers). Not
     WebUSB: on Windows the vendor driver owns USB printers.
   - *Android:* our own Expo module `apps/mobile/modules/pt-hardware` (Kotlin):
     Bluetooth SPP, USB host and raw TCP 9100, plus `InputManager`'s device
     listener for scanner connect/disconnect. Sunmi built-in printers are
     reached as the paired SPP device "InnerPrinter" — no vendor SDK. Community
     RN printer libraries were rejected (unmaintained, old architecture, or one
     brand only). App version 1.3.0 (native change → new APK; OTA bundles are
     scoped by version).
   - *Desktop (Tauri):* Rust commands in `src-tauri/src/printing.rs` — raw TCP,
     COM/tty ports (`serialport`) and installed printers sent RAW (Windows
     spooler via a minimal winspool FFI; CUPS `lp -o raw` elsewhere), with
     spooler status flags on Windows.
4. **Desktop IPC is scoped to exactly three commands.** The desktop window
   loads the hosted site, so printing needs Tauri IPC from a remote origin.
   `build.rs` declares `pt_list_printers`, `pt_print`, `pt_printer_status` as
   the app manifest; `capabilities/printing.json` grants only those three to
   `https://pharmatrack.co.ke`, `https://*.pharmatrack.co.ke` and the Offline
   Edition's `http://127.0.0.1:*` / `http://localhost:*`.
   `capabilities/default.json` (core permissions) stays local-only. A
   compromised page could at most list printers/COM ports and send bytes to a
   printer.
5. **Printer settings are per device** (localStorage on web/desktop, the local
   key-value store on Android) — each till has its own printer.

## Consequences
- Receipts print instantly with optional auto-print, copies and cash drawer.
- Untested against real hardware at the time of writing; see
  `docs/hardware-testing.md` for the acceptance checklist.
- Cheap printers' lack of status replies is a hardware limit, surfaced honestly
  in the UI ("connected", not "ready") rather than hidden.
