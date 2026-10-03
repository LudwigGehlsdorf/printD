<div align="center">

# printD

**Print from your browser to D-sektionen's printer.**

Upload a document, check the preview, pick your settings and collect it at the printer with a PIN.

</div>

---

printD is a simple print server for the printer of [D-sektionen](https://dsek.se), the
computer science and engineering guild at LTH. Members log in with their D-sektionen
account, upload a file and print it. Every job waits in the printer until its owner enters a
PIN on the printer's screen, so nothing is left lying in the tray.

It runs on a Raspberry Pi connected to the guild's Canon i-SENSYS MF744Cdw, but works with
any printer that has a CUPS driver (without Secure Print, jobs simply print right away).

## Features

- **Log in with Authentik:** anyone with an account can print, or limit it to certain groups.
- **Upload almost anything:** PDF; JPEG, PNG, WebP, GIF and TIFF images; Word, Excel,
  PowerPoint, OpenDocument and plain-text files (converted with LibreOffice).
- **See before you print:** page thumbnails; click a page to skip it.
- **Print settings:** copies, colour or black & white, single- or double-sided.
- **Image layout with a live preview:** fit, fill (crop) or original size; orientation;
  margins; 1, 2 or 4 per sheet; drag the image to position it. The preview uses the same
  layout code as the printed PDF, so what you see is what you get.
- **Secure Print:** a random PIN per job, shown on screen and in your job list.
- **Print log:** every job is recorded with who printed what and when. Users can cancel
  queued jobs and hide old ones from their list.
- **Phone friendly:** works on any screen size, in light and dark mode. Swedish interface
  styled after [dsek.se](https://dsek.se).

## How it works

```
                 HTTPS                        USB
  Browser ─────────────────▶ printD server ─────────▶ Printer
                              (Next.js + CUPS)
                                   │
                                   └── OIDC login ──▶ Authentik
```

1. The browser uploads a file. The server converts it to PDF (images are kept as images until
   printing, so their layout can still be changed).
2. The user picks settings in the browser. Thumbnails and the image preview are drawn in the
   browser, so the server does little work.
3. On *Skriv ut*, the server builds the final PDF itself (only the selected pages, images laid
   out on A4) and hands it to CUPS together with a random Secure Print PIN.
4. Canon's driver sends the job to the printer, which holds it until the PIN is entered.

**Built with** [Next.js](https://nextjs.org), [Auth.js](https://authjs.dev),
[pdf-lib](https://pdf-lib.js.org), [pdf.js](https://mozilla.github.io/pdf.js/),
[sharp](https://sharp.pixelplumbing.com), SQLite, CUPS, LibreOffice and
[Caddy](https://caddyserver.com).

## Getting started

Run printD locally to try it out or work on it. By default it runs in *test mode*: nothing
is sent to a printer, and each job's PDF and settings are saved to `web/data/dry-run/` instead.

### Prerequisites

- [Node.js](https://nodejs.org) 20 or newer
- [pnpm](https://pnpm.io) (`corepack enable` sets it up)
- Optional: [LibreOffice](https://www.libreoffice.org), to convert Office documents
- Optional: CUPS with a printer queue, to print for real (see [Printer setup](#printer-setup))

### Quick start

1. Clone the repository and install the dependencies:

   ```sh
   git clone <repository URL> printd
   cd printd/web
   pnpm install
   ```

2. Create your local settings file:

   ```sh
   cp .env.example .env.local
   ```

   It already points at D-sektionen's public development login, which accepts
   `http://localhost` only. To skip logging in altogether, uncomment `DEV_FAKE_USER=1`.

3. Start the development server:

   ```sh
   pnpm dev
   ```

4. Open <http://localhost:3000>, log in and print something. With `PRINT_MODE=dry-run`
   the result ends up in `web/data/dry-run/`.

To print for real, set up a printer queue as described in [Printer setup](#printer-setup)
and set `PRINT_MODE=cups` and `PRINTER_NAME` in `.env.local`.

## Configuration

printD is configured with environment variables: `web/.env.local` during development, and
`/etc/printd/printd.env` in production (see [`deploy/printd.env.example`](deploy/printd.env.example)).

| Variable | Default | Description |
| --- | --- | --- |
| `AUTH_SECRET` | – | Random secret for login sessions. Generate with `openssl rand -base64 33`. |
| `AUTH_AUTHENTIK_ID` | – | Client ID of the Authentik provider. |
| `AUTH_AUTHENTIK_SECRET` | – | Client secret (empty for public clients). |
| `AUTH_AUTHENTIK_ISSUER` | – | The provider's *OpenID Configuration Issuer* URL. |
| `AUTH_TRUST_HOST` | – | Set to `true` when running behind a reverse proxy. |
| `PRINT_ALLOWED_GROUPS` | *(empty)* | Comma-separated Authentik groups that may print; subgroups count (`dsek.infu` includes `dsek.infu.mdlm`). Empty: every account. |
| `PRINT_MODE` | `dry-run` | `cups` to print, `dry-run` to save PDFs to `DATA_DIR/dry-run` instead. |
| `PRINTER_NAME` | `Canon_MF744Cdw` | CUPS queue name (`lpstat -p` lists them). |
| `PRINTER_DRIVER` | `ufr2` | `ufr2` for Canon's UFR II driver, `ipp` for a driverless (IPP Everywhere / AirPrint) queue. |
| `SECURE_PRINT` | `true` | Hold jobs on the printer until the PIN is entered. Needs `PRINTER_DRIVER=ufr2`. |
| `SECURE_PRINT_PIN_LENGTH` | `4` | PIN length, 4–7 digits. |
| `SECURE_PRINT_HOLD_HOURS` | `4` | How long a PIN is shown after sending. Match the printer's Secure Print deletion time. |
| `SECURE_PRINT_PIN_ENCODING` | *depends* | How the PIN is passed to Canon's driver: `base64` or `plain`. Defaults to what the driver build for the current platform expects. |
| `MAX_UPLOAD_MB` | `50` | Largest accepted upload. |
| `MAX_COPIES` | `50` | Most copies per job. |
| `UPLOAD_TTL_MINUTES` | `60` | Uploads that are never printed are deleted after this. |
| `DATA_DIR` | `./data` | Database, uploads and test-mode output. |
| `SOFFICE_PATH` | *auto* | Path to LibreOffice's `soffice`, if it is not found automatically. |
| `DEV_FAKE_USER` | – | `1` skips login during development. Ignored in production. |

## Authentik setup

printD logs users in with OpenID Connect. In Authentik:

1. Go to **Applications → Providers → Create** and choose **OAuth2/OpenID Provider**.
   - **Client type:** Confidential
   - **Redirect URI:** `https://<your printD host>/api/auth/callback/authentik`
   - **Scopes:** keep the defaults (`openid`, `email`, `profile`). The default profile
     mapping includes the user's `groups`, which printD uses for `PRINT_ALLOWED_GROUPS`.
2. Go to **Applications → Applications → Create** and link it to the new provider.
3. Copy the provider's **Client ID**, **Client Secret** and **OpenID Configuration Issuer**
   into `AUTH_AUTHENTIK_ID`, `AUTH_AUTHENTIK_SECRET` and `AUTH_AUTHENTIK_ISSUER`.
4. *Optional:* if only some groups may print, bind them to the application as well, so others
   are stopped at Authentik already. printD checks `PRINT_ALLOWED_GROUPS` either way.

The name shown next to a job on the printer's screen is the user's Authentik username.

## Printer setup

printD prints through [CUPS](https://openprinting.github.io/cups/). Secure Print needs
**Canon's UFR II driver** ("UFR II/UFRII LT Printer Driver", available for Linux including
ARM64, and for macOS); driverless queues cannot carry a PIN. The production setup script
installs the driver and creates the queue automatically. To do it by hand:

1. Install Canon's UFR II driver for your platform from Canon's support site.
2. Find the printer's USB address:

   ```sh
   lpinfo -v | grep -i canon
   # direct usb://Canon/MF742C/744C%20UFR%20II?serial=…
   ```

3. Create a queue with Canon's PPD for the MF742C/744C and **enable Secure Print** on it:

   ```sh
   sudo lpadmin -p printd -E -v "<usb address>" -P <path to the MF742C/744C PPD> \
     -o printer-is-shared=false
   lpoptions -p printd -l | grep -i secur      # if a Secure Print option is listed:
   sudo lpadmin -p printd -o CNUseSecuredPrint=True
   ```

4. Make sure no other program holds the printer's USB connection (see
   [Troubleshooting](#troubleshooting)).
5. Set `PRINTER_NAME=printd`, `PRINTER_DRIVER=ufr2` and `SECURE_PRINT=true`.

For each job, printD sends these Canon options with `lp`:

| Option | Value |
| --- | --- |
| `CNColorMode` | `color` / `mono` |
| `CNDuplex`, `sides` | double- or single-sided (driver builds use one or the other) |
| `CNJobExecMode` | `secured` |
| `CNUsrName` | the user's username, shown on the printer's screen |
| `CNDocName` | the file name (ASCII only) |
| `CNSecuredPrint` | the PIN (see `SECURE_PRINT_PIN_ENCODING`) |

## Deployment

printD runs well on a small server such as a **Raspberry Pi 4 (2 GB RAM or more)** connected
to the printer by USB. The scripts in [`deploy/`](deploy) set up a Debian-based system (for
example 64-bit Raspberry Pi OS) from scratch:

| File | Purpose |
| --- | --- |
| [`setup-pi.sh`](deploy/setup-pi.sh) | One-time setup. Safe to run again: it only does what is still missing. |
| [`update.sh`](deploy/update.sh) | Pulls the latest version, rebuilds and restarts. |
| [`printd.env.example`](deploy/printd.env.example) | Production settings, installed as `/etc/printd/printd.env`. |
| [`printd.service`](deploy/printd.service) | systemd service: runs printD as user `printd` on `127.0.0.1:3000`. |
| [`Caddyfile`](deploy/Caddyfile) | HTTPS reverse proxy with automatic certificates. |

### 1. Prepare the server

Install a 64-bit Debian-based OS, enable SSH, connect the server to the network and the
printer by USB, and turn the printer on.

### 2. Run the setup script

```sh
sudo apt-get install -y git
sudo git clone <repository URL> /opt/printd
sudo /opt/printd/deploy/setup-pi.sh
```

The script:

- installs CUPS, LibreOffice, fonts, Node.js 22 and Caddy
- downloads Canon's UFR II driver and verifies its checksum
- blocks `ipp-usb`, which would otherwise take over the printer's USB connection
- creates the `printd` user, the data directory `/var/lib/printd` and the settings file
  `/etc/printd/printd.env` with a fresh `AUTH_SECRET`
- creates the CUPS queue `printd`, if the printer is connected
- builds printD and starts it as a service

### 3. Configure login

Create the Authentik provider (see [Authentik setup](#authentik-setup)) and fill in the
`AUTH_AUTHENTIK_*` values:

```sh
sudoedit /etc/printd/printd.env
sudo systemctl restart printd
```

### 4. Add a hostname and HTTPS

Point a hostname at the server, open ports 80 and 443 to it, and run the script again with
the hostname. Caddy fetches a certificate from Let's Encrypt automatically:

```sh
sudo /opt/printd/deploy/setup-pi.sh print.example.org
```

> **No hostname yet?** Put the public development login from `web/.env.example` in
> `/etc/printd/printd.env` and reach printD through an SSH tunnel, so it is served on
> `localhost`, which that login accepts:
>
> ```sh
> ssh -L 3000:localhost:3000 <user>@<server>
> # then open http://localhost:3000
> ```

### 5. Make a test print

Print a page from the website and check that:

- the job appears under **Secure Print** on the printer, under your username, and is
  released by its PIN
- skipped pages, double-sided and black & white come out as chosen

### Maintenance

| Task | Command |
| --- | --- |
| Update to the latest version | `sudo /opt/printd/deploy/update.sh` |
| Service status | `systemctl status printd` |
| Follow the log | `journalctl -u printd -f` |
| CUPS log | `/var/log/cups/error_log` |
| Change settings | `sudoedit /etc/printd/printd.env && sudo systemctl restart printd` |

The print log is the SQLite database `/var/lib/printd/print.db` (table `jobs`). Back it up
like any other file.

## Troubleshooting

**The job stays at "The printer is offline".**
Another program is holding the printer's USB connection, usually an IPP-over-USB service
(`ipp-usb` on Linux, or an automatically added AirPrint queue on desktops). Remove `ipp-usb`
or pause the AirPrint queue (`cupsdisable <queue>`), then unplug and replug the USB cable.

**The job shows up under Secure Print, but the PIN is rejected.**
The driver expects the PIN in the other format. Switch `SECURE_PRINT_PIN_ENCODING` between
`base64` and `plain` and restart.

**Jobs print immediately instead of waiting for a PIN.**
Secure Print is not enabled on the queue. Check `lpoptions -p <queue> -l` and set
`CNUseSecuredPrint=True` if the option exists. Also check `SECURE_PRINT=true` and
`PRINTER_DRIVER=ufr2`.

**Word or PowerPoint files fail to upload.**
LibreOffice is missing or not found. Install it, or set `SOFFICE_PATH`.

**`lp: No such file or directory`.**
The queue in `PRINTER_NAME` does not exist. List the queues with `lpstat -p`.

## Limitations

- **Pickups can't be tracked.** The printer does not report when a held job is released,
  so a job's final status is *Skickad till skrivaren* (sent to the printer).
- **Held jobs can only be deleted at the printer.** printD cannot delete jobs held in the
  printer's memory; they stay until the printer deletes them or someone does so on its screen.
- **Canon's driver ignores some CUPS options,** such as page ranges. printD therefore builds
  the final PDF itself instead of relying on them.

## Project structure

```
printd/
├── deploy/                 Production setup: scripts, systemd service, Caddy, settings
└── web/                    The Next.js app
    └── src/
        ├── app/            Pages and API routes (/api/uploads, /api/print, /api/jobs)
        ├── components/     UI: upload flow, page preview, image layout editor, job list
        └── lib/
            ├── convert.ts       File → PDF, page selection, image normalisation
            ├── image-layout.ts  Image placement, shared by preview and PDF
            ├── printer.ts       CUPS: submit, status, cancel, Canon options
            ├── db.ts            SQLite: uploads and the print log
            └── session.ts       Login and group check
```

## Development

From `web/`:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server on <http://localhost:3000> |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm lint` | ESLint |
| `npx tsc --noEmit` | Type check |
