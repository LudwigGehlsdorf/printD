# printD

*Skriv ut på D-sektionens skrivare – sounds like "printed".*

A small web app that lets members upload a document and print it on the office
Canon i-SENSYS MF744Cdw. It runs on a Raspberry Pi 4 connected to the printer by USB;
anyone with a D-sektionen (Authentik) account can print, and every job is logged under
that account. Access can be narrowed to specific Authentik groups with
`PRINT_ALLOWED_GROUPS`.

```
Browser ──HTTPS──▶ Raspberry Pi (Next.js app + CUPS) ──USB──▶ Canon MF744Cdw
                         │
                         └──OIDC──▶ Authentik
```

- **Upload**: PDF, JPG/PNG, Word/Excel/PowerPoint/OpenDocument, text. Everything is
  converted to PDF first (images with pdf-lib, documents with LibreOffice) so the user
  can preview the result and see the page count before printing.
- **Options**: copies, colour / black & white, single / double-sided, page range.
- **Images** (JPEG, PNG, WebP, GIF, TIFF) get a live A4 preview with layout controls: fit,
  fill (crop), original size (from the image's DPI) or a custom size; orientation; margins;
  1, 2 or 4 per sheet; and drag to position/crop. The preview and the printed PDF use the
  same layout function (`web/src/lib/image-layout.ts`), so what you see is what prints.
  Phone photos are rotated upright on upload (EXIF orientation) with `sharp`.
- **Secure Print**: jobs are held on the printer until the user enters a PIN on its
  touchscreen (Canon's built-in Secure Print). The app generates a random PIN per job and
  shows it after printing, so nothing comes out unless someone is standing at the printer.
- **Log**: every job is stored in SQLite (`data/print.db`, table `jobs`) with who printed
  what and when. Users see their own recent jobs and can cancel queued ones.

The app lives in [`web/`](web).

## Running on a Mac

```sh
cd web
pnpm install
cp .env.example .env.local    # then edit it
pnpm dev                      # http://localhost:3000
```

For a first try, set `DEV_FAKE_USER=1` in `.env.local` to skip Authentik. With
`PRINT_MODE=dry-run` (the default) nothing is printed; each job's PDF and options are
written to `web/data/dry-run/`.

To convert Office documents, install LibreOffice (`brew install --cask libreoffice`).

To print for real from the Mac, plug the printer in, add it in System Settings →
Printers & Scanners, find its queue name with `lpstat -p`, and set
`PRINT_MODE=cups` and `PRINTER_NAME=<queue name>`.

## Authentik setup

1. **Applications → Providers → Create → OAuth2/OpenID Provider**
   - Client type: Confidential
   - Redirect URI: `https://<print host>/api/auth/callback/authentik`
     (add `http://localhost:3000/api/auth/callback/authentik` for local testing)
   - Scopes: keep the defaults (`openid`, `email`, `profile`). The default profile
     mapping includes the user's `groups`, which the app checks.
2. **Applications → Applications → Create**, link it to the provider.
3. If you restrict access to certain groups, you can also bind them to the application
   (Policy / Group / User Bindings) so others are stopped at Authentik too. The app
   checks `PRINT_ALLOWED_GROUPS` itself regardless.
4. Copy the Client ID, Client Secret and the provider's *OpenID Configuration Issuer*
   into `AUTH_AUTHENTIK_ID`, `AUTH_AUTHENTIK_SECRET` and `AUTH_AUTHENTIK_ISSUER`, and set
   optionally `PRINT_ALLOWED_GROUPS` (empty = every account may print).

## Secure Print and the Canon driver

Secure Print needs Canon's **UFR II driver** (Linux: "UFR II/UFRII LT Printer Driver for
Linux", ARM64 builds included; macOS: "UFR II/UFRII LT Printer Driver & Utilities for Mac").
The printer also speaks driverless IPP over USB (AirPrint), but that path cannot carry a PIN:
the printer does not support IPP `job-password` or job hold/release.

**Tested on macOS (2026-10-03):** a job sent with the options below shows up under
*Secure Print* on the printer, under the user name, and is released with the PIN.

| Option | Value |
| --- | --- |
| `CNColorMode` | `color` / `mono` |
| `CNDuplex` | `DuplexFront` / `None` (macOS PPD; defaults to 2-sided). Linux PPD uses `sides`/`Duplex`. |
| `CNJobExecMode` | `secured` |
| `CNUsrName` | the user's Authentik username (shown on the printer's screen) |
| `CNDocName` | the file name, ASCII only |
| `CNSecuredPrint` | the PIN, up to 7 digits. **Plain on macOS** (tested); base64 on Linux per the driver source (untested). |

Setting up the queue:

- Secure Print must be enabled on the queue, or the driver refuses held jobs:
  `lpadmin -p <queue> ... -o CNUseSecuredPrint=True`
- macOS opens its own AirPrint-over-USB connection to the printer whenever it is plugged in
  and recreates an AirPrint queue for it. While that is active, Canon's USB backend reports
  "The printer is offline". Pausing the AirPrint queue (`cupsdisable Canon_MF742C_744C`) and
  replugging the cable made it work. On the Pi, do not install `ipp-usb`.

Driver quirks:

- Canon's PPD sends PDFs straight to its own filter (`capdftopdl`), skipping CUPS's
  `pdftopdf`, so CUPS options like `page-ranges` are ignored. The app therefore builds the
  final PDF itself: only the selected pages (`selectPages`), and images laid out on A4
  (`imageToPdf`). Tested on the real printer (2026-10-03).

Limitations:

- Once the job data has reached the printer, CUPS marks it completed. The printer does not
  report when a held job is released, and UFR II jobs do not appear in its IPP job list, so
  the app's final status is "Skickad till skrivaren". PINs are listed for
  `SECURE_PRINT_HOLD_HOURS` after sending.
- Held jobs cannot be deleted from the app; they stay in the printer until they expire or are
  deleted on its screen.
- Still to check: how long the printer keeps held jobs (set `SECURE_PRINT_HOLD_HOURS` to match).

## Raspberry Pi

To be written (phase 5): Raspberry Pi OS 64-bit, CUPS with Canon's UFR II driver over USB,
LibreOffice, a systemd service and Caddy for HTTPS.
