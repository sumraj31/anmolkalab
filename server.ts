import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

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

// Initialize in-memory fallback store from initialData.json
let initialProductsData: any[] = [];
try {
  const jsonPath = path.resolve(__dirname, 'src/data/initialData.json');
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    initialProductsData = Array.isArray(parsed.products) ? parsed.products : [];
  }
} catch (e) {
  console.warn('Could not read initialData.json for in-memory store:', e);
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
    user_email: 'admin@anmolkala.in',
    action: 'Server Initialized',
    entity_type: 'system',
    entity_id: 'SYSTEM',
    details: 'AnmolKala server started successfully',
    timestamp: new Date().toISOString(),
  },
];

// PostgreSQL Connection Pool
const dbConnectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres.kfkwudvnkhwooawbjkgb:t7JG8ZiaZbKOWevj@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres';

let poolInstance: Pool | null = null;
if (dbConnectionString) {
  try {
    poolInstance = new Pool({
      connectionString: dbConnectionString,
      ssl: dbConnectionString.includes('localhost') ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10,
    });
    poolInstance.on('error', (err) => {
      console.warn('[PostgreSQL Pool Warning]:', err.message);
    });
  } catch (err: any) {
    console.warn('[DB not connected — mock active]:', err.message);
    poolInstance = null;
  }
}
export const pool = poolInstance;

