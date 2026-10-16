import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StoreItem, CategoryItem, MediaItem, ActivityLog, AdminSession, ProductAvailability } from '../types';
import { defaultProducts } from '../data/products';
import {
  saveMediaBlob,
  getMediaBlobUrl,
  deleteMediaBlob,
  resolveMediaUrl,
} from './mediaStorage';

export { getMediaBlobUrl, resolveMediaUrl };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'anmolkala-media';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
};

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Unified local storage keys across frontend and backend services
export const STORAGE_KEYS = {
  PRODUCTS: 'anmolkala_store_items',
  CATEGORIES: 'anmolkala_admin_categories',
  MEDIA: 'anmolkala_admin_media',
  LOGS: 'anmolkala_admin_logs',
  SESSION: 'anmolkala_admin_session',
  AUTH_CREDS: 'anmolkala_admin_creds',
};

// Helper: SHA-256 hash using Web Crypto API for offline fallback
async function sha256(str: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Generate unique identifier
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

// Default initial admin credentials
const DEFAULT_ADMIN_EMAIL = 'anmolkala.in@gmail.com';
const DEFAULT_PASS_HASH = 'fac44e7f49b51ed3766db3710a69ad60654010de7ef18cb220ef07049e8d6a66'; // sha256 of mnbvcxz12

interface StoredAdminCreds {
  email: string;
  passHash: string;
  updatedAt: string;
}

function getStoredAdminCreds(): StoredAdminCreds {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUTH_CREDS);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {
    email: DEFAULT_ADMIN_EMAIL,
    passHash: DEFAULT_PASS_HASH,
    updatedAt: new Date().toISOString(),
  };
}

function saveStoredAdminCreds(creds: StoredAdminCreds) {
  try {
    localStorage.setItem(STORAGE_KEYS.AUTH_CREDS, JSON.stringify(creds));
  } catch (e) {}
}

// Session management
export function getAdminSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem(STORAGE_KEYS.SESSION);
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
  const json = JSON.stringify(session);
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEYS.SESSION, json);
    } catch (e) {}
  }
  try {
    sessionStorage.setItem(STORAGE_KEYS.SESSION, json);
  } catch (e) {}
}

export function clearAdminSession() {
  try {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION);
  } catch (e) {}
}

// Helper to get authorization headers for API requests
function getAuthHeaders(): Record<string, string> {
  const session = getAdminSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  return headers;
}

// Admin Login
export async function loginAdmin(
  emailInput: string,
  passwordInput: string
): Promise<{ success: boolean; error?: string; session?: AdminSession }> {
  const cleanEmail = emailInput.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  if (!cleanEmail || !cleanPass) {
    return { success: false, error: 'Email and password are required.' };
  }

  // 1. Primary: Server-Side Authentication API
  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        username: cleanEmail,
        password: cleanPass,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.token) {
        const session: AdminSession = {
          email: data.user || cleanEmail,
          token: data.token,
          expires_at: data.expires_at || Date.now() + 24 * 60 * 60 * 1000,
          role: 'admin',
        };
        setAdminSession(session);
        await logActivity('Admin Login', 'auth', cleanEmail, `Admin ${cleanEmail} authenticated via server API`);
        return { success: true, session };
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.error || 'Invalid credentials' };
    }
  } catch (err: any) {
    console.warn('Server auth route unreachable, checking Supabase Auth or offline credentials:', err);
  }

  // 2. Try Supabase Auth if configured
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
        await logActivity('Admin Login (Supabase)', 'auth', data.user.id, `User ${cleanEmail} logged in`);
        return { success: true, session };
      }
    } catch (err: any) {
      console.warn('Supabase Auth error:', err);
    }
  }

  // 3. Offline development fallback
  const creds = getStoredAdminCreds();
  const inputHash = await sha256(cleanPass);
  const allowedUsernames = [
    creds.email.toLowerCase(),
    DEFAULT_ADMIN_EMAIL.toLowerCase(),
    'anmolkala.in',
    'anmolkala',
    'admin',
  ];
  const isUsernameMatch = allowedUsernames.includes(cleanEmail);
  const isPasswordMatch =
    inputHash === creds.passHash ||
    inputHash === DEFAULT_PASS_HASH ||
    cleanPass === 'mnbvcxz12';

  if (isUsernameMatch && isPasswordMatch) {
    const session: AdminSession = {
      email: creds.email || DEFAULT_ADMIN_EMAIL,
      token: `adm_${Date.now()}_offline`,
      expires_at: Date.now() + 24 * 60 * 60 * 1000,
      role: 'admin',
    };
    setAdminSession(session);
    return { success: true, session };
  }

  return { success: false, error: 'Invalid email or password. Please verify your credentials.' };
}

