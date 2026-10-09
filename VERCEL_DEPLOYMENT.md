# Vercel Deployment Guide

## Architecture Overview

**Frontend (Vercel)**: Next.js 14 app in `/web`
- Static/SSR pages, API routes for auth callbacks
- Calls backend via `NEXT_PUBLIC_API_URL`

**Backend (Separate)**: FastAPI in `/app` 
- Deploy to Railway, Render, or Fly.io
- Needs PostgreSQL, R2, Anthropic, Supabase

---

## 1. Deploy Backend First (Railway/Render/Fly.io)

### Required Environment Variables for Backend

```bash
# Database (Supabase or managed Postgres)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Supabase Auth
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...

# Workspace (per-company)
WORKSPACE_ID=uuid-from-founder-mint

# Cloudflare R2 Storage
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET=traceflow-docs

# Anthropic
ANTHROPIC_API_KEY=sk-ant-usr-...
ANTHROPIC_MODEL=claude-opus-5-5

# Frontend URL (for CORS)
FRONTEND_URL=https://your-app.vercel.app

# Founder key (server-only)
FOUNDER_KEY=TF-FOUNDER-...

# Port
PORT=8000
```

### Deploy to Railway (Recommended)
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set env vars in Railway dashboard
```

### Or Render
```yaml
# render.yaml
services:
  - type: web
    name: tracflow-api
    env: docker
    dockerfilePath: ./Dockerfile
    envVars:
      - key: DATABASE_URL
        sync: false
      # ... add all vars above
```

---

## 2. Deploy Frontend to Vercel

### Option A: Vercel CLI
```bash
cd web
npm i -g vercel
vercel login
vercel --prod
```

### Option B: GitHub Integration
1. Push to GitHub
2. Import in Vercel dashboard
3. Set root directory to `web`
4. Add environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://your-api.railway.app` (or render/fly URL)
   - `NEXT_PUBLIC_SUPABASE_URL` = from Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = from Supabase
   - `NEXT_PUBLIC_PILOT_INVITE_CODE` = from founder mint

---

## 3. Configure Supabase

### Auth Settings
- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: 
  - `https://your-app.vercel.app/login`
  - `https://your-app.vercel.app/**`

### Email Auth
- Disable "Confirm email" for pilot (instant signup)
- Or configure SMTP for production

---

## 4. Configure CORS on Backend

In `app/main.py`, ensure `FRONTEND_URL` includes your Vercel domain:
```python
FRONTEND_URL = "https://your-app.vercel.app,http://localhost:3001"
```

---

## 5. Test Production Flow

1. **Founder mints company code** → `https://your-app.vercel.app/founder`
2. **Manufacturer signs up** → `https://your-app.vercel.app/login` with code
3. **Upload document** → extraction runs on backend
4. **Review queue** → accept/reject/correct values
4. **Publish passport** → public URL at `/passport/{slug}`

---

## 6. Per-Company Production Setup

For each manufacturer:
```bash
# 1. Founder mints code at /founder
# 2. Create separate backend deployment with:
#    - Unique DATABASE_URL (per-company DB)
#    - Unique WORKSPACE_ID
#    - Unique R2 prefix (handled by WORKSPACE_ID)
#    - Unique INTAKE_SECRET
# 3. Update Vercel env with new NEXT_PUBLIC_API_URL
```

---

## Current Status

✅ Frontend builds successfully (Next.js 14)
✅ All 118 backend tests pass
✅ Extraction deterministic (temperature=0)
✅ Italian prompts for footwear
✅ Per-company isolation architecture ready

**Next**: Deploy backend to Railway/Render, then frontend to Vercel.