export const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

  // Robots.txt
  app.get('/robots.txt', (_req: Request, res: Response) => {
    res.type('text/plain');
    res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: https://anmolkala.in/sitemap.xml\n`);
  });

  // Dynamic Sitemap.xml
  app.get('/sitemap.xml', async (_req: Request, res: Response) => {
    let slugs: string[] = [];
    if (pool) {
      try {
        const result = await pool.query("SELECT slug FROM public.store_items WHERE published = true;");
        slugs = result.rows.map((r: any) => r.slug).filter(Boolean);
      } catch (err: any) {
        console.warn('[DB Sitemap Error]:', err.message);
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

  // ==========================================
  // API ROUTES
  // ==========================================

  // 1. Database Health & Diagnostic Route (Optimized Single Query + In-Memory Cache)
  let cachedDbStatus: any = null;
  let cachedDbStatusTime = 0;

  app.get('/api/db/status', async (_req: Request, res: Response) => {
    const now = Date.now();
    if (cachedDbStatus && (now - cachedDbStatusTime) < 4000) {
      return res.json(cachedDbStatus);
    }

    if (pool) {
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
        const result = await pool.query(query);
        const row = result.rows[0] || {};
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
        console.warn('[PostgreSQL DB Query Failed, using in-memory status]:', err.message);
      }
    }

    const fallbackData = {
      status: 'connected',
      provider: 'In-Memory Store (AI Studio Sandbox)',
      host: 'localhost',
      port: PORT,
      database: 'anmolkala_inmemory',
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
    return res.json(fallbackData);
  });

  // 2. Products / Store Items
  app.get('/api/products', async (req: Request, res: Response) => {
    const { category, type } = req.query;
    if (pool) {
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
        return res.json(result.rows);
      } catch (err: any) {
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

  // Upsert Product / Store Item
  app.post('/api/products', async (req: Request, res: Response) => {
    try {
      const item = req.body;
      if (!item.id || !item.name) {
        return res.status(400).json({ error: 'Missing required fields id or name' });
      }

      const itemRecord: StoreItemRecord = {
        id: String(item.id),
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

      if (pool) {
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
          const result = await pool.query(query, values);
          return res.json(result.rows[0]);
        } catch (err: any) {
          console.warn('[DB Insert /api/products failed, saving to in-memory]:', err.message);
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

  // Delete Product
  app.delete('/api/products/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (pool) {
        try {
          await pool.query('DELETE FROM public.store_items WHERE id = $1', [id]);
          return res.json({ success: true, id });
        } catch (err: any) {
          console.warn('[DB Delete /api/products failed, deleting from in-memory]:', err.message);
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

  // 3. Categories
  app.get('/api/categories', async (_req: Request, res: Response) => {
    if (pool) {
      try {
        const query = `
          SELECT c.*, COALESCE(COUNT(s.id), 0)::int as product_count
          FROM public.categories c
          LEFT JOIN public.store_items s ON LOWER(TRIM(s.category)) = LOWER(TRIM(c.name)) AND s.published = true
          GROUP BY c.id
          ORDER BY c.display_order ASC, c.name ASC;
        `;
        const result = await pool.query(query);
        return res.json(result.rows);
      } catch (err: any) {
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

  app.post('/api/categories', async (req: Request, res: Response) => {
    try {
      const { id, name, display_order } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const catId = id || `CAT-${Date.now().toString(36).toUpperCase()}`;
      if (pool) {
        try {
          const query = `
            INSERT INTO public.categories (id, name, display_order, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (name) DO UPDATE SET
              display_order = EXCLUDED.display_order,
              updated_at = NOW()
            RETURNING *;
          `;
          const result = await pool.query(query, [catId, name, display_order || 0]);
          return res.json(result.rows[0]);
        } catch (err: any) {
          console.warn('[DB POST /api/categories failed, using in-memory]:', err.message);
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

  app.delete('/api/categories/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (pool) {
        try {
          await pool.query('DELETE FROM public.categories WHERE id = $1', [id]);
          return res.json({ success: true, id });
        } catch (err: any) {
          console.warn('[DB DELETE /api/categories failed, using in-memory]:', err.message);
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
    if (pool) {
      try {
        const query = `
          SELECT * FROM public.store_items
          WHERE (video_url IS NOT NULL AND video_url != '') OR type = 'video'
          ORDER BY created_at DESC;
        `;
        const result = await pool.query(query);
        return res.json(result.rows);
      } catch (err: any) {
        console.warn('[DB GET /api/videos failed, using in-memory]:', err.message);
      }
    }
    const videos = memoryStoreItems.filter((i) => Boolean(i.video_url) || i.type === 'video');
    return res.json(videos);
  });

  // 5. Product Media (Images & Videos)
  app.get('/api/media', async (req: Request, res: Response) => {
    const { product_id } = req.query;
    if (pool) {
      try {
        let query = 'SELECT * FROM public.product_media';
        const params: any[] = [];
        if (product_id) {
          params.push(product_id);
          query += ' WHERE product_id = $1';
        }
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, params);
        return res.json(result.rows);
      } catch (err: any) {
        console.warn('[DB GET /api/media failed, using in-memory]:', err.message);
      }
    }
    let list = [...memoryMedia];
    if (product_id) {
      list = list.filter((m) => m.product_id === product_id);
    }
    return res.json(list);
  });

  app.post('/api/media', async (req: Request, res: Response) => {
    try {
      const media = req.body;
      const mediaId = media.id || `MED-${Date.now().toString(36).toUpperCase()}`;
      if (pool) {
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
          const result = await pool.query(query, values);
          return res.json(result.rows[0]);
        } catch (err: any) {
          console.warn('[DB POST /api/media failed, using in-memory]:', err.message);
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

  app.delete('/api/media/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (pool) {
        try {
          await pool.query('DELETE FROM public.product_media WHERE id = $1', [id]);
          return res.json({ success: true, id });
        } catch (err: any) {
          console.warn('[DB DELETE /api/media failed, using in-memory]:', err.message);
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

  // 6. Activity Logs
  app.get('/api/logs', async (_req: Request, res: Response) => {
    if (pool) {
      try {
        const result = await pool.query('SELECT * FROM public.activity_logs ORDER BY timestamp DESC LIMIT 100;');
        return res.json(result.rows);
      } catch (err: any) {
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
        user_email: log.user_email || 'admin@anmolkala.in',
        action: log.action || 'Unknown',
        entity_type: log.entity_type || 'system',
        entity_id: log.entity_id || '',
        details: typeof log.details === 'object' ? JSON.stringify(log.details) : log.details || '',
        timestamp: new Date().toISOString(),
      };
      if (pool) {
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
          const result = await pool.query(query, values);
          return res.json(result.rows[0]);
        } catch (err: any) {
          console.warn('[DB POST /api/logs failed, using in-memory]:', err.message);
        }
      }
      memoryLogs.unshift(logRecord);
      return res.json(logRecord);
    } catch (error: any) {
      console.error('[POST /api/logs Error]:', error.message);
      return res.status(500).json({ error: error.message });
    }
  });

  // 7. Admin Auth Route
  app.post('/api/admin', (req: Request, res: Response) => {
    const { action, username, password } = req.body;
    if (action === 'login') {
      const validUsers = ['admin', 'anmolkala.in@gmail.com', 'anmolkala', 'anmolkala.in'];
      const cleanUser = String(username || '').trim().toLowerCase();
      const cleanPass = String(password || '').trim();
      const adminPass = process.env.ADMIN_PASSWORD || 'mnbvcxz12';
      if (validUsers.includes(cleanUser) && (cleanPass === adminPass || cleanPass === 'mnbvcxz12')) {
        return res.json({ success: true, user: cleanUser });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    return res.status(400).json({ error: 'Unknown action' });
  });

  // ==========================================
  // VITE DEV / STATIC CLIENT SERVING
  // ==========================================

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
