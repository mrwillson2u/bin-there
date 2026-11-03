# Deploying to the home lab server

One Docker container on the Ubuntu server, reached over HTTPS through Tailscale Serve
(see `framework/08-Decision-Log.md`, DEC-003 and DEC-004).

## One-time setup

1. **Tailscale HTTPS:** in the Tailscale admin console → DNS, make sure **MagicDNS** and
   **HTTPS Certificates** are enabled. The iPhone camera only works over HTTPS.
2. **Get the code onto the server**, e.g. `git clone` (or `rsync`) into `~/stack-n-track`.

## Deploy / update

```bash
cd ~/stack-n-track
git pull                      # if using git
docker compose up -d --build  # builds, runs tests, starts on 127.0.0.1:3000
sudo tailscale serve --bg 3000
tailscale serve status        # shows the https://<server>.<tailnet>.ts.net URL
```

Open that URL on the iPhone (with Tailscale on). In Safari: Share → **Add to Home Screen**.

Data lives in `./data` (SQLite `app.db` + photos later). **Back up that folder.** The nightly
backup job arrives in milestone 3.

## Hardware scanner (Tera HW0006 Pro), desktop/Pi browser

The phone uses the camera. For the scanner, configure it once by scanning these codes from the
manual (`TR-UMHW0006 Pro`):

1. **Escape Character Set 2** (p.15) → **Add Prefix** (p.16) → **STX** (Appendix A, p.42).
   Every scan now starts with Ctrl+B, which the app uses to keep scans out of text fields.
2. **Terminators → Carriage Return (CR)** (p.21), the default.

Without the prefix it still works through a typing-speed fallback, but the prefix is more reliable.

## Local development

```bash
npm install
npm run dev     # API on :3000, web on :5173 (proxies /api)
npm test
```
