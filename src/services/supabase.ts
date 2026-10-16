import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { StoreItem, CategoryItem, MediaItem, ActivityLog, AdminSession, ProductAvailability } from '../types';
import { defaultProducts } from '../data/products';

// Baseline products preserving the original handcrafted catalog
export const baselineProducts: StoreItem[] = defaultProducts.map((p, idx) => {
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

// Environment Variables — Supports both direct Vite client and standard deployment platforms
const proc = (typeof globalThis !== 'undefined' && (globalThis as any).process?.env) || {};

const SUPABASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SUPABASE_URL || import.meta.env?.SUPABASE_URL)) ||
  proc.VITE_SUPABASE_URL ||
  proc.SUPABASE_URL ||
  '';

const SUPABASE_ANON_KEY =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SUPABASE_ANON_KEY || import.meta.env?.SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.SUPABASE_PUBLISHABLE_KEY)) ||
  proc.VITE_SUPABASE_ANON_KEY ||
  proc.SUPABASE_ANON_KEY ||
  proc.SUPABASE_PUBLISHABLE_KEY ||
  '';

const STORAGE_BUCKET =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_STORAGE_BUCKET) ||
  proc.SUPABASE_STORAGE_BUCKET ||
  'anmolkala-media';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
};

export const getSupabaseConfigStatus = () => ({
  hasUrl: Boolean(SUPABASE_URL),
  hasAnonKey: Boolean(SUPABASE_ANON_KEY),
  url: SUPABASE_URL ? `${SUPABASE_URL.slice(0, 16)}...` : null,
});

// Single Authoritative Supabase Client
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;

// Auth Session Storage Keys (Used strictly for admin login session, NOT product data)
const SESSION_STORAGE_KEY = 'anmolkala_admin_session';

// Clean any legacy browser-specific product storage so old local caches cannot override cloud data
export function cleanLegacyStorage() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('anmolkala_store_items');
    localStorage.removeItem('anmolkala_admin_categories');
    localStorage.removeItem('anmolkala_admin_media');
    localStorage.removeItem('ak_store_items');
  } catch (e) {}
}

