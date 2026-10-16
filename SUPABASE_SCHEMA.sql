-- ==============================================================================
-- ANMOL KALA — SECURE ADMIN DASHBOARD & SUPABASE DATABASE MIGRATION
-- ==============================================================================
-- Run this script in the Supabase SQL Editor (Dashboard > SQL Editor)
-- It safely extends the existing tables, creates media/category tables,
-- configures Row Level Security (RLS), and sets up Storage permissions.

-- 1. EXTENSIONS
create extension if not exists pgcrypto;

-- 2. REUSE & EXTEND EXISTING STORE ITEMS TABLE
create table if not exists public.store_items (
  id text primary key,
  type text not null check (type in ('product','video')),
  name text not null,
  category text not null default 'Uncategorized',
  slug text not null default '',
  description text not null default '',
  image_url text not null default '',
  video_url text not null default '',
  tags text not null default '',
  published boolean not null default true,
  availability text not null default 'in_stock' check (availability in ('in_stock', 'made_to_order', 'out_of_stock')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safely add availability column if table already existed without it
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_items' and column_name = 'availability') then
    alter table public.store_items add column availability text not null default 'in_stock';
  end if;
end $$;

create index if not exists store_items_published_idx on public.store_items(published, created_at desc);
create index if not exists store_items_category_idx on public.store_items(category);

-- 3. CATEGORIES TABLE
create table if not exists public.categories (
  id text primary key,
  name text not null unique,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. PRODUCT MEDIA TABLE (IMAGES & VIDEOS)
create table if not exists public.product_media (
  id text primary key,
  product_id text not null references public.store_items(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  file_name text,
  file_size int,
  mime_type text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_media_product_idx on public.product_media(product_id);

-- 5. ACTIVITY & AUDIT LOGS TABLE
create table if not exists public.activity_logs (
  id text primary key,
  user_email text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details text,
  timestamp timestamptz not null default now()
);

create index if not exists activity_logs_timestamp_idx on public.activity_logs(timestamp desc);

-- 6. ADMIN PROFILES (ROLE-BASED AUTHORIZATION)
create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

-- 7. ENABLE ROW LEVEL SECURITY (RLS)
alter table public.store_items enable row level security;
alter table public.categories enable row level security;
alter table public.product_media enable row level security;
alter table public.activity_logs enable row level security;
alter table public.admin_profiles enable row level security;

-- 8. ROW LEVEL SECURITY POLICIES

-- Public Read Policies (Visitors can browse catalogue and media)
drop policy if exists "Public can view published store items" on public.store_items;
create policy "Public can view published store items"
  on public.store_items for select
  using (published = true or auth.role() = 'authenticated');

drop policy if exists "Public can view categories" on public.categories;
create policy "Public can view categories"
  on public.categories for select
  using (true);

drop policy if exists "Public can view product media" on public.product_media;
create policy "Public can view product media"
  on public.product_media for select
  using (true);

-- Admin Full Access Policies (Authenticated users can manage)
drop policy if exists "Admins can insert store items" on public.store_items;
create policy "Admins can insert store items"
  on public.store_items for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Admins can update store items" on public.store_items;
create policy "Admins can update store items"
  on public.store_items for update
  using (auth.role() = 'authenticated');

drop policy if exists "Admins can delete store items" on public.store_items;
create policy "Admins can delete store items"
  on public.store_items for delete
  using (auth.role() = 'authenticated');

drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories"
  on public.categories for all
  using (auth.role() = 'authenticated');

drop policy if exists "Admins can manage product media" on public.product_media;
create policy "Admins can manage product media"
  on public.product_media for all
  using (auth.role() = 'authenticated');

drop policy if exists "Admins can insert activity logs" on public.activity_logs;
create policy "Admins can insert activity logs"
  on public.activity_logs for insert
  with check (true);

drop policy if exists "Admins can view activity logs" on public.activity_logs;
create policy "Admins can view activity logs"
  on public.activity_logs for select
  using (auth.role() = 'authenticated');

-- 9. SUPABASE STORAGE BUCKET CONFIGURATION
-- Run these statements to create and configure the anmolkala-media public bucket:
insert into storage.buckets (id, name, public)
values ('anmolkala-media', 'anmolkala-media', true)
on conflict (id) do update set public = true;

-- Storage policies: Public read, authenticated admin write
drop policy if exists "Public Access for Media" on storage.objects;
create policy "Public Access for Media"
  on storage.objects for select
  using (bucket_id = 'anmolkala-media');

drop policy if exists "Admin Media Upload" on storage.objects;
create policy "Admin Media Upload"
  on storage.objects for insert
  with check (bucket_id = 'anmolkala-media' and auth.role() = 'authenticated');

drop policy if exists "Admin Media Update" on storage.objects;
create policy "Admin Media Update"
  on storage.objects for update
  using (bucket_id = 'anmolkala-media' and auth.role() = 'authenticated');

drop policy if exists "Admin Media Delete" on storage.objects;
create policy "Admin Media Delete"
  on storage.objects for delete
  using (bucket_id = 'anmolkala-media' and auth.role() = 'authenticated');

-- 10. ENABLE SUPABASE REALTIME REPLICATION
-- Required for instant real-time sync across all connected visitors when items are added, updated, or deleted
do $$
begin
  begin
    alter publication supabase_realtime add table public.store_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.categories;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.product_media;
  exception when duplicate_object then null;
  end;
end $$;

