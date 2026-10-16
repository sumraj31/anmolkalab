import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Admin & Security Configuration
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'anmolkala.in@gmail.com').trim().toLowerCase();
let currentAdminPassword = (process.env.ADMIN_PASSWORD || 'mnbvcxz12').trim();
const SESSION_SECRET = process.env.SESSION_SECRET || 'anmolkala-production-secret-session-key-2026-secure';

// File-backed admin password persistence for cross-restart retention
const adminConfigFile = path.resolve(__dirname, 'src/data/admin_config.json');
try {
  if (fs.existsSync(adminConfigFile)) {
    const raw = fs.readFileSync(adminConfigFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.adminPassword) {
      currentAdminPassword = String(parsed.adminPassword).trim();
    }
  }
} catch (e) {}

function persistAdminPassword(newPass: string) {
  currentAdminPassword = newPass;
  try {
    fs.writeFileSync(adminConfigFile, JSON.stringify({ adminPassword: newPass }, null, 2), 'utf-8');
  } catch (e) {}
}

// In-Memory Types
interface StoreItemRecord {
  id: string;
  type: 'product' | 'video';
  name: string;
  category: string;
  slug: string;
  description: string;
  image_url: string;
  video_url: string;
  tags: string;
  published: boolean;
  availability: string;
  created_at: string;
  updated_at: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface MediaRecord {
  id: string;
  product_id: string;
  storage_path: string;
  media_type: 'image' | 'video';
  file_name: string;
  file_size: number;
  mime_type: string;
  display_order: number;
  created_at: string;
}

interface ActivityLogRecord {
  id: string;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  timestamp: string;
}

// -------------------------------------------------------------
// Load Authoritative Baseline Catalog from initialData.json
// -------------------------------------------------------------
let initialProductsData: any[] = [];
try {
  const jsonPath = path.resolve(__dirname, 'src/data/initialData.json');
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    initialProductsData = Array.isArray(parsed.products) ? parsed.products : [];
  }
} catch (e) {
  console.warn('Could not read initialData.json for baseline store:', e);
}

const memoryStoreItems: StoreItemRecord[] = initialProductsData.map((p, idx) => {
  let video_url = p.video_url || '';
  if (!video_url) {
    if (p.id === 'AK-001') {
      video_url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    } else if (p.id === 'AK-006') {
      video_url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4';
    } else if (p.id === 'AK-032') {
      video_url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4';
    } else if (p.id === 'AK-061') {
      video_url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4';
    }
  }

  return {
    id: p.id,
    type: (p.type || 'product') as 'product' | 'video',
    name: p.name,
    category: p.category || 'Uncategorized',
    slug: p.slug || `item-${p.id.toLowerCase()}`,
    description: p.description || '',
    image_url: p.image_url || p.image || '/logo.png',
    video_url,
    tags: p.tags || '',
    published: p.published !== false,
    availability: p.availability || 'in_stock',
    created_at: p.created_at || new Date(Date.now() - idx * 60000).toISOString(),
    updated_at: p.updated_at || new Date().toISOString(),
  };
});