// Generate unique identifier for crafts & media
export function generateUniqueId(prefix = 'AK'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    const uuid = crypto.randomUUID();
    return prefix ? `${prefix}-${uuid.slice(0, 8).toUpperCase()}` : uuid;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

export function generateMediaId(): string {
  return `MED-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

export async function resolveMediaUrl(url: string | undefined): Promise<string> {
  return url || '';
}

export async function getMediaBlobUrl(id: string): Promise<string | null> {
  return null;
}

// -------------------------------------------------------------
// Real-Time Subscriptions for Products & Categories
// -------------------------------------------------------------
export type RealtimeChangeCallback<T = any> = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
}) => void;

/**
 * Subscribes to real-time changes on public.store_items table.
 * Connected visitors receive updates immediately when an admin adds, edits, or deletes a product.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToProducts(callback: RealtimeChangeCallback<StoreItem>): () => void {
  if (!supabase) return () => {};

  const channel: RealtimeChannel = supabase
    .channel('realtime:store_items')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'store_items' },
      (payload: any) => {
        callback({
          eventType: payload.eventType,
          new: payload.new as StoreItem,
          old: payload.old as Partial<StoreItem>,
        });
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        // Connected to Realtime
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[Supabase Realtime] store_items channel error, will auto-reconnect:', err);
      }
    });

  return () => {
    supabase?.removeChannel(channel);
  };
}

/**
 * Subscribes to real-time changes on public.categories table.
 */
export function subscribeToCategories(callback: RealtimeChangeCallback<CategoryItem>): () => void {
  if (!supabase) return () => {};

  const channel: RealtimeChannel = supabase
    .channel('realtime:categories')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'categories' },
      (payload: any) => {
        callback({
          eventType: payload.eventType,
          new: payload.new as CategoryItem,
          old: payload.old as Partial<CategoryItem>,
        });
      }
    )
    .subscribe();

  return () => {
    supabase?.removeChannel(channel);
  };
}

// -------------------------------------------------------------
// Products / Store Items CRUD — External Supabase as Single Source of Truth
// -------------------------------------------------------------
export async function fetchProducts(): Promise<StoreItem[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('store_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data as StoreItem[];
      }
    } catch (err: any) {
      console.warn('[Supabase fetchProducts warning]:', err?.message);
    }
  }

  // Preserve all original handcrafted products
  return baselineProducts;
}

export async function saveProduct(item: StoreItem): Promise<StoreItem> {
  if (!supabase) {
    throw new Error('Supabase database is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  const now = new Date().toISOString();
  const productToSave: StoreItem = {
    ...item,
    id: item.id || generateUniqueId('AK'),
    type: item.type === 'video' ? 'video' : 'product',
    name: item.name.trim(),
    category: item.category?.trim() || 'Uncategorized',
    slug:
      item.slug ||
      `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${item.id.toLowerCase()}`,
    description: item.description || '',
    image_url: item.image_url || '/logo.png',
    video_url: item.video_url || '',
    tags: item.tags || '',
    published: item.published !== false,
    availability: item.availability || 'in_stock',
    created_at: item.created_at || now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('store_items')
    .upsert(productToSave, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('[Supabase saveProduct Error]:', error.message);
    throw new Error(error.message);
  }

  // Ensure category exists in categories table
  if (productToSave.category) {
    await ensureCategoryExists(productToSave.category);
  }

  await logActivity(
    'Product Saved',
    'product',
    productToSave.id,
    `Product "${productToSave.name}" (${productToSave.id}) saved in Supabase Cloud`
  );

  return (data || productToSave) as StoreItem;
}

export async function deleteProduct(productId: string): Promise<boolean> {
  if (!supabase) {
    throw new Error('Supabase database is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  const { error } = await supabase
    .from('store_items')
    .delete()
    .eq('id', productId);

  if (error) {
    console.error('[Supabase deleteProduct Error]:', error.message);
    throw new Error(error.message);
  }

  await logActivity('Product Deleted', 'product', productId, `Deleted product ID ${productId} from Supabase Cloud`);
  return true;
}

// -------------------------------------------------------------
// Categories Management
// -------------------------------------------------------------
export async function fetchCategories(): Promise<CategoryItem[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });

      if (!error && data && data.length > 0) {
        return data as CategoryItem[];
      }
    } catch (e) {}
  }

  // Derive categories from original handcrafted products
  const unique = Array.from(new Set(baselineProducts.map((p) => p.category.trim()))).filter(Boolean).sort();
  return unique.map((name, i) => ({
    id: `cat-${i + 1}`,
    name,
    display_order: i,
    created_at: new Date().toISOString(),
  }));
}

export async function saveCategory(cat: CategoryItem): Promise<CategoryItem> {
  if (!supabase) {
    throw new Error('Supabase database is not configured.');
  }

  const now = new Date().toISOString();
  const categoryToSave: CategoryItem = {
    ...cat,
    id: cat.id || `CAT-${Date.now().toString(36).toUpperCase()}`,
    updated_at: now,
    created_at: cat.created_at || now,
  };

  const { data, error } = await supabase
    .from('categories')
    .upsert(categoryToSave, { onConflict: 'name' })
    .select()
    .single();

  if (error) {
    console.error('[Supabase saveCategory Error]:', error.message);
    throw new Error(error.message);
  }

  return (data || categoryToSave) as CategoryItem;
}

export async function ensureCategoryExists(categoryName: string): Promise<void> {
  if (!categoryName || !supabase) return;
  const current = await fetchCategories();
  if (!current.some((c) => c.name.toLowerCase() === categoryName.trim().toLowerCase())) {
    await saveCategory({
      id: `CAT-${Date.now().toString(36).toUpperCase()}`,
      name: categoryName.trim(),
      display_order: current.length,
    });
  }
}

export async function deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const categories = await fetchCategories();
  const cat = categories.find((c) => c.id === id);
  if (!cat) return { success: false, error: 'Category not found' };

  // Check if products are currently assigned to this category
  const products = await fetchProducts();
  const assigned = products.filter((p) => p.category.toLowerCase() === cat.name.toLowerCase());
  if (assigned.length > 0) {
    return {
      success: false,
      error: `Cannot delete "${cat.name}". It contains ${assigned.length} product(s). Please reassign them first.`,
    };
  }

  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// -------------------------------------------------------------
// Media Management & Supabase Cloud Storage
// -------------------------------------------------------------
export async function fetchMediaItems(productId?: string): Promise<MediaItem[]> {
  if (supabase) {
    try {
      let query = supabase
        .from('product_media')
        .select('*')
        .order('display_order', { ascending: true });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data as MediaItem[];
      }
    } catch (e) {}
  }

  // Baseline media for products
  const list: MediaItem[] = [];
  const targetProds = productId ? baselineProducts.filter((p) => p.id === productId) : baselineProducts;
  targetProds.forEach((p) => {
    if (p.image_url) {
      list.push({
        id: `med-img-${p.id}`,
        product_id: p.id,
        storage_path: p.image_url,
        media_type: 'image',
        file_name: p.image_url.split('/').pop() || `${p.slug}.webp`,
        display_order: 0,
        created_at: p.created_at || new Date().toISOString(),
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
        created_at: p.created_at || new Date().toISOString(),
      });
    }
  });
  return list;
}

export async function uploadMediaFile(
  file: File,
  productId: string,
  mediaType: 'image' | 'video'
): Promise<MediaItem> {
  if (!supabase) {
    throw new Error('Supabase Storage is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  const mediaId = generateMediaId();
  const fileExt = file.name.split('.').pop() || (mediaType === 'image' ? 'webp' : 'mp4');
  const safeFilename = `${productId || 'craft'}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${fileExt}`;
  const filePath = `${mediaType}s/${safeFilename}`;

  // 1. Upload file directly to Supabase Cloud Storage bucket
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || (mediaType === 'image' ? 'image/webp' : 'video/mp4'),
    });

  if (uploadError) {
    console.error('[Supabase Storage Upload Error]:', uploadError.message);
    throw new Error(`Upload failed: ${uploadError.message}. Make sure the '${STORAGE_BUCKET}' bucket exists in Supabase Storage with public access.`);
  }

  // 2. Retrieve the public HTTPS URL from Supabase Storage
  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  const storagePath = publicUrlData.publicUrl;

  const mediaItem: MediaItem = {
    id: mediaId,
    product_id: productId,
    storage_path: storagePath,
    media_type: mediaType,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
    display_order: 0,
    created_at: new Date().toISOString(),
  };

  // 3. Save media metadata in public.product_media table
  try {
    const { data: insertedMedia } = await supabase
      .from('product_media')
      .insert(mediaItem)
      .select()
      .single();

    if (insertedMedia) {
      return insertedMedia as MediaItem;
    }
  } catch (e) {}

  return mediaItem;
}

export interface VideoUploadPayload {
  file: File;
  mode: 'existing' | 'new';
  productId?: string;
  newProduct?: {
    name: string;
    category: string;
    description: string;
    availability: ProductAvailability;
    tags?: string;
  };
}

export async function uploadProductVideoWithDetails(
  payload: VideoUploadPayload
): Promise<{ success: boolean; mediaItem: MediaItem; product: StoreItem }> {
  let targetProductId = payload.productId;
  let targetProduct: StoreItem | undefined;

  if (payload.mode === 'new') {
    const np = payload.newProduct;
    if (!np || !np.name.trim()) {
      throw new Error('Product name is required for new video product');
    }

    const newId = generateUniqueId('AK');
    const slug = `${np.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${newId.toLowerCase()}`;
    const initialItem: StoreItem = {
      id: newId,
      type: 'product',
      name: np.name.trim(),
      category: np.category.trim() || 'Puja Thali',
      slug,
      description: np.description.trim() || `Handmade resin art video showcase for ${np.name.trim()}.`,
      image_url: '/logo.png',
      video_url: '',
      tags: np.tags || `${np.name} video resin handmade craft`,
      published: true,
      availability: np.availability || 'in_stock',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    targetProduct = await saveProduct(initialItem);
    targetProductId = targetProduct.id;
  } else {
    if (!targetProductId) {
      throw new Error('Please select an existing product to attach this video');
    }
    const products = await fetchProducts();
    targetProduct = products.find((p) => p.id === targetProductId);
  }

  const mediaItem = await uploadMediaFile(payload.file, targetProductId!, 'video');

  // Update target product with the video URL
  if (targetProduct) {
    targetProduct.video_url = mediaItem.storage_path;
    await saveProduct(targetProduct);
  }

  return {
    success: true,
    mediaItem,
    product: targetProduct!,
  };
}

export async function deleteMediaItem(mediaId: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.from('product_media').delete().eq('id', mediaId);
  if (error) {
    console.error('[Supabase deleteMediaItem Error]:', error.message);
    throw new Error(error.message);
  }
  return true;
}

export async function deleteProductVideoOnly(productId: string, mediaId?: string): Promise<boolean> {
  if (mediaId) {
    try {
      await deleteMediaItem(mediaId);
    } catch (e) {}
  }

  const products = await fetchProducts();
  const target = products.find((p) => p.id === productId);
  if (target) {
    target.video_url = '';
    await saveProduct(target);
  }

  return true;
}

// -------------------------------------------------------------
// Database Health & Status (Direct from Supabase Cloud)
// -------------------------------------------------------------
export interface DatabaseStatus {
  status: 'connected' | 'offline' | 'error';
  provider: string;
  database: string;
  message?: string;
  counts?: {
    store_items: number;
    published_products?: number;
    categories: number;
    product_media: number;
    total_photos?: number;
    products_with_videos: number;
  };
  timestamp?: string;
}

export async function fetchDatabaseStatus(): Promise<DatabaseStatus> {
  if (!supabase) {
    return {
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
    };
  }

  try {
    const [productsRes, categoriesRes, mediaRes] = await Promise.all([
      supabase.from('store_items').select('id, published, video_url, type'),
      supabase.from('categories').select('id'),
      supabase.from('product_media').select('id, media_type'),
    ]);

    if (productsRes.error) {
      return {
        status: 'error',
        provider: 'Supabase Cloud',
        database: 'supabase',
        message: productsRes.error.message,
        counts: {
          store_items: 0,
          categories: 0,
          product_media: 0,
          products_with_videos: 0,
        },
      };
    }

    const items = productsRes.data || [];
    const cats = categoriesRes.data || [];
    const media = mediaRes.data || [];

    return {
      status: 'connected',
      provider: 'Supabase Cloud Database',
      database: 'supabase',
      counts: {
        store_items: items.length,
        published_products: items.filter((i: any) => i.published !== false).length,
        categories: cats.length,
        product_media: media.length,
        total_photos: media.filter((m: any) => m.media_type === 'image').length,
        products_with_videos: items.filter((i: any) => Boolean(i.video_url)).length,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      status: 'error',
      provider: 'Supabase Cloud',
      database: 'supabase',
      message: err?.message || 'Failed to connect to Supabase database',
    };
  }
}

// -------------------------------------------------------------
// Activity Logging
// -------------------------------------------------------------
export async function fetchActivityLogs(): Promise<ActivityLog[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error) {
    return [];
  }
  return (data || []) as ActivityLog[];
}

export async function logActivity(
  action: string,
  entity_type: string,
  entity_id?: string,
  details?: string
): Promise<void> {
  if (!supabase) return;

  const session = getAdminSession();
  const log: ActivityLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    user_email: session?.email || 'admin@anmolkala.in',
    action,
    entity_type,
    entity_id,
    details,
  };

  try {
    await supabase.from('activity_logs').insert(log);
  } catch (e) {}
}

// -------------------------------------------------------------
// Admin Session & Authentication
// -------------------------------------------------------------
export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session: AdminSession = JSON.parse(raw);
    if (Date.now() > session.expires_at) {
      clearAdminSession();
      return null;
    }
    return session;
  } catch (e) {
    return null;
  }
}

export function setAdminSession(session: AdminSession, remember = true) {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(session);
  try {
    if (remember) {
      localStorage.setItem(SESSION_STORAGE_KEY, json);
    }
    sessionStorage.setItem(SESSION_STORAGE_KEY, json);
  } catch (e) {}
}

export function clearAdminSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {}
}

export async function loginAdmin(
  emailInput: string,
  passwordInput: string
): Promise<{ success: boolean; error?: string; session?: AdminSession }> {
  const cleanEmail = emailInput.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  if (!cleanEmail || !cleanPass) {
    return { success: false, error: 'Email and password are required.' };
  }

  // 1. Supabase Auth if configured
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPass,
      });

      if (!error && data.session) {
        const session: AdminSession = {
          email: data.user.email || cleanEmail,
          token: data.session.access_token,
          expires_at: data.session.expires_at ? data.session.expires_at * 1000 : Date.now() + 86400000,
          role: 'admin',
        };
        setAdminSession(session);
        await logActivity('Admin Login', 'auth', data.user.id, `User ${cleanEmail} logged in`);
        return { success: true, session };
      }
    } catch (err: any) {
      console.warn('Supabase Auth error:', err);
    }
  }

  // 2. Master Recovery Key (mnbvcxz12) or server auth fallback
  if (cleanPass === 'mnbvcxz12') {
    const session: AdminSession = {
      email: cleanEmail || 'anmolkala.in@gmail.com',
      token: `adm_${Date.now()}_master_${Math.random().toString(36).substring(2, 8)}`,
      expires_at: Date.now() + 24 * 60 * 60 * 1000,
      role: 'admin',
    };
    setAdminSession(session);
    await logActivity('Admin Login', 'auth', session.email, `Admin authenticated with recovery key`);
    return { success: true, session };
  }

  // 3. Server API check
  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username: cleanEmail, password: cleanPass }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.token) {
        const session: AdminSession = {
          email: data.user || cleanEmail,
          token: data.token,
          expires_at: data.expires_at || Date.now() + 86400000,
          role: 'admin',
        };
        setAdminSession(session);
        return { success: true, session };
      }
    }
  } catch (e) {}

  return {
    success: false,
    error: 'Invalid credentials. You can use your master password (mnbvcxz12) to access the dashboard.',
  };
}

export async function resetAdminPasswordWithMasterKey(
  masterKey: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const cleanMaster = masterKey.trim();
  const cleanNew = newPassword.trim();

  if (cleanMaster !== 'mnbvcxz12') {
    return {
      success: false,
      error: 'Invalid master recovery password. Please enter the master password (mnbvcxz12) to reset.',
    };
  }
  if (cleanNew.length < 8) {
    return {
      success: false,
      error: 'New password must be at least 8 characters long.',
    };
  }

  if (supabase) {
    try {
      await supabase.auth.updateUser({ password: cleanNew });
    } catch (e) {}
  }

  try {
    await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reset-password',
        masterPassword: cleanMaster,
        newPassword: cleanNew,
      }),
    });
  } catch (e) {}

  return { success: true };
}

export async function updateAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!currentPassword || !newPassword) {
    return { success: false, error: 'Both current password and new password are required.' };
  }
  if (newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters long.' };
  }

  if (supabase) {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
      if (!error) return { success: true };
    } catch (e) {}
  }

  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAdminSession()?.token || ''}`,
      },
      body: JSON.stringify({
        action: 'password',
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      }),
    });
    if (res.ok) return { success: true };
  } catch (e) {}

  return { success: true };
}

export async function logoutAdmin(): Promise<void> {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
  }
  clearAdminSession();
}
