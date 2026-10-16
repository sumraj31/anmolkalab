import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
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

// -------------------------------------------------------------
// Baseline Handcrafted Products Catalog
// -------------------------------------------------------------
let baselineProducts: any[] = [];
try {
  const jsonPath = path.resolve(__dirname, 'src/data/initialData.json');
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const rawProducts = Array.isArray(parsed.products) ? parsed.products : [];
    baselineProducts = rawProducts.map((p: any, idx: number) => {
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
        type: p.type || 'product',
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
  }
} catch (e) {
  console.warn('Could not read initialData.json:', e);
}

// -------------------------------------------------------------
// External Supabase Cloud Database Client
// -------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  } catch (err: any) {
    console.warn('[Server] Supabase client init warning:', err?.message);
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
  if (isNaN(timestamp) || Date.now() - timestamp > 24 * 60 * 60 * 1000) {
    return { valid: false };
  }

  return { valid: true, email: ADMIN_USERNAME };
}

// -------------------------------------------------------------
// Express App Initialization
// -------------------------------------------------------------
export const app = express();

app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Path Normalization for serverless deployment
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
  if (supabase) {
    try {
      const { data } = await supabase
        .from('store_items')
        .select('slug')
        .eq('published', true);
      if (data) {
        slugs = data.map((r: any) => r.slug).filter(Boolean);
      }
    } catch (err) {}
  }

  if (slugs.length === 0) {
    slugs = baselineProducts.filter((p) => p.published).map((p) => p.slug).filter(Boolean);
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
// API ROUTES — Powered exclusively by Supabase Cloud
// -------------------------------------------------------------

// Database Status Route
app.get('/api/db/status', async (_req: Request, res: Response) => {
  if (!supabase) {
    return res.json({
      status: 'offline',
      provider: 'Supabase Cloud (Pending Configuration)',
      database: 'supabase',
      message: 'SUPABASE_URL and SUPABASE_ANON_KEY are not set in the environment variables.',
      counts: {
        store_items: baselineProducts.length,
        published_products: baselineProducts.filter((i) => i.published !== false).length,
        categories: 11,
        product_media: baselineProducts.length,
        total_photos: baselineProducts.length,
        products_with_videos: baselineProducts.filter((i) => Boolean(i.video_url)).length,
      },
    });
  }

  try {
    const [productsRes, categoriesRes, mediaRes] = await Promise.all([
      supabase.from('store_items').select('id, published, video_url, type'),
      supabase.from('categories').select('id'),
      supabase.from('product_media').select('id, media_type'),
    ]);

    if (productsRes.error) {
      return res.json({
        status: 'error',
        provider: 'Supabase Cloud',
        database: 'supabase',
        message: productsRes.error.message,
        counts: {
          store_items: baselineProducts.length,
          categories: 11,
          product_media: baselineProducts.length,
          products_with_videos: baselineProducts.filter((i) => Boolean(i.video_url)).length,
        },
      });
    }

    const items = productsRes.data || [];
    const cats = categoriesRes.data || [];
    const media = mediaRes.data || [];

    return res.json({
      status: 'connected',
      provider: 'Supabase Cloud Database',
      database: 'supabase',
      counts: {
        store_items: items.length || baselineProducts.length,
        published_products: items.length ? items.filter((i: any) => i.published !== false).length : baselineProducts.length,
        categories: cats.length || 11,
        product_media: media.length || baselineProducts.length,
        total_photos: media.length ? media.filter((m: any) => m.media_type === 'image').length : baselineProducts.length,
        products_with_videos: items.length ? items.filter((i: any) => Boolean(i.video_url)).length : baselineProducts.filter((i) => Boolean(i.video_url)).length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.json({
      status: 'error',
      provider: 'Supabase Cloud',
      database: 'supabase',
      message: err?.message || 'Database query failed',
    });
  }
});

// Products / Store Items from Supabase Cloud
app.get('/api/products', async (req: Request, res: Response) => {
  if (supabase) {
    try {
      let query = supabase.from('store_items').select('*').order('created_at', { ascending: false });
      const { category, type } = req.query;

      if (category && category !== 'All' && category !== 'all') {
        query = query.ilike('category', String(category));
      }
      if (type) {
        query = query.eq('type', String(type));
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return res.json(data);
      }
    } catch (err: any) {}
  }

  // Return baseline products to ensure original handcrafted catalog is preserved
  let items = [...baselineProducts];
  const { category, type } = req.query;
  if (category && category !== 'All' && category !== 'all') {
    items = items.filter((i) => i.category.toLowerCase() === String(category).toLowerCase());
  }
  if (type) {
    items = items.filter((i) => i.type === type);
  }
  return res.json(items);
});

// Categories from Supabase Cloud
app.get('/api/categories', async (_req: Request, res: Response) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });

      if (!error && data && data.length > 0) {
        return res.json(data);
      }
    } catch (err: any) {}
  }

  const unique = Array.from(new Set(baselineProducts.map((p) => p.category.trim()))).filter(Boolean).sort();
  const cats = unique.map((name, i) => ({
    id: `cat-${i + 1}`,
    name,
    display_order: i,
    created_at: new Date().toISOString(),
  }));
  return res.json(cats);
});

// Videos from Supabase Cloud
app.get('/api/videos', async (_req: Request, res: Response) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('store_items')
        .select('*')
        .neq('video_url', '')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return res.json(data);
      }
    } catch (err: any) {}
  }

  const vids = baselineProducts.filter((p) => Boolean(p.video_url));
  return res.json(vids);
});

// Media from Supabase Cloud
app.get('/api/media', async (req: Request, res: Response) => {
  if (supabase) {
    try {
      let query = supabase.from('product_media').select('*').order('display_order', { ascending: true });
      if (req.query.product_id) {
        query = query.eq('product_id', String(req.query.product_id));
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return res.json(data);
      }
    } catch (err: any) {}
  }

  const list: any[] = [];
  const targetProds = req.query.product_id
    ? baselineProducts.filter((p) => p.id === req.query.product_id)
    : baselineProducts;

  targetProds.forEach((p) => {
    if (p.image_url) {
      list.push({
        id: `med-img-${p.id}`,
        product_id: p.id,
        storage_path: p.image_url,
        media_type: 'image',
        file_name: p.image_url.split('/').pop() || `${p.slug}.webp`,
        display_order: 0,
        created_at: p.created_at,
      });
    }
    if (p.video_url) {
      list.push({
        id: `med-vid-${p.id}`,
        product_id: p.id,
        storage_path: p.video_url,
        media_type: 'video',
        file_name: `${p.slug}-video.mp4`,
        display_order: 1,
        created_at: p.created_at,
      });
    }
  });
  return res.json(list);
});

// Admin Authentication & Session Management Route
app.post('/api/admin', (req: Request, res: Response) => {
  const { action, username, password, token, currentPassword, newPassword, masterPassword } = req.body;

  if (action === 'login') {
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

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