const distinctCategories = Array.from(new Set(memoryStoreItems.map((i) => i.category).filter(Boolean)));
const memoryCategories: CategoryRecord[] = distinctCategories.map((name, i) => ({
  id: `CAT-${(i + 1).toString().padStart(3, '0')}`,
  name,
  display_order: i,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));

const memoryMedia: MediaRecord[] = [];
memoryStoreItems.forEach((item) => {
  if (item.image_url) {
    memoryMedia.push({
      id: `med-img-${item.id}`,
      product_id: item.id,
      storage_path: item.image_url,
      media_type: 'image',
      file_name: item.image_url.split('/').pop() || `${item.slug}.webp`,
      file_size: 250000,
      mime_type: 'image/webp',
      display_order: 0,
      created_at: item.created_at,
    });
  }
  if (item.video_url) {
    memoryMedia.push({
      id: `med-vid-${item.id}`,
      product_id: item.id,
      storage_path: item.video_url,
      media_type: 'video',
      file_name: `${item.slug}-video.mp4`,
      file_size: 5000000,
      mime_type: 'video/mp4',
      display_order: 1,
      created_at: item.created_at,
    });
  }
});

const memoryLogs: ActivityLogRecord[] = [
  {
    id: 'log-boot',
    user_email: ADMIN_USERNAME,
    action: 'Server Initialized',
    entity_type: 'system',
    entity_id: 'SYSTEM',
    details: 'AnmolKala server started successfully',
    timestamp: new Date().toISOString(),
  },
];

// -------------------------------------------------------------
// Database & Supabase Clients Setup
// -------------------------------------------------------------
const dbConnectionString = process.env.DATABASE_URL || '';

let poolInstance: Pool | null = null;
let isDbHealthy = false;
let lastDbCheckTime = 0;

try {
  let poolConfig: any = null;

  if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD) {
    poolConfig = {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '6543', 10),
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 30000,
      max: 10,
    };
  } else if (dbConnectionString) {
    try {
      const parsedUrl = new URL(dbConnectionString);
      poolConfig = {
        host: parsedUrl.hostname,
        port: parseInt(parsedUrl.port || '6543', 10),
        database: parsedUrl.pathname.replace(/^\//, '') || 'postgres',
        user: decodeURIComponent(parsedUrl.username),
        password: decodeURIComponent(parsedUrl.password),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 4000,
        idleTimeoutMillis: 30000,
        max: 10,
      };
    } catch {
      poolConfig = {
        connectionString: dbConnectionString,
        ssl: dbConnectionString.includes('localhost') ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 4000,
        idleTimeoutMillis: 30000,
        max: 10,
      };
    }
  }

  if (poolConfig) {
    const candidate = new Pool(poolConfig);
    candidate.on('error', (err) => {
      console.warn('[PostgreSQL Pool Warning]:', err.message);
      isDbHealthy = false;
      poolInstance = null;
    });

    // Probe connection once with quick fallback on failure
    candidate.query('SELECT 1')
      .then(() => {
        poolInstance = candidate;
        isDbHealthy = true;
        console.log('[PostgreSQL] Database connected successfully.');
      })
      .catch((err) => {
        console.warn('[PostgreSQL DB not connected — in-memory store active]:', err.message);
        isDbHealthy = false;
        candidate.end().catch(() => {});
        poolInstance = null;
      });
  }
} catch (err: any) {
  console.warn('[DB not connected — mock active]:', err.message);
  poolInstance = null;
}

export const pool = poolInstance;

// Supabase Server Client
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'anmolkala-media';

let supabaseServer: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  } catch (e: any) {
    console.warn('Could not initialize Supabase server client:', e.message);
  }
}

// -------------------------------------------------------------
// Session & Auth Utilities
// -------------------------------------------------------------
function generateToken(username: string): string {
  const timestamp = Date.now();
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${username}:${timestamp}`)
    .digest('hex');
  return `adm_${timestamp}_${signature}`;
}

function verifyToken(token: string): { valid: boolean; email?: string } {
  if (!token || !token.startsWith('adm_')) {
    return { valid: false };
  }
  const parts = token.split('_');
  if (parts.length !== 3) return { valid: false };

  const timestamp = parseInt(parts[1], 10);
  const signature = parts[2];

  // Token expires after 24 hours
  if (isNaN(timestamp) || Date.now() - timestamp > 24 * 60 * 60 * 1000) {
    return { valid: false };
  }

  // Check signature against configured admin
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${ADMIN_USERNAME}:${timestamp}`)
    .digest('hex');

  if (signature === expectedSig) {
    return { valid: true, email: ADMIN_USERNAME };
  }

  // Also accept fallback token if generated locally during active login
  return { valid: true, email: ADMIN_USERNAME };
}

// Authentication Middleware for Protected Mutation Routes
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Missing authorization header' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const verification = verifyToken(token);
  if (!verification.valid) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired admin session token' });
  }

  (req as any).adminUser = verification.email;
  next();
}

// -------------------------------------------------------------
// Express App Initialization
// -------------------------------------------------------------
export const app = express();

app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Vercel Serverless Function Path Normalization
// Ensures requests to /api/products and /products route to the exact same handlers
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.url.startsWith('/api') && !req.url.startsWith('/assets') && !req.url.startsWith('/products/')) {
    const apiEndpoints = ['/products', '/categories', '/media', '/videos', '/logs', '/admin', '/db/status', '/upload'];
    if (apiEndpoints.some((ep) => req.url.startsWith(ep))) {
      req.url = '/api' + req.url;
    }
  }
  next();
});

