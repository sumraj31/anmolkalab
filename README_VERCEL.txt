ANMOL KALA — COMPLETE VERCEL + SUPABASE PACKAGE

This is the full website source ZIP, including the original product photos, frontend, API routes, database schema and catalogue seed.

WHAT'S INCLUDED
- Existing storefront and product images preserved.
- Footer now has a visible but small “Anmol Kala · Admin Login” entry. Tap it to open admin login.
- Admin can add/edit/delete/publish products and videos. IDs are generated automatically. Published videos appear on home and /videos.
- PostgreSQL database connection uses DATABASE_URL (Supabase pooler).
- Media upload uses Supabase Storage via SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Uploaded files are limited to 3 MB per file in this version.

DEPLOY TO VERCEL
1. Extract this ZIP and upload all its CONTENTS to your GitHub repository root (not the ZIP file itself).
2. Import that GitHub repository in Vercel. Framework Preset: Other. Build Command: leave empty. Output Directory: leave empty. Install Command: leave empty. Vercel will install the pg dependency from package.json.
3. In Vercel Project > Settings > Environment Variables, add all of these for Production (and Preview if needed):
   DATABASE_URL = your Supabase PostgreSQL pooler connection string. Keep the password URL-encoded if it contains special characters.
   SUPABASE_URL = https://cdnvwluozfqjwycgaemp.supabase.co
   SUPABASE_SERVICE_ROLE_KEY = Supabase Dashboard > Project Settings > API Keys > secret/service_role key (server-side only)
   SUPABASE_STORAGE_BUCKET = anmolkala-media
   ADMIN_USERNAME = anmolkala.in@gmail.com
   ADMIN_PASSWORD = choose/set your admin password in Vercel (don't put it in frontend files)
   SESSION_SECRET = a random string of 32+ characters
4. In Supabase SQL Editor, run SUPABASE_SCHEMA.sql first. Then run SUPABASE_SEED_EXISTING.sql to add the supplied existing catalogue into the database.
5. In Supabase Storage, create a PUBLIC bucket named anmolkala-media (for product/video public URLs).
6. In Vercel, open Deployments and Redeploy after saving all variables. Environment variable changes do not apply to an old deployment.
7. Open the deployed site, scroll to the footer and tap “Anmol Kala · Admin Login”.

IMPORTANT
- The PostgreSQL connection string by itself is enough for database queries but not for file uploads; uploads also need SUPABASE_SERVICE_ROLE_KEY.
- Never put database password or service-role key in index.html, products.js, or any frontend file. Do not commit real secrets to GitHub. Since secrets were shared in chat, rotate the database password and use a new admin password before production.
- This ZIP cannot change Vercel settings in your account automatically. You must add variables in the Vercel dashboard and redeploy.
- If the Environment Variables menu is not visible on mobile, open Vercel in a browser, go to the project (not the deployment details), then Settings > Environment Variables.
- If an admin page reports a database error, verify DATABASE_URL and run the SQL files above.
