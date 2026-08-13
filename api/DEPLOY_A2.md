# Deploy the Visita API to A2/cPanel

This API is a Node.js/Fastify app built from TypeScript and backed by PostgreSQL through Prisma.

## 1. Confirm hosting requirements

In A2/cPanel, confirm your account has:

- SSH access.
- **Setup Node.js App** or **Node.js Selector**.
- A reachable PostgreSQL database. If the cPanel account only offers MySQL/MariaDB, keep the Prisma schema as PostgreSQL and use an external PostgreSQL database instead.

## 2. Connect with SSH

Your screenshot shows an authorized public key named `id_ed25519`. Download the matching private key from **Private Keys > id_ed25519 > View/Download**, then move it to your local SSH folder:

```bash
mkdir -p ~/.ssh
mv ~/Downloads/id_ed25519 ~/.ssh/a2_visita_id_ed25519
chmod 600 ~/.ssh/a2_visita_id_ed25519
ssh -p 22 -i ~/.ssh/a2_visita_id_ed25519 CPANEL_USER@YOUR_DOMAIN_OR_SERVER
```

Replace `CPANEL_USER` and `YOUR_DOMAIN_OR_SERVER` with the values from A2.

Optional SSH shortcut:

```sshconfig
Host visita-a2
  HostName YOUR_DOMAIN_OR_SERVER
  User CPANEL_USER
  Port 22
  IdentityFile ~/.ssh/a2_visita_id_ed25519
```

Then connect with:

```bash
ssh visita-a2
```

## 3. Create the Node app in cPanel

In cPanel, open **Setup Node.js App** and create an app with values like:

- **Node.js version:** latest available LTS.
- **Application mode:** Development for initial install/build, Production after it works.
- **Application root:** `apps/visita-api`.
- **Application URL:** `api.your-domain.com` or `your-domain.com/api`.
- **Application startup file:** `dist/server.js`.

Do not put the app root inside `public_html`.

After cPanel creates the app, copy the command it shows for entering the app virtual environment. It usually starts with something like:

```bash
source /home/CPANEL_USER/nodevenv/apps/visita-api/NODE_VERSION/bin/activate
```

Run that command before `npm` commands on the server.

## 4. Upload the API

From your local machine:

```bash
rsync -av \
  --exclude node_modules \
  --exclude dist \
  --exclude .env \
  /Users/vsuzuki/dev/web/visitabe/api/ \
  visita-a2:~/apps/visita-api/
```

If you did not add the SSH shortcut, use:

```bash
rsync -av \
  --exclude node_modules \
  --exclude dist \
  --exclude .env \
  -e "ssh -p 22 -i ~/.ssh/a2_visita_id_ed25519" \
  /Users/vsuzuki/dev/web/visitabe/api/ \
  CPANEL_USER@YOUR_DOMAIN_OR_SERVER:~/apps/visita-api/
```

## 5. Configure production environment

Create `~/apps/visita-api/.env` on A2:

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
LOG_LEVEL=info
WEB_CORS_ORIGINS=https://your-frontend-domain.com

AUTH_ISSUER=https://api.your-domain.com
AUTH_AUDIENCE=visita-web
AUTH_ACCESS_TOKEN_TTL_SECONDS=900
AUTH_REFRESH_TOKEN_TTL_SECONDS=2592000
AUTH_JWT_ALGORITHM=HS256
AUTH_REFRESH_TOKEN_PEPPER=replace-with-a-long-random-secret
JWT_SECRET=replace-with-a-different-long-random-secret

DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
OPENAI_API_KEY=replace-me
```

Generate strong secrets locally:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Use one value for `JWT_SECRET` and the other for `AUTH_REFRESH_TOKEN_PEPPER`.

If cPanel injects its own `PORT`, keep this app code as-is. It already reads `process.env.PORT`. If cPanel does not inject `PORT`, make sure the `.env` value matches the port configured in the Node.js app screen.

## 6. Install, build, and migrate

SSH into A2, enter the Node virtual environment, then run:

```bash
cd ~/apps/visita-api
npm ci --include=dev
npm run build
npm run prisma:deploy
npm prune --omit=dev
```

Use `npm install --include=dev` instead of `npm ci --include=dev` if `npm ci` is unavailable on the A2 Node version.

## 7. Restart and verify

In cPanel, click **Restart** for the Node.js app.

Then test:

```bash
curl https://api.your-domain.com/openapi.json
```

If your app URL is under a path such as `https://your-domain.com/api`, test:

```bash
curl https://your-domain.com/api/openapi.json
```

If the endpoint returns JSON, the backend is connected and running.

## Common fixes

- **Missing env error:** add the missing value to `~/apps/visita-api/.env` or the cPanel environment variable UI.
- **Prisma cannot connect:** verify `DATABASE_URL`, database firewall rules, and SSL requirements from your PostgreSQL provider.
- **CORS error from frontend:** add the exact frontend origin to `WEB_CORS_ORIGINS`, for example `https://app.your-domain.com`.
- **App shows cPanel default page:** confirm the cPanel Node app **Application URL** points to your domain/subdomain and the startup file is `dist/server.js`.
- **Build fails after production install:** install with `npm ci --include=dev`, build, then run `npm prune --omit=dev`.
