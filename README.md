# RouteForge

Multi-stop itinerary planner — unlimited stops, fuel tracking, cost splitting, per-stop notes & attachments.

---

## Local Development

### 1. Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

### 2. Clone & install

```bash
git clone <your-repo-url>
cd itinerary-planner
npm install --legacy-peer-deps
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API → service_role key |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for local dev |

### 4. Run the Supabase schema

1. Open your Supabase project → **SQL Editor**
2. Paste the full contents of `supabase/schema.sql`
3. Click **Run**

### 5. Create the Storage bucket

In Supabase dashboard → **Storage** → **New bucket**:
- Name: `attachments`
- Public: **No** (private bucket, URLs are signed)

Or run in SQL Editor:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT DO NOTHING;
```

### 6. Configure Auth redirect URL

In Supabase dashboard → **Authentication** → **URL Configuration**:
- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/auth/callback`

### 7. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment: Vercel + Supabase

### Vercel setup

1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo
3. In Vercel project settings → **Environment Variables**, add all vars from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` → set to your Vercel domain, e.g. `https://your-app.vercel.app`

4. Deploy

### Supabase production config

After deploying to Vercel:

1. Supabase dashboard → **Authentication** → **URL Configuration**
   - **Site URL:** `https://your-app.vercel.app`
   - **Redirect URLs:** add `https://your-app.vercel.app/auth/callback`

2. If you want a custom domain on Vercel, add that to redirect URLs too.

### Vercel + Supabase integration (optional)

Vercel offers a [Supabase integration](https://vercel.com/integrations/supabase) that auto-injects env vars from your Supabase project. Go to Vercel dashboard → **Integrations** → search Supabase → connect.

---

## GitHub + CI

Recommended `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci --legacy-peer-deps
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          NEXT_PUBLIC_APP_URL: https://your-app.vercel.app
```

Add the secrets in GitHub → repo settings → Secrets and variables → Actions.

---

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + Storage)
- **Leaflet + OpenStreetMap** (free maps, no key)
- **Nominatim** (free geocoding)
- **OSRM** (free routing)
- **@dnd-kit** (drag-to-reorder stops)
