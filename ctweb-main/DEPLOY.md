# Deployment handoff

This repository is ready to run on a Node.js 18+ hosting platform with
`npm start` or `node server.js`. Do not publish it until the following runtime
requirements are configured.

## Environment variables

- `ADMIN_PASSCODE` is required. Set it to a strong, unique value before going
  live. Admin login and all mutations remain disabled when it is empty.
- `PORT` is optional. Most platforms inject it automatically; the local default
  is `8937`.

Never commit real environment values, `.env`, or `config.json`.

## Security

HTTPS is mandatory. The admin client sends the passcode in an `X-Passcode`
request header, so transport encryption must be enabled for every request.

Change any placeholder passcode before going live. For a public or higher-risk
deployment, add rate limiting and replace the shared passcode with proper
session-based authentication.

## Persistent storage

The application writes runtime state to:

- `data/products.json`
- `uploads/`

On platforms with ephemeral filesystems, including default configurations on
Render, Railway, Fly.io, and Heroku, admin edits and newly uploaded images will
be lost on redeploy or restart.

Choose one of these approaches:

1. Attach persistent storage mounted so both `data/` and `uploads/` survive
   restarts.
2. Migrate the catalogue to a database and uploads to object storage such as S3
   or Cloudflare R2. This is the recommended production architecture.

## Scaling

Run exactly one application instance while using the JSON-file store. It is not
safe for concurrent writes across multiple replicas. Migrate to a database
before scaling out.
