# CT Pharma — Website + Portfolio Admin

A self-contained website with a live, server-backed product portfolio and a
passcode-gated admin panel. No dependencies — plain Node.js.

## Run

```bash
ADMIN_PASSCODE=choose-a-strong-passcode node server.js
```

Copy `.env.example` into your platform's environment configuration, or export
the variables in your shell before starting the server. Node.js does not load
`.env` files by itself; your hosting platform or local environment must provide
the values.

- **Public site:** http://localhost:8937/
- **Admin panel:** http://localhost:8937/#/admin (or /admin.html directly)
- **Passcode:** set with the required `ADMIN_PASSCODE` environment variable. For
  local development only, `config.example.json` shows the optional untracked
  `config.json` fallback format.

## What the admin can do

- **Add / edit / delete products** — name, division (Medicine / Functional food),
  category, form, pack size, composition, manufacturer/supplier, country of origin,
  classification, and channels (Hospital / Pharmacy / Modern trade).
- **Badges** — Best-seller, CT-built, Exclusive.
- **Flagship row** — toggle any product into the homepage-portfolio "Category
  leaders" row and write its proof line. (Keep this to ~5 products.)
- **Pack shots** — upload a product photo (PNG/JPEG/WebP, max 6 MB); it is stored
  in `uploads/` and shown on the public site. Products without a photo fall back
  to a neutral placeholder illustration.
- **Categories** — add new categories per division; remove a category once it has
  no products.

Changes are live immediately: the public portfolio page reads from
`GET /api/products` on every load, and all site counters (product count,
best-seller count, homepage metrics and teaser) are computed from the data.

## Where data lives

- `data/products.json` — the whole catalogue (products + categories). Human-readable;
  back it up by copying the file. Writes are atomic.
- `uploads/` — product photos.
- `public/` — the website (index.html) and admin (admin.html).

## Deploying for real

This server is a solid starting point for a small internal-scale site, but before
putting it on the public internet:

1. **Serve over HTTPS** (put it behind nginx/Caddy or a platform like Render/Fly).
   The passcode travels in a header, so TLS is required.
2. **Set a strong `ADMIN_PASSCODE` environment variable** and do not commit it.
3. Optional hardening a developer can add later: rate-limiting on `/api/login`,
   session tokens instead of the passcode header, and a database (the JSON file
   is fine up to hundreds of products, but a DB adds concurrent-write safety).

## Seeded content

The catalogue is seeded with 21 products from the supplied CT Pharma portfolio,
including product photos, composition, pack size, manufacturer/supplier,
country of origin, prescription classification, and distribution channels.
Five products remain selected for the homepage's category-leader row. Myhemo's
composition is shown as listed in the supplied portfolio.

See `DEPLOY.md` for the hosting handoff, including persistent-storage and
single-instance requirements.