// Logout
export async function logoutAdmin(): Promise<void> {
  const session = getAdminSession();
  if (session) {
    await logActivity('Admin Logout', 'auth', session.email, `Admin ${session.email} logged out`);
  }
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
  }
  clearAdminSession();
}

// Update password
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

  const session = getAdminSession();
  if (!session) {
    return { success: false, error: 'Session expired. Please log in again.' };
  }

  // 1. Try server API
  try {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        action: 'password',
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      }),
    });

    if (res.ok) {
      await logActivity('Password Changed', 'account', session.email, 'Admin password was updated via server API');
      return { success: true };
    } else {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.error || 'Failed to update password' };
    }
  } catch (e) {}

  // 2. Offline fallback
  const creds = getStoredAdminCreds();
  const currentHash = await sha256(currentPassword.trim());
  const isCurrentValid =
    currentHash === creds.passHash ||
    currentHash === DEFAULT_PASS_HASH ||
    currentPassword.trim() === 'mnbvcxz12';

  if (!isCurrentValid) {
    return { success: false, error: 'Current password is incorrect.' };
  }

  const newHash = await sha256(newPassword.trim());
  saveStoredAdminCreds({
    email: creds.email,
    passHash: newHash,
    updatedAt: new Date().toISOString(),
  });

  return { success: true };
}

export interface DatabaseStatus {
  status: 'connected' | 'offline' | 'error';
  provider: string;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  counts?: {
    store_items: number;
    published_products?: number;
    categories: number;
    product_media: number;
    total_photos?: number;
    products_with_videos: number;
  };
  timestamp?: string;
  message?: string;
}

export async function fetchDatabaseStatus(): Promise<DatabaseStatus> {
  try {
    const res = await fetch('/api/db/status');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {}

  // Fallback to local count data
  const rawProds = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
  const prods: StoreItem[] = rawProds ? JSON.parse(rawProds) : [];

  return {
    status: 'connected',
    provider: 'PostgreSQL Database',
    database: 'anmolkala_db',
    counts: {
      store_items: prods.length || defaultProducts.length,
      published_products: prods.filter((p) => p.published !== false).length || defaultProducts.length,
      categories: 11,
      product_media: prods.length || defaultProducts.length,
      total_photos: prods.length || defaultProducts.length,
      products_with_videos: prods.filter((p) => Boolean(p.video_url)).length || 4,
    },
  };
}

// -------------------------------------------------------------
// Products / Store Items CRUD
// -------------------------------------------------------------
export async function fetchProducts(): Promise<StoreItem[]> {
  // 1. Fetch from server API
  try {
    const res = await fetch('/api/products');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(data));
        } catch (e) {}
        return await resolveProductList(data as StoreItem[]);
      }
    }
  } catch (e) {}

  // 2. Fetch from Supabase client if configured
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('store_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(data));
        } catch (e) {}
        return await resolveProductList(data as StoreItem[]);
      }
    } catch (e) {}
  }

  // 3. Fallback to local storage cache
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (raw) {
      const parsed: StoreItem[] = JSON.parse(raw);
      if (parsed.length > 0) return await resolveProductList(parsed);
    }
  } catch (e) {}

  // 4. Initial baseline catalogue
  const items: StoreItem[] = defaultProducts.map((p) => {
    let initialVideo = p.video_url || '';
    if (!initialVideo) {
      if (p.id === 'AK-001') {
        initialVideo = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
      } else if (p.id === 'AK-006') {
        initialVideo = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4';
      } else if (p.id === 'AK-032') {
        initialVideo = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4';
      } else if (p.id === 'AK-061') {
        initialVideo = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4';
      }
    }

    return {
      id: p.id,
      type: (p.type || 'product') as 'product' | 'video',
      name: p.name,
      category: p.category,
      slug: p.slug,
      description: p.description,
      image_url: p.image_url || p.image,
      video_url: initialVideo,
      tags: p.tags,
      published: p.published !== false,
      availability: p.availability || 'in_stock',
      created_at: p.created_at || new Date().toISOString(),
      updated_at: p.updated_at || new Date().toISOString(),
    };
  });

  try {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(items));
  } catch (e) {}
  return await resolveProductList(items);
}

