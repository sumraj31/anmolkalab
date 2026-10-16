ANMOL KALA — PRODUCTION VERCEL & DATABASE GUIDE

This repository contains the complete Anmol Kala storefront, native media storage, authenticated REST API, PostgreSQL/Supabase database integration, and admin portal.

WHAT'S FIXED & ENHANCED
- Vercel 404 NOT_FOUND on page refresh completely resolved via vercel.json SPA configuration with buildCommand ("npm run build"), outputDirectory ("dist"), and standard catch-all rewrite to index.html.
- Storefront and Admin Dashboard are 100% synchronized through unified database and local cache keys ('anmolkala_store_items').
- Adding, editing, publishing, unpublishing, and deleting products immediately updates both database and public storefront without stale hardcoded fallbacks re-injecting deleted items.
- Non-blocking PostgreSQL database pool with graceful fallback prevents 5-second timeouts and initial zero counters.
- Dashboard KPI counters show animated skeleton placeholders while loading and authoritative aggregate counts upon resolution.
- Dedicated Photos and Videos sections allow direct file uploads from mobile phone galleries or desktop file managers.
- Mandatory product photo enforcement for video products prevents publishing video items with missing cover photos.
- Direct category URLs and nested category page refreshes resolve properly without redirecting to the homepage.
- Admin authentication is verified on the backend via HMAC-signed session tokens and verified on all mutating API routes.

DEPLOY TO VERCEL
1. Push this repository to your GitHub repository root.
2. In Vercel, import the repository.
   - Framework Preset: Vite (or Other)
   - Build Command: npm run build (preset configured in vercel.json)
   - Output Directory: dist (preset configured in vercel.json)
3. In Vercel Project > Settings > Environment Variables, configure the following variables for Production (and Preview):
   - DATABASE_URL = your Supabase PostgreSQL connection string (Supabase Dashboard > Settings > Database > Connection String > URI / Pooler)
   - SUPABASE_URL = https://[YOUR_PROJECT_ID].supabase.co
   - SUPABASE_SERVICE_ROLE_KEY = Supabase secret / service_role key (server-side only, never share or expose)
   - SUPABASE_STORAGE_BUCKET = anmolkala-media
   - ADMIN_USERNAME = anmolkala.in@gmail.com
   - ADMIN_PASSWORD = your secure admin password
   - SESSION_SECRET = a secure random string (32+ characters) for signing session tokens
4. In Supabase Dashboard > SQL Editor:
   - Run SUPABASE_SCHEMA.sql first to create tables, indexes, and RLS policies.
   - Run SUPABASE_SEED_EXISTING.sql to seed the initial craft catalogue into the database.
5. In Supabase Dashboard > Storage:
   - Verify the "anmolkala-media" bucket is created and marked as Public.
6. Trigger a redeploy in Vercel to load the newly saved environment variables.
7. Open the live site, scroll to the bottom of the footer, tap the discreet "A" icon, and sign in with your admin credentials.
