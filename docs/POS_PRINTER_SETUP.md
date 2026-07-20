# Thermal receipt printer setup (till PCs)

PharmaTrack prints receipts through the browser's own print function — there's no
bundled printer driver or agent. Printing is **always manual**: staff click
"Print" on the receipt only when a customer wants a paper copy, so paper isn't
wasted on sales where none is needed.

On a normal desktop browser, clicking Print opens the OS print-preview dialog.
On a dedicated till PC you can skip that dialog entirely — the click still has to
happen, but it goes straight to the printer instead of popping a preview window.

## One-time till setup

1. **Install the thermal printer's driver** and set it as the **default printer**
   for the till's OS user account (Windows/Linux/etc — whatever the till runs).
2. **Set the receipt paper width** in PharmaTrack under
   `Settings → Organization → Receipt Paper Width` (58mm or 80mm) to match the
   physical roll in that printer. This controls both the on-screen/print layout
   and the downloadable PDF.
3. **Launch the browser in kiosk-printing mode**, pointed at the POS page:

   ```bash
   # Chrome / Chromium (Windows, macOS, Linux)
   chrome --kiosk-printing --app=https://<your-domain>/pos
   ```

   `--kiosk-printing` makes `window.print()` (what the "Print" button calls)
   print immediately to the OS default printer with no dialog and no manual
   "Print" confirmation click inside the dialog.

4. **Verify**: ring up a test sale, click "Print" on the receipt, and confirm it
   comes out of the thermal printer at the correct width with no dialog
   appearing.

## Notes

- This is a till-configuration step, not an app feature — it doesn't change
  whether a receipt prints, only what happens when staff click "Print."
- If a till isn't launched with `--kiosk-printing`, clicking "Print" still works
  — it just shows the normal browser print dialog first.
- Direct printer integration (WebUSB/ESC-POS, bypassing the OS print system
  entirely) is not implemented. It would need its own ADR if a tenant's setup
  requires it (e.g. no fixed till PC, printing from a tablet).