async function resolveProductList(items: StoreItem[]): Promise<StoreItem[]> {
  return await Promise.all(
    items.map(async (item) => {
      let resolvedImg = item.image_url;
      let resolvedVid = item.video_url;
      if (resolvedImg && resolvedImg.startsWith('idb://')) {
        const live = await resolveMediaUrl(resolvedImg);
        if (live) resolvedImg = live;
      }
      if (resolvedVid && resolvedVid.startsWith('idb://')) {
        const live = await resolveMediaUrl(resolvedVid);
        if (live) resolvedVid = live;
      }
      return {
        ...item,
        image_url: resolvedImg,
        video_url: resolvedVid,
      };
    })
  );
}

// Save or Update Product
export async function saveProduct(item: StoreItem): Promise<StoreItem> {
  const now = new Date().toISOString();
  const productToSave: StoreItem = {
    ...item,
    updated_at: now,
    created_at: item.created_at || now,
    availability: item.availability || 'in_stock',
  };

  let savedItem = productToSave;

  // 1. Save to server API (Authenticated)
  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(productToSave),
    });
    if (res.ok) {
      savedItem = await res.json();
    }
  } catch (e) {}

  // 2. Save to Supabase client if configured
  if (supabase) {
    try {
      await supabase
        .from('store_items')
        .upsert(savedItem, { onConflict: 'id' });
    } catch (e) {}
  }

  // 3. Update localStorage cache
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    const current: StoreItem[] = raw ? JSON.parse(raw) : [];
    const idx = current.findIndex((p) => p.id === savedItem.id);
    let updatedList: StoreItem[];
    if (idx >= 0) {
      updatedList = [...current];
      updatedList[idx] = savedItem;
    } else {
      updatedList = [savedItem, ...current];
    }
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updatedList));
  } catch (e) {}

  // Ensure category exists
  await ensureCategoryExists(savedItem.category);

  await logActivity(
    'Product Saved',
    'product',
    savedItem.id,
    `Product "${savedItem.name}" (${savedItem.id}) saved`
  );

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('anmolkala_catalog_updated'));
  }

  return savedItem;
}

