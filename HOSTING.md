# Putting Noor Autos on a server

This system is one small program (`server.py`, Python 3) plus the web pages. All the data lives in one database file
that the program creates the first time it starts. Nothing else needs to be installed: no database server, no
Node.js and no build step.

## Choose where it runs

| | Office computer | Rented cloud server (VPS) |
|---|---|---|
| Who can use it | Only people on the office Wi-Fi/network | Anyone, anywhere, with the address and a PIN |
| Cost | Free (a computer that stays on) | About US$5–12 a month, plus a domain name (about US$10–15 a year) |
| Setup | Double-click a file (see README.md) | About an hour for someone who knows Linux, following the steps below |
| Safety | Stays inside the office | Needs HTTPS (the steps below set it up for free) |

**Ordinary website hosting (cPanel, "shared hosting") will not work.** It only serves files, and this system needs its
program to keep running with its own database file. Rent a **VPS** (virtual private server) instead.

## What to buy (cloud server)

1. **A VPS** with Ubuntu 24.04 LTS, 1 CPU, 1–2 GB memory and 25 GB disk is plenty. Pick a data centre close to
   Bangladesh (Singapore or India). Any of these work: DigitalOcean, Vultr, Hetzner, Linode/Akamai, AWS Lightsail.
   Switch on the provider's automatic **weekly backups** (small extra cost).
2. **An address for it**, for example `dms.noorautos.com`. If you already own a domain, a sub-domain is free:
   ask whoever manages it to add an **A record** `dms` pointing to the server's IP address.

## Giving it to someone to install

Send them the zip file (`Noor Autos DMS v2.1.zip`) and this file, and tell them:

> Please install this on an Ubuntu VPS following HOSTING.md, at `https://dms.ourdomain.com`, with HTTPS.
> Do not open port 8765 to the internet. Do not choose the demo data. Send me the address when it is ready.

Do not send PINs to them. You create the Managing Director's PIN yourself the first time you open the address.

## Install steps (for the person installing)

Run these on the server as a user with `sudo`. Replace `dms.example.com` with the real address.

**1. Prepare the server**

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install python3 unzip
sudo useradd --system --create-home --home-dir /opt/noor-dms noordms
```

**2. Copy the program**: upload the zip to the server (with `scp` or an SFTP app such as FileZilla), then:

```bash
sudo unzip "Noor Autos DMS v2.1.zip" -d /opt/noor-dms
sudo mv "/opt/noor-dms/Noor Autos DMS" /opt/noor-dms/app
sudo mkdir -p /opt/noor-dms/data
sudo chown -R noordms:noordms /opt/noor-dms
```

**3. Run it as a service**, so it starts by itself and restarts after a crash or reboot. Create
`/etc/systemd/system/noor-dms.service` with:

```ini
[Unit]
Description=Noor Autos DMS
After=network.target

[Service]
User=noordms
WorkingDirectory=/opt/noor-dms/app
Environment=NA_HOST=127.0.0.1
Environment=NA_PORT=8765
Environment=NA_DATA=/opt/noor-dms/data
Environment=NA_MIN_PIN=6
ExecStart=/usr/bin/python3 server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now noor-dms
sudo systemctl status noor-dms
```

`NA_HOST=127.0.0.1` keeps the program private to the server; only the web server below can reach it.
`NA_MIN_PIN=6` makes everyone use PINs of at least 6 digits, which matters on the internet.

**4. HTTPS with Caddy** (free certificates that renew themselves). Install Caddy from https://caddyserver.com/docs/install
(the "Debian, Ubuntu" steps), then replace `/etc/caddy/Caddyfile` with:

```
dms.example.com {
    reverse_proxy 127.0.0.1:8765
}
```

```bash
sudo systemctl reload caddy
```

**5. Firewall**: only SSH and the web ports are open.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

**6. First start**: open `https://dms.example.com`. Choose **An empty system**, then type the Managing Director's
name and a PIN. That person then adds the staff in **People** and gives each one a sign-in in
**Settings → Sign-in and roles**.

## After it is running

- **Backups**: the program saves a copy of the data every day in `/opt/noor-dms/data/backups` (the last 30 days).
  Also keep copies off the server: the provider's weekly backup, and now and then **Settings → Data → Download
  backup** on your own computer.
- **Updating to a new version**: replace the files in `/opt/noor-dms/app` with the new ones (never touch
  `/opt/noor-dms/data`), then run `sudo systemctl restart noor-dms`. Everyone reloads the page.
- **Logs** if something is wrong: `sudo journalctl -u noor-dms -n 100`.
- **Moving to another server**: stop the service, copy the whole `/opt/noor-dms/data` folder to the new server,
  and install the program there the same way.
- **Someone leaves**: mark them as left in **People**. Their sign-in stops working at once.
- Five wrong PINs lock that person's sign-in for five minutes.