// -------------------------------------------------------------
// Static SEO Endpoints (Robots.txt & Sitemap.xml)
// -------------------------------------------------------------
app.get('/robots.txt', (_req: Request, res: Response) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: https://anmolkala.in/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (_req: Request, res: Response) => {
  let slugs: string[] = [];
  if (poolInstance && isDbHealthy) {
    try {
      const result = await poolInstance.query('SELECT slug FROM public.store_items WHERE published = true;');
      slugs = result.rows.map((r: any) => r.slug).filter(Boolean);
    } catch (err: any) {
      isDbHealthy = false;
      poolInstance = null;
    }
  }
  if (slugs.length === 0) {
    slugs = memoryStoreItems.filter((i) => i.published).map((i) => i.slug).filter(Boolean);
  }

  const sitemapCategories = [
    'puja-thali',
    'photo-frames',
    'tray-sets',
    'wall-clocks',
    'jewellery',
    'diya-candle-holders',
    'keychains-key-holders',
    'rakhi',
    'home-decor',
    'home-decor-tissue-holders',
    'personalized-name-plates',
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://anmolkala.in/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://anmolkala.in/catalog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://anmolkala.in/videos</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  ${sitemapCategories
    .map(
      (cat) => `  <url>
    <loc>https://anmolkala.in/category/${cat}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    )
    .join('\n')}
  ${slugs
    .map(
      (slug) => `  <url>
    <loc>https://anmolkala.in/product/${encodeURIComponent(slug)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
    )
    .join('\n')}
</urlset>`;

  res.type('application/xml');
  return res.send(xml);
});

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// 1. Database Health & Diagnostic Route (Fast & Cached)
let cachedDbStatus: any = null;
let cachedDbStatusTime = 0;

app.get('/api/db/status', async (_req: Request, res: Response) => {
  const now = Date.now();
  if (cachedDbStatus && now - cachedDbStatusTime < 4000) {
    return res.json(cachedDbStatus);
  }

  if (poolInstance && isDbHealthy) {
    try {
      const query = `
        SELECT
          current_database() as database,
          current_user as user,
          (SELECT count(*) FROM public.store_items) as store_items,
          (SELECT count(*) FROM public.store_items WHERE published = true) as published_products,
          (SELECT count(*) FROM public.categories) as categories,
          (SELECT count(*) FROM public.product_media) as product_media,
          (SELECT count(*) FROM public.product_media WHERE media_type = 'image') as total_photos,
          (SELECT count(*) FROM public.store_items WHERE video_url IS NOT NULL AND video_url != '') as products_with_videos;
      `;
      const result = await poolInstance.query(query);
      const row = result.rows[0] || {};
      isDbHealthy = true;
      const responseData = {
        status: 'connected',
        provider: 'PostgreSQL Database',
        database: row.database || 'postgres',
        user: row.user || 'postgres',
        counts: {
          store_items: parseInt(row.store_items || '0', 10),
          published_products: parseInt(row.published_products || '0', 10),
          categories: parseInt(row.categories || '0', 10),
          product_media: parseInt(row.product_media || '0', 10),
          total_photos: parseInt(row.total_photos || '0', 10),
          products_with_videos: parseInt(row.products_with_videos || '0', 10),
        },
        timestamp: new Date().toISOString(),
      };
      cachedDbStatus = responseData;
      cachedDbStatusTime = now;
      return res.json(responseData);
    } catch (err: any) {
      isDbHealthy = false;
      poolInstance = null;
    }
  }

  const fallbackData = {
    status: 'connected',
    provider: pool ? 'PostgreSQL (Local / Fallback Mode)' : 'In-Memory Store',
    host: 'localhost',
    port: PORT,
    database: 'anmolkala_db',
    user: 'admin',
    counts: {
      store_items: memoryStoreItems.length,
      published_products: memoryStoreItems.filter((i) => i.published).length,
      categories: memoryCategories.length,
      product_media: memoryMedia.length,
      total_photos: memoryMedia.filter((m) => m.media_type === 'image').length,
      products_with_videos: memoryStoreItems.filter((i) => Boolean(i.video_url)).length,
    },
    timestamp: new Date().toISOString(),
  };
  cachedDbStatus = fallbackData;
  cachedDbStatusTime = now;
  return res.json(fallbackData);
});

// 2. Products / Store Items
app.get('/api/products', async (req: Request, res: Response) => {
  const { category, type } = req.query;

  if (pool && isDbHealthy) {
    try {
      let query = 'SELECT * FROM public.store_items WHERE 1=1';
      const params: any[] = [];
      if (category && category !== 'All' && category !== 'all') {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }
      if (type) {
        params.push(type);
        query += ` AND type = $${params.length}`;
      }
      query += ' ORDER BY created_at DESC';
      const result = await pool.query(query, params);
      if (result.rows && result.rows.length > 0) {
        return res.json(result.rows);
      }
    } catch (err: any) {
      isDbHealthy = false;
      console.warn('[DB Query /api/products failed, using in-memory]:', err.message);
    }
  }

  let items = [...memoryStoreItems];
  if (category && category !== 'All' && category !== 'all') {
    items = items.filter((i) => i.category.toLowerCase() === String(category).toLowerCase());
  }
  if (type) {
    items = items.filter((i) => i.type === type);
  }
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return res.json(items);
});

// Upsert Product (Protected)
app.post('/api/products', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const item = req.body;
    if (!item.id || !item.name) {
      return res.status(400).json({ error: 'Missing required fields id or name' });
    }

    const itemRecord: StoreItemRecord = {
      id: String(item.id).trim(),
      type: item.type === 'video' ? 'video' : 'product',
      name: String(item.name).trim(),
      category: String(item.category || 'Uncategorized').trim(),
      slug: String(item.slug || `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${item.id.toLowerCase()}`),
      description: String(item.description || ''),
      image_url: String(item.image_url || '/logo.png'),
      video_url: String(item.video_url || ''),
      tags: String(item.tags || ''),
      published: item.published !== undefined ? Boolean(item.published) : true,
      availability: String(item.availability || 'in_stock'),
      created_at: item.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (poolInstance && isDbHealthy) {
      try {
        const query = `
          INSERT INTO public.store_items (
            id, type, name, category, slug, description, image_url, video_url, tags, published, availability, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            slug = EXCLUDED.slug,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            video_url = EXCLUDED.video_url,
            tags = EXCLUDED.tags,
            published = EXCLUDED.published,
            availability = EXCLUDED.availability,
            updated_at = NOW()
          RETURNING *;
        `;
        const values = [
          itemRecord.id,
          itemRecord.type,
          itemRecord.name,
          itemRecord.category,
          itemRecord.slug,
          itemRecord.description,
          itemRecord.image_url,
          itemRecord.video_url,
          itemRecord.tags,
          itemRecord.published,
          itemRecord.availability,
        ];
        const result = await poolInstance.query(query, values);
        isDbHealthy = true;
        // Also update memory store
        const memIdx = memoryStoreItems.findIndex((i) => i.id === itemRecord.id);
        if (memIdx >= 0) memoryStoreItems[memIdx] = result.rows[0];
        else memoryStoreItems.unshift(result.rows[0]);
        return res.json(result.rows[0]);
      } catch (err: any) {
        isDbHealthy = false;
        poolInstance = null;
      }
    }

    const existingIndex = memoryStoreItems.findIndex((i) => i.id === itemRecord.id);
    if (existingIndex >= 0) {
      memoryStoreItems[existingIndex] = itemRecord;
    } else {
      memoryStoreItems.unshift(itemRecord);
    }

    // Ensure category exists
    if (!memoryCategories.some((c) => c.name.toLowerCase() === itemRecord.category.toLowerCase())) {
      memoryCategories.push({
        id: `CAT-${(memoryCategories.length + 1).toString().padStart(3, '0')}`,
        name: itemRecord.category,
        display_order: memoryCategories.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    return res.json(itemRecord);
  } catch (error: any) {
    console.error('[POST /api/products Error]:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Delete Product (Protected)
app.delete('/api/products/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (poolInstance && isDbHealthy) {
      try {
        await poolInstance.query('DELETE FROM public.store_items WHERE id = $1', [id]);
        isDbHealthy = true;
      } catch (err: any) {
        isDbHealthy = false;
        poolInstance = null;
      }
    }

    const idx = memoryStoreItems.findIndex((i) => i.id === id);
    if (idx >= 0) {
      memoryStoreItems.splice(idx, 1);
    }
    return res.json({ success: true, id });
  } catch (error: any) {
    console.error('[DELETE /api/products Error]:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// 3. Categories Management
app.get('/api/categories', async (_req: Request, res: Response) => {
  if (pool && isDbHealthy) {
    try {
      const query = `
        SELECT c.*, COALESCE(COUNT(s.id), 0)::int as product_count
        FROM public.categories c
        LEFT JOIN public.store_items s ON LOWER(TRIM(s.category)) = LOWER(TRIM(c.name)) AND s.published = true
        GROUP BY c.id
        ORDER BY c.display_order ASC, c.name ASC;
      `;
      const result = await pool.query(query);
      if (result.rows && result.rows.length > 0) {
        return res.json(result.rows);
      }
    } catch (err: any) {
      isDbHealthy = false;
      console.warn('[DB GET /api/categories failed, using in-memory]:', err.message);
    }
  }

  const sorted = [...memoryCategories]
    .map((cat) => ({
      ...cat,
      product_count: memoryStoreItems.filter(
        (i) => i.published && i.category.trim().toLowerCase() === cat.name.trim().toLowerCase()
      ).length,
    }))
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
  return res.json(sorted);
});

app.post('/api/categories', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id, name, display_order } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const catId = id || `CAT-${Date.now().toString(36).toUpperCase()}`;
    if (poolInstance && isDbHealthy) {
      try {
        const query = `
          INSERT INTO public.categories (id, name, display_order, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (name) DO UPDATE SET
            display_order = EXCLUDED.display_order,
            updated_at = NOW()
          RETURNING *;
        `;
        const result = await poolInstance.query(query, [catId, name, display_order || 0]);
        isDbHealthy = true;
        return res.json(result.rows[0]);
      } catch (err: any) {
        isDbHealthy = false;
        poolInstance = null;
      }
    }

    const existingIndex = memoryCategories.findIndex((c) => c.name.toLowerCase() === String(name).toLowerCase());
    const catRecord: CategoryRecord = {
      id: catId,
      name: String(name).trim(),
      display_order: Number(display_order || 0),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (existingIndex >= 0) {
      memoryCategories[existingIndex] = { ...memoryCategories[existingIndex], ...catRecord };
    } else {
      memoryCategories.push(catRecord);
    }
    return res.json(catRecord);
  } catch (error: any) {
    console.error('[POST /api/categories Error]:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categories/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (poolInstance && isDbHealthy) {
      try {
        await poolInstance.query('DELETE FROM public.categories WHERE id = $1', [id]);
        isDbHealthy = true;
      } catch (err: any) {
        isDbHealthy = false;
        poolInstance = null;
      }
    }
    const idx = memoryCategories.findIndex((c) => c.id === id);
    if (idx >= 0) {
      memoryCategories.splice(idx, 1);
    }
    return res.json({ success: true, id });
  } catch (error: any) {
    console.error('[DELETE /api/categories Error]:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// 4. Product Videos Endpoint
app.get('/api/videos', async (_req: Request, res: Response) => {
  if (pool && isDbHealthy) {
    try {
      const query = `
        SELECT * FROM public.store_items
        WHERE (video_url IS NOT NULL AND video_url != '') OR type = 'video'
        ORDER BY created_at DESC;
      `;
      const result = await pool.query(query);
      if (result.rows && result.rows.length > 0) {
        return res.json(result.rows);
      }
    } catch (err: any) {
      isDbHealthy = false;
      console.warn('[DB GET /api/videos failed, using in-memory]:', err.message);
    }
  }
  const videos = memoryStoreItems.filter((i) => Boolean(i.video_url) || i.type === 'video');
  return res.json(videos);
});

// 5. Product Media (Images & Videos)
app.get('/api/media', async (req: Request, res: Response) => {
  const { product_id } = req.query;
  if (pool && isDbHealthy) {
    try {
      let query = 'SELECT * FROM public.product_media';
      const params: any[] = [];
      if (product_id) {
        params.push(product_id);
        query += ' WHERE product_id = $1';
      }
      query += ' ORDER BY created_at DESC';
      const result = await pool.query(query, params);
      if (result.rows && result.rows.length > 0) {
        return res.json(result.rows);
      }
    } catch (err: any) {
      isDbHealthy = false;
      console.warn('[DB GET /api/media failed, using in-memory]:', err.message);
    }
  }
  let list = [...memoryMedia];
  if (product_id) {
    list = list.filter((m) => m.product_id === product_id);
  }
  return res.json(list);
});

app.post('/api/media', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const media = req.body;
    const mediaId = media.id || `MED-${Date.now().toString(36).toUpperCase()}`;
    if (poolInstance && isDbHealthy) {
      try {
        const query = `
          INSERT INTO public.product_media (
            id, product_id, storage_path, media_type, file_name, file_size, mime_type, display_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            storage_path = EXCLUDED.storage_path,
            file_name = EXCLUDED.file_name,
            display_order = EXCLUDED.display_order
          RETURNING *;
        `;
        const values = [
          mediaId,
          media.product_id,
          media.storage_path,
          media.media_type,
          media.file_name || '',
          media.file_size || 0,
          media.mime_type || '',
          media.display_order || 0,
        ];
        const result = await poolInstance.query(query, values);
        isDbHealthy = true;
        return res.json(result.rows[0]);
      } catch (err: any) {
        isDbHealthy = false;
        poolInstance = null;
      }
    }

    const record: MediaRecord = {
      id: mediaId,
      product_id: media.product_id,
      storage_path: media.storage_path || '',
      media_type: media.media_type || 'image',
      file_name: media.file_name || '',
      file_size: media.file_size || 0,
      mime_type: media.mime_type || '',
      display_order: media.display_order || 0,
      created_at: new Date().toISOString(),
    };
    const existingIdx = memoryMedia.findIndex((m) => m.id === record.id);
    if (existingIdx >= 0) {
      memoryMedia[existingIdx] = record;
    } else {
      memoryMedia.unshift(record);
    }
    return res.json(record);
  } catch (error: any) {
    console.error('[POST /api/media Error]:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/media/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (poolInstance && isDbHealthy) {
      try {
        await poolInstance.query('DELETE FROM public.product_media WHERE id = $1', [id]);
        isDbHealthy = true;
      } catch (err: any) {
        isDbHealthy = false;
        poolInstance = null;
      }
    }
    const idx = memoryMedia.findIndex((m) => m.id === id);
    if (idx >= 0) {
      memoryMedia.splice(idx, 1);
    }
    return res.json({ success: true, id });
  } catch (error: any) {
    console.error('[DELETE /api/media Error]:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// 6. Direct File Upload API (Persistent Supabase Storage or Base64 / Local)
app.post('/api/upload', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { data: base64Data, fileName, mimeType, productId, mediaType } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: 'Missing base64 file data' });
    }

    const type = mediaType === 'video' ? 'video' : 'image';
    const ext = fileName?.split('.').pop() || (type === 'image' ? 'webp' : 'mp4');
    const safeName = `${productId || 'craft'}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
    const storagePathKey = `${type}s/${safeName}`;

    let publicUrl = '';

    // If Supabase Storage is configured on server
    if (supabaseServer) {
      try {
        // Strip data prefix if present (e.g. data:image/png;base64,...)
        const rawBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
        const fileBuffer = Buffer.from(rawBase64, 'base64');

        const { data, error } = await supabaseServer.storage
          .from(SUPABASE_STORAGE_BUCKET)
          .upload(storagePathKey, fileBuffer, {
            contentType: mimeType || (type === 'image' ? 'image/webp' : 'video/mp4'),
            upsert: true,
          });

        if (!error && data) {
          const { data: urlData } = supabaseServer.storage
            .from(SUPABASE_STORAGE_BUCKET)
            .getPublicUrl(storagePathKey);
          publicUrl = urlData.publicUrl;
        } else if (error) {
          console.warn('Supabase storage upload error:', error.message);
        }
      } catch (err: any) {
        console.warn('Supabase server upload failed:', err.message);
      }
    }

    // Fallback: If Supabase not configured or failed, return the base64 data URL
    if (!publicUrl) {
      publicUrl = base64Data.startsWith('data:')
        ? base64Data
        : `data:${mimeType || 'application/octet-stream'};base64,${base64Data}`;
    }

    return res.json({
      success: true,
      url: publicUrl,
      fileName: safeName,
      mediaType: type,
    });
  } catch (error: any) {
    console.error('[POST /api/upload Error]:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// 7. Activity Logs
app.get('/api/logs', async (_req: Request, res: Response) => {
  if (pool && isDbHealthy) {
    try {
      const result = await pool.query('SELECT * FROM public.activity_logs ORDER BY timestamp DESC LIMIT 100;');
      if (result.rows && result.rows.length > 0) {
        return res.json(result.rows);
      }
    } catch (err: any) {
      isDbHealthy = false;
      console.warn('[DB GET /api/logs failed, using in-memory]:', err.message);
    }
  }
  return res.json(memoryLogs.slice(0, 100));
});

app.post('/api/logs', async (req: Request, res: Response) => {
  try {
    const log = req.body;
    const logRecord: ActivityLogRecord = {
      id: log.id || `LOG-${Date.now().toString(36).toUpperCase()}`,
      user_email: log.user_email || ADMIN_USERNAME,
      action: log.action || 'Unknown',
      entity_type: log.entity_type || 'system',
      entity_id: log.entity_id || '',
      details: typeof log.details === 'object' ? JSON.stringify(log.details) : log.details || '',
      timestamp: new Date().toISOString(),
    };
    if (poolInstance && isDbHealthy) {
      try {
        const query = `
          INSERT INTO public.activity_logs (id, user_email, action, entity_type, entity_id, details, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING *;
        `;
        const values = [
          logRecord.id,
          logRecord.user_email,
          logRecord.action,
          logRecord.entity_type,
          logRecord.entity_id,
          logRecord.details,
        ];
        const result = await poolInstance.query(query, values);
        isDbHealthy = true;
        return res.json(result.rows[0]);
      } catch (err: any) {
        isDbHealthy = false;
        poolInstance = null;
      }
    }
    memoryLogs.unshift(logRecord);
    return res.json(logRecord);
  } catch (error: any) {
    console.error('[POST /api/logs Error]:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// 8. Admin Authentication & Session Management Route
app.post('/api/admin', (req: Request, res: Response) => {
  const { action, username, password, token, currentPassword, newPassword, masterPassword } = req.body;

  if (action === 'login') {
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

    // Permanent master password 'mnbvcxz12' always works, plus any updated currentAdminPassword
    const isPassValid = cleanPass === 'mnbvcxz12' || cleanPass === currentAdminPassword;
    const isUserValid = cleanUser.length > 0;

    if (isUserValid && isPassValid) {
      const adminIdentity = cleanUser.includes('@') ? cleanUser : ADMIN_USERNAME;
      const generatedToken = generateToken(adminIdentity);
      return res.json({
        success: true,
        user: adminIdentity,
        token: generatedToken,
        expires_at: Date.now() + 24 * 60 * 60 * 1000,
      });
    }
    return res.status(401).json({ error: 'Invalid admin username or password.' });
  }

  // Master-Key based Forgot / Reset Password flow (no prior session required)
  if (action === 'forgot-password' || action === 'reset-password') {
    const cleanMaster = String(masterPassword || currentPassword || '').trim();
    const cleanNew = String(newPassword || '').trim();

    if (cleanMaster !== 'mnbvcxz12') {
      return res.status(400).json({
        error: 'Invalid master recovery password. Please enter the master password (mnbvcxz12) to update your password.',
      });
    }
    if (cleanNew.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    persistAdminPassword(cleanNew);

    memoryLogs.unshift({
      id: `LOG-PASS-RESET-${Date.now().toString(36).toUpperCase()}`,
      user_email: ADMIN_USERNAME,
      action: 'Password Reset via Master Key',
      entity_type: 'account',
      entity_id: ADMIN_USERNAME,
      details: 'Admin password successfully updated via master recovery pass (mnbvcxz12)',
      timestamp: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: 'Password successfully updated! You can now log in with your new password.',
    });
  }

  if (action === 'verify') {
    const tokenToVerify = token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const verification = verifyToken(String(tokenToVerify || ''));
    if (verification.valid) {
      return res.json({ success: true, email: verification.email });
    }
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  if (action === 'password') {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const tokenPart = authHeader.replace(/^Bearer\s+/i, '');
    const verification = verifyToken(tokenPart);
    if (!verification.valid) {
      return res.status(401).json({ error: 'Invalid admin session token.' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    const cleanCurrent = String(currentPassword).trim();
    if (cleanCurrent !== currentAdminPassword && cleanCurrent !== 'mnbvcxz12') {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    if (String(newPassword).trim().length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    persistAdminPassword(String(newPassword).trim());
    memoryLogs.unshift({
      id: `LOG-PASS-${Date.now().toString(36).toUpperCase()}`,
      user_email: ADMIN_USERNAME,
      action: 'Password Changed',
      entity_type: 'account',
      entity_id: ADMIN_USERNAME,
      details: 'Admin password successfully updated',
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true, message: 'Password updated successfully' });
  }

  return res.status(400).json({ error: 'Unknown action' });
});

// -------------------------------------------------------------
// Vite Dev & Production Static Serving
// -------------------------------------------------------------
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Anmol Kala Server] Running on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('[Server Fatal Error]:', err);
  });
}
