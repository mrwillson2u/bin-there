# Deploying to the home lab server

One Docker container on the Ubuntu server, reached over HTTPS through Tailscale Serve
(see `framework/08-Decision-Log.md`, DEC-003 and DEC-004).

## One-time setup

1. **Tailscale HTTPS:** in the Tailscale admin console → DNS, make sure **MagicDNS** and
   **HTTPS Certificates** are enabled. The iPhone camera only works over HTTPS.
2. **Get the code onto the server:** `git clone git@github.com:mrwillson2u/bin-there.git ~/bin-there`.
3. **Backup folder:** create it and tell compose where it is. ubuntubot has no separate
   data drive (the other partitions are Windows/BitLocker), so for now it's in the home folder:
   ```bash
   mkdir -p ~/bin-there-backups
   echo "BACKUP_PATH=$HOME/bin-there-backups" >> .env
   echo "TZ=$(cat /etc/timezone)" >> .env
   ```

## Moving from the Mac (one time)

The app has been running on the Mac (`macbip-pro`) with its data in `./data`. To carry it over:

```bash
# On the Mac: stop the app so the database is quiet, then copy code + data to the server.
# (The Mac folder is still named stack-n-track; it lands as ~/bin-there on the server.)
rsync -av --exclude node_modules --exclude dist --exclude backups ~/Projects/stack-n-track/ <server>:~/bin-there/
# On the Mac: stop serving the old copy over Tailscale.
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve reset
```

Moved 2026-11-03: now at `https://ubuntubot.llama-arctic.ts.net:8443`; the Mac copy is stopped.
Then follow "Deploy / update" below on the server. The server gets its own Tailscale address
(`https://<server>.<tailnet>.ts.net`); re-add it to the iPhone home screen.

## Deploy / update

```bash
cd ~/bin-there
git pull                      # if using git
docker compose up -d --build  # builds, runs tests, starts on 127.0.0.1:3000
sudo tailscale serve --bg --https=8443 3000   # one time; port 443 is taken by Wazuh on ubuntubot
tailscale serve status        # shows the https://ubuntubot.<tailnet>.ts.net:8443 URL
```

Open that URL on the iPhone (with Tailscale on). In Safari: Share → **Add to Home Screen**.
It then opens full-screen like an app, and the app itself loads from the phone's cache even on a
weak signal (stock data always comes fresh from the server).

## Data and backups

Live data is in `./data`: `app.db` (SQLite) and `photos/`.

The app backs itself up every night at 03:00 to `BACKUP_PATH`, and right away on start if the
last good backup is more than a day old:

```
BACKUP_PATH/
  snapshots/2026-11-23_030000/app.db   # one per night, newest 14 kept
  photos/                              # every photo (never deleted)
  status.json                          # last result
```

Each snapshot is checked (it's opened and run through SQLite's integrity check) before it counts
as good. The **Activity** screen shows the last backup and has a **Back up now** button; it turns
amber if the last backup failed or is more than a day and a half old.

> Until the main backup system is fixed, the backup sits on the same machine (DEC-008).
> A dead server loses both.

### Restore

```bash
cd ~/bin-there
docker compose down
mv data data.broken-$(date +%F)                         # keep the old copy, just in case
mkdir -p data
cp "$BACKUP_PATH/snapshots/<pick one>/app.db" data/app.db
cp -R "$BACKUP_PATH/photos" data/photos
docker compose up -d
```

Restore tested 2026-11-03: a snapshot restored into an empty folder served the same items,
quantities and photos as the original. Repeat once on the server after the first deploy.

## Hardware scanner (Tera HW0006 Pro), desktop/Pi browser

The phone uses the camera. For the scanner, configure it once by scanning these codes from the
manual (`TR-UMHW0006 Pro`):

1. **Escape Character Set 2** (p.15) → **Add Prefix** (p.16) → **STX** (Appendix A, p.42).
   Every scan now starts with Ctrl+B, which the app uses to keep scans out of text fields.
2. **Terminators → Carriage Return (CR)** (p.21), the default.

The three barcodes are also on one sheet: `docs/scanner-prefix-setup.png`. (The manual's
"Clear Prefixes"/"Clear Suffixes" codes are misprinted as copies of "Add Prefix"/"Add Suffix".)
The scanner still appends `&END!` from an old setup; the app strips it, so it can stay.

Without the prefix it still works through a typing-speed fallback, but the prefix is more reliable.

## Local development

```bash
npm install
npm run dev     # API on :3000, web on :5173 (proxies /api)
npm test
```