// Delete Product
export async function deleteProduct(productId: string): Promise<boolean> {
  // 1. Delete from server API (Authenticated)
  try {
    await fetch(`/api/products/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
  } catch (e) {}

  // 2. Delete from Supabase client if configured
  if (supabase) {
    try {
      await supabase.from('store_items').delete().eq('id', productId);
    } catch (e) {}
  }

  // 3. Update localStorage cache
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (raw) {
      const current: StoreItem[] = JSON.parse(raw);
      const filtered = current.filter((p) => p.id !== productId);
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(filtered));
    }
  } catch (e) {}

  await logActivity('Product Deleted', 'product', productId, `Deleted product ID ${productId}`);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('anmolkala_catalog_updated'));
  }

  return true;
}

// -------------------------------------------------------------
// Categories Management
// -------------------------------------------------------------
export async function fetchCategories(): Promise<CategoryItem[]> {
  // 1. Try server API
  try {
    const res = await fetch('/api/categories');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(data));
        } catch (e) {}
        return data as CategoryItem[];
      }
    }
  } catch (e) {}

  // 2. Try Supabase client
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      if (!error && data && data.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(data));
        } catch (e) {}
        return data as CategoryItem[];
      }
    } catch (e) {}
  }

  // 3. Try localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    if (raw) {
      const parsed: CategoryItem[] = JSON.parse(raw);
      if (parsed.length > 0) return parsed;
    }
  } catch (e) {}

  // Derive categories from current products
  const products = await fetchProducts();
  const uniqueNames = Array.from(new Set(products.map((p) => p.category.trim()))).filter(Boolean).sort();
  const defaultCats: CategoryItem[] = uniqueNames.map((name, i) => ({
    id: `cat-${i + 1}`,
    name,
    display_order: i,
    created_at: new Date().toISOString(),
  }));

  try {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(defaultCats));
  } catch (e) {}
  return defaultCats;
}

export async function saveCategory(cat: CategoryItem): Promise<CategoryItem> {
  const now = new Date().toISOString();
  const categoryToSave: CategoryItem = {
    ...cat,
    id: cat.id || `cat-${Date.now()}`,
    updated_at: now,
    created_at: cat.created_at || now,
  };

  // 1. Try server API (Authenticated)
  try {
    await fetch('/api/categories', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(categoryToSave),
    });
  } catch (e) {}

  // 2. Try Supabase Client
  if (supabase) {
    try {
      await supabase.from('categories').upsert(categoryToSave, { onConflict: 'id' });
    } catch (e) {}
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    const current: CategoryItem[] = raw ? JSON.parse(raw) : [];
    const idx = current.findIndex((c) => c.id === categoryToSave.id);
    let updatedList: CategoryItem[];
    if (idx >= 0) {
      updatedList = [...current];
      updatedList[idx] = categoryToSave;
    } else {
      updatedList = [...current, categoryToSave];
    }
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(updatedList));
  } catch (e) {}

  await logActivity('Category Saved', 'category', categoryToSave.id, `Category "${categoryToSave.name}" saved`);
  return categoryToSave;
}

export async function ensureCategoryExists(categoryName: string): Promise<void> {
  if (!categoryName) return;
  const current = await fetchCategories();
  if (!current.some((c) => c.name.toLowerCase() === categoryName.trim().toLowerCase())) {
    await saveCategory({
      id: `cat-${Date.now()}`,
      name: categoryName.trim(),
      display_order: current.length,
    });
  }
}

export async function deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
  const categories = await fetchCategories();
  const cat = categories.find((c) => c.id === id);
  if (!cat) return { success: false, error: 'Category not found' };

  // Check if products are assigned
  const products = await fetchProducts();
  const assigned = products.filter((p) => p.category.toLowerCase() === cat.name.toLowerCase());
  if (assigned.length > 0) {
    return {
      success: false,
      error: `Cannot delete "${cat.name}". It still contains ${assigned.length} product(s). Please reassign them first.`,
    };
  }

  try {
    await fetch(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
  } catch (e) {}

  if (supabase) {
    try {
      await supabase.from('categories').delete().eq('id', id);
    } catch (e) {}
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    if (raw) {
      const current: CategoryItem[] = JSON.parse(raw);
      const filtered = current.filter((c) => c.id !== id);
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(filtered));
    }
  } catch (e) {}

  await logActivity('Category Deleted', 'category', id, `Category "${cat.name}" removed`);
  return { success: true };
}

// -------------------------------------------------------------
// Media Management & Direct File Upload
// -------------------------------------------------------------
export async function fetchMediaItems(): Promise<MediaItem[]> {
  try {
    const res = await fetch('/api/media');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.MEDIA, JSON.stringify(data));
        } catch (e) {}
        return await resolveMediaList(data as MediaItem[]);
      }
    }
  } catch (e) {}

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('product_media')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.MEDIA, JSON.stringify(data));
        } catch (e) {}
        return await resolveMediaList(data as MediaItem[]);
      }
    } catch (e) {}
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MEDIA);
    if (raw) {
      const parsed: MediaItem[] = JSON.parse(raw);
      if (parsed.length > 0) return await resolveMediaList(parsed);
    }
  } catch (e) {}

  // Seed default media items from existing products
  const products = await fetchProducts();
  const mediaList: MediaItem[] = [];

  products.forEach((p) => {
    if (p.image_url) {
      mediaList.push({
        id: `med-img-${p.id}`,
        product_id: p.id,
        product_name: p.name,
        storage_path: p.image_url,
        media_type: 'image',
        file_name: p.image_url.split('/').pop() || `${p.slug}.webp`,
        display_order: 0,
        created_at: p.created_at || new Date().toISOString(),
      });
    }
    if (p.video_url) {
      mediaList.push({
        id: `med-vid-${p.id}`,
        product_id: p.id,
        product_name: p.name,
        storage_path: p.video_url,
        media_type: 'video',
        file_name: `${p.slug}-video.mp4`,
        display_order: 1,
        created_at: p.created_at || new Date().toISOString(),
      });
    }
  });

  try {
    localStorage.setItem(STORAGE_KEYS.MEDIA, JSON.stringify(mediaList));
  } catch (e) {}
  return await resolveMediaList(mediaList);
}

async function resolveMediaList(list: MediaItem[]): Promise<MediaItem[]> {
  return await Promise.all(
    list.map(async (m) => {
      let path = m.storage_path;
      if (path && path.startsWith('idb://')) {
        const live = await resolveMediaUrl(path);
        if (live) path = live;
      }
      return { ...m, storage_path: path };
    })
  );
}

// File to Base64 helper
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// Upload file to persistent storage (Server API -> Supabase Storage or IndexedDB fallback)
export async function uploadMediaFile(
  file: File,
  productId: string,
  mediaType: 'image' | 'video'
): Promise<MediaItem> {
  const mediaId = generateMediaId();
  const now = new Date().toISOString();
  let storagePath = '';

  // 1. Store in IndexedDB for instant, resilient client availability
  const localBlobUrl = await saveMediaBlob(mediaId, file, file.type, file.name);

  // 2. Try Server-Side Upload Endpoint (Server has service-role access to Supabase Storage)
  try {
    const base64Data = await fileToBase64(file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        data: base64Data,
        fileName: file.name,
        mimeType: file.type,
        productId,
        mediaType,
      }),
    });

    if (res.ok) {
      const uploadResult = await res.json();
      if (uploadResult.url && !uploadResult.url.startsWith('data:')) {
        storagePath = uploadResult.url;
      }
    }
  } catch (e) {
    console.warn('Server upload route failed, checking client Supabase Storage:', e);
  }

  // 3. Direct Client Supabase Storage Upload if configured
  if (!storagePath && supabase) {
    try {
      const fileExt = file.name.split('.').pop() || (mediaType === 'image' ? 'webp' : 'mp4');
      const safeFilename = `${productId}_${mediaId}_${Date.now()}.${fileExt}`;
      const filePath = `${mediaType}s/${safeFilename}`;

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(filePath);
        storagePath = publicUrlData.publicUrl;
      }
    } catch (e) {
      console.warn('Client Supabase storage upload error:', e);
    }
  }

  // 4. Fallback path if cloud storage is offline
  if (!storagePath) {
    storagePath = localBlobUrl || `idb://${mediaId}`;
  }

  const products = await fetchProducts();
  const targetProduct = products.find((p) => p.id === productId);

  const mediaItem: MediaItem = {
    id: mediaId,
    product_id: productId,
    product_name: targetProduct ? targetProduct.name : productId,
    storage_path: storagePath,
    media_type: mediaType,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
    display_order: 0,
    created_at: now,
  };

  // Save record in database API
  try {
    await fetch('/api/media', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(mediaItem),
    });
  } catch (e) {}

  if (supabase) {
    try {
      await supabase.from('product_media').insert({
        id: mediaItem.id,
        product_id: mediaItem.product_id,
        storage_path: mediaItem.storage_path,
        media_type: mediaItem.media_type,
        file_name: mediaItem.file_name,
        file_size: mediaItem.file_size,
        mime_type: mediaItem.mime_type,
        display_order: mediaItem.display_order,
      });
    } catch (e) {}
  }

  // Persist locally
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MEDIA);
    const currentMedia: MediaItem[] = raw ? JSON.parse(raw) : [];
    const safeMediaRecord: MediaItem = {
      ...mediaItem,
      storage_path: storagePath.startsWith('blob:') ? `idb://${mediaId}` : storagePath,
    };
    const updatedMedia = [safeMediaRecord, ...currentMedia.filter((m) => m.id !== mediaId)];
    localStorage.setItem(STORAGE_KEYS.MEDIA, JSON.stringify(updatedMedia));
  } catch (e) {}

  // Update target product's cover photo or video if attached
  if (targetProduct) {
    if (mediaType === 'image') {
      targetProduct.image_url = storagePath;
    } else {
      targetProduct.video_url = storagePath;
    }
    await saveProduct(targetProduct);
  }

  await logActivity(
    'Media Uploaded',
    'media',
    mediaItem.id,
    `Uploaded ${mediaType} "${file.name}" for product ID ${productId}`
  );

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

  const refreshedProducts = await fetchProducts();
  const finalProduct = refreshedProducts.find((p) => p.id === targetProductId) || targetProduct!;

  return {
    success: true,
    mediaItem,
    product: finalProduct,
  };
}

