# Hardware testing checklist — printers and scanners (ADR-015)

Everything below was built without devices. Unit tests cover the receipt bytes,
layout and status parsing; these steps confirm it on real hardware. Tick each
box and note the model. Settings live under **Settings → Printer & scanner** on
every client (saved per device).

Suggested kit: P58E (58 mm Bluetooth + USB), Xprinter XP-T80A or Q80A (80 mm
USB + LAN), Epson TM-T20III (status reporting), a 2D Bluetooth/USB scanner, a
cash drawer with an RJ11 cable, and an Android phone or tablet (plus a Sunmi
V2s if available).

## 1. Receipt layout (no printer needed)
- [ ] Web, Android and desktop: **Preview sample receipt** at 58 mm and 80 mm —
      columns line up, totals are right-aligned, nothing wraps oddly.

## 2. Web (Chrome or Edge)
- [ ] **Browser print dialog** mode: Print from the receipt → the paper size is
      58/80 mm (not A4), and only the receipt prints.
- [ ] **Direct** mode, USB printer that shows up as a COM port: Choose printer →
      Print test page → prints; the badge shows "Printer connected/ready".
- [ ] **Direct** mode, paired Bluetooth printer (pair it in Windows/Android
      first) → test page prints.
- [ ] Wrong speed: set 115200 on a 9600 printer → garbage → set 9600 → fine.
- [ ] Auto-print on: a sale prints without a click. Copies 2 → two cut receipts.
- [ ] Cash drawer on: a cash sale opens it; an M-Pesa sale doesn't.
- [ ] Unplug or switch off the printer → within 30 s the POS badge turns red
      "Printer offline". Print → a clear error, with "Use print dialog".
- [ ] Epson: open the cover → "Cover open"; run out of paper → "Out of paper".
- [ ] Scanner: scan in the **Test your scanner** box → GTIN shown; the POS badge
      turns green "Scanner working · last scan just now". A GS1 DataMatrix pack
      shows batch and expiry.

## 3. Android app (version 1.3.0+, new APK)
- [ ] Settings → Printer & scanner → **Find printers** lists the paired
      Bluetooth printer (allow "Nearby devices" when asked).
- [ ] Bluetooth printer: select → test page prints → badge "Printer ready" or
      "Printer connected".
- [ ] USB printer via OTG: Find printers → select → tap **Allow** → test page.
- [ ] Network printer: enter its IP (FEED button at power-on prints it) →
      Use network printer → test page.
- [ ] Sunmi terminal: "Built-in printer" appears → test page.
- [ ] Receipt screen: **Print receipt** prints; auto-print prints on sale
      complete; reprint from Sales history works.
- [ ] Switch the printer off → POS badge turns red; switch on → green again
      within ~30 s or after reopening the app.
- [ ] Turn Bluetooth off → "Bluetooth is off" message, not a crash.
- [ ] Scanner: pair a Bluetooth scanner → the POS badge shows "Scanner
      connected" (green) at once; switch it off → "Scanner disconnected" (red).
- [ ] A phone with no scanner shows no scanner badge (camera only).
- [ ] An older APK (≤ 1.2) shows "Update the app to print directly" and the
      PDF/WhatsApp share still works.

## 4. Desktop app (Windows)
- [ ] Settings → Printer & scanner → **PharmaTrack desktop app printer** is
      selectable (it is greyed out in a normal browser).
- [ ] Installed USB printer (Windows driver) → select under "Installed
      printers" → test page prints with correct formatting (RAW).
- [ ] Bluetooth printer paired in Windows → its outgoing COM port appears
      under "USB / Bluetooth (COM ports)" → test page.
- [ ] Network printer by IP → test page.
- [ ] Unplug the USB printer → badge "Printer offline" (Windows spooler).
- [ ] Out of paper on an Epson → "Out of paper".
- [ ] Offline Edition build: the same printer options work.

## Known limits
- Cheap printers often don't answer status requests: the badge says
  "Printer connected" and can't show paper-out.
- Browsers can't see whether a scanner is plugged in; web/desktop show the last
  scan time instead. Android shows real connect/disconnect.
- Scanners must be in keyboard (HID) mode with an Enter suffix and US layout.