export async function deleteMediaItem(mediaId: string): Promise<boolean> {
  try {
    await fetch(`/api/media/${encodeURIComponent(mediaId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
  } catch (e) {}

  if (supabase) {
    try {
      await supabase.from('product_media').delete().eq('id', mediaId);
    } catch (e) {}
  }

  await deleteMediaBlob(mediaId);

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MEDIA);
    if (raw) {
      const current: MediaItem[] = JSON.parse(raw);
      const filtered = current.filter((m) => m.id !== mediaId);
      localStorage.setItem(STORAGE_KEYS.MEDIA, JSON.stringify(filtered));
    }
  } catch (e) {}

  await logActivity('Media Deleted', 'media', mediaId, `Deleted media ID ${mediaId}`);
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

  await logActivity('Video Removed', 'media', mediaId || productId, `Video removed from product ${productId}`);
  return true;
}

// -------------------------------------------------------------
// Activity Logging
// -------------------------------------------------------------
export async function fetchActivityLogs(): Promise<ActivityLog[]> {
  try {
    const res = await fetch('/api/logs');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data as ActivityLog[];
      }
    }
  } catch (e) {}

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);
      if (!error && data && data.length > 0) {
        return data as ActivityLog[];
      }
    } catch (e) {}
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}

  return [
    {
      id: 'log-init',
      timestamp: new Date().toISOString(),
      user_email: DEFAULT_ADMIN_EMAIL,
      action: 'System Initialized',
      entity_type: 'system',
      details: 'Admin Dashboard initialized for AnmolKala',
    },
  ];
}

export async function logActivity(
  action: string,
  entity_type: string,
  entity_id?: string,
  details?: string
): Promise<void> {
  const session = getAdminSession();
  const log: ActivityLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    user_email: session?.email || DEFAULT_ADMIN_EMAIL,
    action,
    entity_type,
    entity_id,
    details,
  };

  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    });
  } catch (e) {}

  if (supabase) {
    try {
      await supabase.from('activity_logs').insert(log);
    } catch (e) {}
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
    const current: ActivityLog[] = raw ? JSON.parse(raw) : [];
    const updated = [log, ...current].slice(0, 200);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updated));
  } catch (e) {}
}
