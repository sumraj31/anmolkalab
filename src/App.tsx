import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Product, StoreItem, DrawerType, AdminSession } from './types';
import { defaultProducts, brandInfo } from './data/products';
import { loadStorage, saveStorage } from './utils/helpers';
import { Header } from './components/Header';
import { CategoryNav } from './components/CategoryNav';
import { Hero } from './components/Hero';
import { Services } from './components/Services';
import { ProductCard } from './components/ProductCard';
import { ProductDetail } from './components/ProductDetail';
import { VideoGallery } from './components/VideoGallery';
import { Drawer } from './components/Drawer';
import { CompareModal } from './components/CompareModal';
import { AdminModal } from './components/AdminModal';
import { Footer } from './components/Footer';
import { Toast } from './components/Toast';
import { AdminLogin } from './components/admin/AdminLogin';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { getAdminSession, fetchProducts } from './services/supabase';

const STORAGE_KEYS = {
  WISHLIST: 'ak_w',
  SAVED: 'ak_s',
  COMPARE: 'ak_c',
  RECENT: 'ak_r',
  CUSTOM_ITEMS: 'ak_custom_store_items',
};

const ITEMS_PER_PAGE = 10;

export const App: React.FC = () => {
  // Navigation & View state
  const [currentView, setCurrentView] = useState<
    'home' | 'catalog' | 'product' | 'videos' | 'admin-login' | 'admin-dashboard'
  >('home');
  const [adminSession, setAdminSession] = useState<AdminSession | null>(() => getAdminSession());
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [homeVideoCategory, setHomeVideoCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'featured' | 'az' | 'za'>('featured');
  const [page, setPage] = useState<number>(1);

  // Modals & Drawers
  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // User state
  const [wishlist, setWishlist] = useState<string[]>(() =>
    loadStorage<string[]>(STORAGE_KEYS.WISHLIST, [])
  );
  const [savedList, setSavedList] = useState<string[]>(() =>
    loadStorage<string[]>(STORAGE_KEYS.SAVED, [])
  );
  const [compareList, setCompareList] = useState<string[]>(() =>
    loadStorage<string[]>(STORAGE_KEYS.COMPARE, [])
  );
  const [recentList, setRecentList] = useState<string[]>(() =>
    loadStorage<string[]>(STORAGE_KEYS.RECENT, [])
  );

  // Custom Items (from Admin or API)
  const [customItems, setCustomItems] = useState<StoreItem[]>(() =>
    loadStorage<StoreItem[]>(STORAGE_KEYS.CUSTOM_ITEMS, [])
  );

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2000);
  }, []);

  // Sync state to local storage
  useEffect(() => {
    saveStorage(STORAGE_KEYS.WISHLIST, wishlist);
  }, [wishlist]);

  useEffect(() => {
    saveStorage(STORAGE_KEYS.SAVED, savedList);
  }, [savedList]);

  useEffect(() => {
    saveStorage(STORAGE_KEYS.COMPARE, compareList);
  }, [compareList]);

  useEffect(() => {
    saveStorage(STORAGE_KEYS.RECENT, recentList);
  }, [recentList]);

  useEffect(() => {
    saveStorage(STORAGE_KEYS.CUSTOM_ITEMS, customItems);
  }, [customItems]);

  // Combine default products with custom admin products
  const allProducts = useMemo(() => {
    const customProducts: Product[] = customItems
      .filter((item) => item.type === 'product' && item.published)
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        slug: item.slug || `item-${item.id.toLowerCase()}`,
        image: item.image_url || '/logo.png',
        image_url: item.image_url,
        video_url: item.video_url,
        tags: item.tags,
        description: item.description,
        type: 'product',
        published: item.published,
      }));

    // Merge by id (custom items take precedence or are appended)
    const combined = [...defaultProducts];
    for (const cp of customProducts) {
      const idx = combined.findIndex((p) => p.id === cp.id);
      if (idx >= 0) {
        combined[idx] = cp;
      } else {
        combined.unshift(cp);
      }
    }
    return combined;
  }, [customItems]);

  // All published & attached craft videos
  const allProductVideos = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      category: string;
      video_url: string;
      image_url?: string;
      description?: string;
      product?: Product;
    }> = [];
    const seen = new Set<string>();

    for (const p of allProducts) {
      if (p.video_url && !seen.has(p.video_url)) {
        seen.add(p.video_url);
        list.push({
          id: p.id,
          name: p.name,
          category: p.category,
          video_url: p.video_url,
          image_url: p.image || p.image_url,
          description: p.description,
          product: p,
        });
      }
    }

    for (const i of customItems) {
      if (i.video_url && !seen.has(i.video_url)) {
        seen.add(i.video_url);
        list.push({
          id: i.id,
          name: i.name,
          category: i.category,
          video_url: i.video_url,
          image_url: i.image_url,
          description: i.description,
        });
      }
    }

    return list;
  }, [allProducts, customItems]);

  // Unique categories - includes requested primary categories and 'product video'
  const categories = useMemo(() => {
    const primary = ['Puja Thali', 'Photo Frames', 'Tray Sets', 'Wall Clocks', ];
    const other = new Set<string>();
    for (const p of allProducts) {
      if (p.category && p.category !== 'Product Image Requires Review' && !primary.includes(p.category)) {
        other.add(p.category);
      }
    }
    return ['All', ...primary, ...Array.from(other)];
  }, [allProducts]);

  // Helper to convert category to URL slug
  const categoryToSlug = useCallback((cat: string) => {
    return cat.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }, []);

  // Up-to-date refs for listener without re-binding effects on every state update
  const allProductsRef = useRef(allProducts);
  allProductsRef.current = allProducts;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  // URL resolution logic
  const resolvePath = useCallback(
    (pathname: string) => {
      const clean = pathname.toLowerCase().replace(/\/$/, '') || '/';
      if (clean === '/videos') {
        setCurrentView('videos');
        setSelectedProduct(null);
      } else if (clean === '/admin/login' || clean === '/admin') {
        setCurrentView('admin-login');
        setSelectedProduct(null);
      } else if (clean.startsWith('/admin/dashboard')) {
        const sess = getAdminSession();
        if (sess) {
          setAdminSession(sess);
          setCurrentView('admin-dashboard');
        } else {
          setCurrentView('admin-login');
        }
        setSelectedProduct(null);
      } else if (clean.startsWith('/category/')) {
        const slug = clean.replace('/category/', '');
        const currentCats = categoriesRef.current;
        const matched = currentCats.find(
          (c) =>
            categoryToSlug(c) === slug ||
            c.toLowerCase().trim() === decodeURIComponent(slug).toLowerCase().trim()
        );
        if (matched) {
          setActiveCategory(matched);
        } else {
          const formatted = decodeURIComponent(slug)
            .split('-')
            .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
            .join(' ');
          setActiveCategory(formatted);
        }
        setCurrentView('catalog');
        setSelectedProduct(null);
        setPage(1);
      } else if (clean === '/catalog' || clean === '/products') {
        setActiveCategory('All');
        setCurrentView('catalog');
        setSelectedProduct(null);
        setPage(1);
      } else if (clean.startsWith('/product/')) {
        const slug = decodeURIComponent(pathname.replace('/product/', '').replace(/\/$/, ''));
        const found = allProductsRef.current.find(
          (p) => p.slug === slug || p.id.toLowerCase() === slug.toLowerCase()
        );
        if (found) {
          setSelectedProduct(found);
        }
        setCurrentView('product');
      } else {
        setCurrentView('home');
        setSelectedProduct(null);
      }
    },
    [categoryToSlug]
  );

  // Initialize URL routing on mount and handle browser back/forward buttons
  useEffect(() => {
    resolvePath(window.location.pathname);

    const handlePopState = () => {
      resolvePath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [resolvePath]);

  // If page was loaded directly on a product page, link selectedProduct once catalog is ready
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/product/') && !selectedProduct && allProducts.length > 0) {
      const slug = decodeURIComponent(path.replace('/product/', '').replace(/\/$/, ''));
      const found = allProducts.find(
        (p) => p.slug === slug || p.id.toLowerCase() === slug.toLowerCase()
      );
      if (found) {
        setSelectedProduct(found);
      }
    }
  }, [allProducts, selectedProduct]);

  // Refresh products from database/server
  const refreshProducts = useCallback(() => {
    fetchProducts().then((items) => {
      if (items && items.length > 0) {
        setCustomItems(items);
      }
    });
  }, []);

  // Fetch initial products on mount
  useEffect(() => {
    refreshProducts();
  }, [refreshProducts]);

  // Navigation handlers
  const handleGoHome = useCallback(() => {
    window.history.pushState({ view: 'home' }, '', '/');
    setCurrentView('home');
    setSelectedProduct(null);
    setSearchQuery('');
    setActiveCategory('All');
    setPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenProduct = useCallback((product: Product) => {
    window.history.pushState({ view: 'product', slug: product.slug }, '', `/product/${product.slug}`);
    setSelectedProduct(product);
    setCurrentView('product');
    // Add to recently viewed
    setRecentList((prev) => [product.id, ...prev.filter((id) => id !== product.id)].slice(0, 12));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSelectCategory = useCallback(
    (cat: string) => {
      setActiveCategory(cat);
      setSearchQuery('');
      setPage(1);
      setCurrentView('catalog');
      setSelectedProduct(null);
      if (cat === 'All') {
        window.history.pushState({ view: 'catalog', category: 'All' }, '', '/catalog');
      } else {
        const slug = categoryToSlug(cat);
        window.history.pushState({ view: 'catalog', category: cat }, '', `/category/${slug}`);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [categoryToSlug]
  );

  const handleShowAllProducts = useCallback(() => {
    setActiveCategory('All');
    setSearchQuery('');
    setPage(1);
    setCurrentView('catalog');
    setSelectedProduct(null);
    window.history.pushState({ view: 'catalog', category: 'All' }, '', '/catalog');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleShowVideos = useCallback(() => {
    window.history.pushState({ view: 'videos' }, '', '/videos');
    setCurrentView('videos');
    setSelectedProduct(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      setActiveCategory('All');
      setPage(1);
      setCurrentView('catalog');
    }
  }, []);

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (searchQuery.trim()) {
        setActiveCategory('All');
        setPage(1);
        setCurrentView('catalog');
      }
    },
    [searchQuery]
  );

  // Wishlist toggle
  const handleToggleWishlist = useCallback(
    (id: string) => {
      setWishlist((prev) => {
        const isExists = prev.includes(id);
        const updated = isExists ? prev.filter((item) => item !== id) : [...prev, id];
        showToast(isExists ? 'Removed from wishlist' : 'Added to wishlist');
        return updated;
      });
    },
    [showToast]
  );

  // Save for later toggle
  const handleToggleSave = useCallback(
    (id: string) => {
      setSavedList((prev) => {
        const isExists = prev.includes(id);
        const updated = isExists ? prev.filter((item) => item !== id) : [...prev, id];
        showToast(isExists ? 'Removed from saved' : 'Added to saved');
        return updated;
      });
    },
    [showToast]
  );

  // Compare toggle
  const handleToggleCompare = useCallback(
    (id: string) => {
      setCompareList((prev) => {
        if (prev.includes(id)) {
          showToast('Removed from compare');
          return prev.filter((item) => item !== id);
        }
        if (prev.length >= 4) {
          showToast('Compare up to 4 products');
          return prev;
        }
        showToast('Added to compare');
        return [...prev, id];
      });
    },
    [showToast]
  );

  // Filtered & Sorted products for catalog
  const filteredProducts = useMemo(() => {
    let list = allProducts;
    if (activeCategory === 'product video' || activeCategory === 'Product Videos') {
      list = list.filter((p) => Boolean(p.video_url));
    } else if (activeCategory !== 'All') {
      list = list.filter((p) => p.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const text = `${p.name} ${p.category} ${p.tags} ${p.description}`.toLowerCase();
        return text.includes(q);
      });
    }

    const sorted = [...list];
    if (sortBy === 'az') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'za') {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    }
    return sorted;
  }, [allProducts, activeCategory, searchQuery, sortBy]);

  // Paginated catalog items
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const validPage = Math.min(page, totalPages);
  const catalogSlice = useMemo(() => {
    const start = (validPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, validPage]);

  // Items for active drawer
  const drawerProducts = useMemo(() => {
    if (!activeDrawer) return [];
    let ids: string[] = [];
    if (activeDrawer === 'wish') ids = wishlist;
    else if (activeDrawer === 'saved') ids = savedList;
    else if (activeDrawer === 'compare') ids = compareList;
    else if (activeDrawer === 'recent') ids = recentList;

    return ids
      .map((id) => allProducts.find((p) => p.id === id))
      .filter((p): p is Product => Boolean(p));
  }, [activeDrawer, wishlist, savedList, compareList, recentList, allProducts]);

  // Products for compare modal
  const compareModalProducts = useMemo(() => {
    return compareList
      .map((id) => allProducts.find((p) => p.id === id))
      .filter((p): p is Product => Boolean(p));
  }, [compareList, allProducts]);

  // Featured products (one per category)
  const featuredProducts = useMemo(() => {
    const valid = allProducts.filter((p) => p.category !== 'Product Image Requires Review');
    const seenCats = new Set<string>();
    const res: Product[] = [];
    for (const p of valid) {
      if (!seenCats.has(p.category)) {
        seenCats.add(p.category);
        res.push(p);
      }
    }
    return res;
  }, [allProducts]);

  // Popular products
  const popularProducts = useMemo(() => {
    const valid = allProducts.filter((p) => p.category !== 'Product Image Requires Review');
    const wishItems = valid.filter((p) => wishlist.includes(p.id));
    const combined = [...wishItems];
    for (const p of valid) {
      if (combined.length >= 10) break;
      if (!combined.some((item) => item.id === p.id)) {
        combined.push(p);
      }
    }
    return combined.slice(0, 10);
  }, [allProducts, wishlist]);

  // Category counts for "Shop by Category"
  const categorySummary = useMemo(() => {
    const valid = allProducts.filter((p) => p.category !== 'Product Image Requires Review');
    const map = new Map<string, number>();
    for (const p of valid) {
      map.set(p.category, (map.get(p.category) || 0) + 1);
    }
    return Array.from(map.entries()).map(([cat, count]) => ({ cat, count }));
  }, [allProducts]);

  // Distinct categories present in videos for home filter
  const homeVideoCategories = useMemo(() => {
    const set = new Set<string>();
    allProductVideos.forEach((v) => {
      if (v.category) set.add(v.category);
    });
    return ['All', ...Array.from(set)];
  }, [allProductVideos]);

  // Videos displayed on Home Page (1 per category when 'All' to ensure broad representation across categories)
  const homeDisplayedVideos = useMemo(() => {
    if (homeVideoCategory === 'All') {
      const catMap = new Map<string, (typeof allProductVideos)[0]>();
      allProductVideos.forEach((v) => {
        if (!catMap.has(v.category)) {
          catMap.set(v.category, v);
        }
      });
      const distinct = Array.from(catMap.values());
      return distinct.slice(0, 4);
    }
    return allProductVideos.filter((v) => v.category === homeVideoCategory).slice(0, 4);
  }, [allProductVideos, homeVideoCategory]);

  // Admin save handler
  const handleSaveAdminItem = useCallback((item: StoreItem) => {
    setCustomItems((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = item;
        return copy;
      }
      return [item, ...prev];
    });
  }, []);

  // Admin delete handler
  const handleDeleteAdminItem = useCallback(
    (id: string) => {
      setCustomItems((prev) => prev.filter((i) => i.id !== id));
      showToast('Item deleted');
    },
    [showToast]
  );

  // Admin open handler (triggered from tiny 'A' icon in footer)
  const handleOpenAdmin = useCallback(() => {
    const sess = getAdminSession();
    if (sess) {
      setAdminSession(sess);
      setCurrentView('admin-dashboard');
      window.history.pushState({}, '', '/admin/dashboard');
    } else {
      setCurrentView('admin-login');
      window.history.pushState({}, '', '/admin/login');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Dedicated Admin Login view
  if (currentView === 'admin-login') {
    return (
      <AdminLogin
        onLoginSuccess={() => {
          const sess = getAdminSession();
          setAdminSession(sess);
          setCurrentView('admin-dashboard');
          window.history.pushState({}, '', '/admin/dashboard');
        }}
        onBackToStore={handleGoHome}
      />
    );
  }

  // Dedicated Admin Dashboard view
  if (currentView === 'admin-dashboard') {
    if (!adminSession) {
      return (
        <AdminLogin
          onLoginSuccess={() => {
            const sess = getAdminSession();
            setAdminSession(sess);
            setCurrentView('admin-dashboard');
            window.history.pushState({}, '', '/admin/dashboard');
          }}
          onBackToStore={handleGoHome}
        />
      );
    }
    return (
      <AdminDashboard
        session={adminSession}
        onLogout={() => {
          setAdminSession(null);
          handleGoHome();
        }}
        onBackToStore={() => {
          refreshProducts();
          handleGoHome();
        }}
      />
    );
  }

  return (
    <div>
      <Header
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onSearchSubmit={handleSearchSubmit}
        onGoHome={handleGoHome}
        wishCount={wishlist.length}
        compareCount={compareList.length}
        savedCount={savedList.length}
        onOpenDrawer={setActiveDrawer}
      />

      <main className="wrap">
        <CategoryNav
          categories={categories}
          activeCategory={activeCategory}
          onSelectCategory={handleSelectCategory}
        />

        {currentView === 'home' && (
          <div>
            <Hero
              onExplore={() => {
                const el = document.getElementById('homeCollections');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            />

            <Services />

            <div id="homeCollections">
              

              {/* Shop by Category */}
              <section className="section home-section">
                <div className="head">
                  <div>
                    <h2>Shop by Category</h2>
                    <div className="muted">Choose a collection to see only matching products.</div>
                  </div>
                </div>
                <div className="homegrid">
                  {categorySummary.map(({ cat, count }) => (
                    <button
                      key={cat}
                      type="button"
                      className="category-card"
                      onClick={() => handleSelectCategory(cat)}
                    >
                      <strong>{cat}</strong>
                      <span>{count} products · View collection →</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Featured Products */}
              <section className="section home-section">
                <div className="head">
                  <div>
                    <h2>Featured Products</h2>
                    <div className="muted">One carefully selected product from each collection.</div>
                  </div>
                </div>
                <div className="homegrid">
                  {featuredProducts.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      whatsappNumber={brandInfo.whatsapp}
                      isWishlisted={wishlist.includes(p.id)}
                      onToggleWishlist={handleToggleWishlist}
                      onOpenProduct={handleOpenProduct}
                      variant="compact"
                    />
                  ))}
                </div>
              </section>

              {/* Popular Products */}
              <section className="section home-section">
                <div className="head">
                  <div>
                    <h2>Popular Products</h2>
                    <div className="muted">A selection from across the AnmolKala catalogue.</div>
                  </div>
                  <button type="button" className="select" onClick={handleShowAllProducts}>
                    View All Products
                  </button>
                </div>
                <div className="homegrid">
                  {popularProducts.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      whatsappNumber={brandInfo.whatsapp}
                      isWishlisted={wishlist.includes(p.id)}
                      onToggleWishlist={handleToggleWishlist}
                      onOpenProduct={handleOpenProduct}
                      variant="compact"
                    />
                  ))}
                </div>
              </section>

              {/* More Collections */}
              <section className="section home-section">
                <div className="head">
                  <div>
                    <h2>More Collections</h2>
                    <div className="muted">
                      Explore every available collection without mixing product types.
                    </div>
                  </div>
                </div>
                <div className="homegrid">
                  {categorySummary.slice(Math.ceil(categorySummary.length / 2)).map(({ cat }) => (
                    <button
                      key={cat}
                      type="button"
                      className="category-card"
                      onClick={() => handleSelectCategory(cat)}
                    >
                      <strong>{cat}</strong>
                      <span>Browse {cat} →</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Product Videos  Showcase */}
              <section className="section home-section">
                <div className="head" style={{ flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>🎬</span>
                      <h2>Product Videos </h2>
                    </div>
                    <div className="muted">
                      (Watch real handmade craft demonstration videos).
                    </div>
                  </div>
                  <button type="button" className="select" onClick={handleShowVideos}>
                    View All Videos ({allProductVideos.length}) →
                  </button>
                </div>

                {/* Category Filter Tabs for Home Videos */}
                {homeVideoCategories.length > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      overflowX: 'auto',
                      paddingBottom: '10px',
                      marginBottom: '16px',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    {homeVideoCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setHomeVideoCategory(cat)}
                        style={{
                          background: homeVideoCategory === cat ? '#182235' : '#f1f5f9',
                          color: homeVideoCategory === cat ? '#ffffff' : '#334155',
                          border: homeVideoCategory === cat ? '1px solid #182235' : '1px solid #cbd5e1',
                          borderRadius: '20px',
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cat === 'All' ? ' (All)' : cat}
                      </button>
                    ))}
                  </div>
                )}

                <div className="homegrid">
                  {homeDisplayedVideos.length > 0 ? (
                    homeDisplayedVideos.map((vid) => {
                      const waText = encodeURIComponent(
                        `Hello AnmolKala, I watched the video for "${vid.name}" on your website and would like to place an order or ask for price/details.`
                      );
                      const waLink = `https://wa.me/${brandInfo.whatsapp}?text=${waText}`;

                      return (
                        <article key={vid.id} className="card ak-video-card" style={{ overflow: 'hidden' }}>
                          <div style={{ position: 'relative', background: '#000', borderRadius: '6px 6px 0 0', overflow: 'hidden' }}>
                            <video
                              controls
                              playsInline
                              preload="metadata"
                              poster={vid.image_url || ''}
                              src={vid.video_url}
                              style={{ width: '100%', maxHeight: '220px', display: 'block', objectFit: 'contain' }}
                            />
                            {vid.category && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: '8px',
                                  left: '8px',
                                  background: 'rgba(15, 23, 42, 0.85)',
                                  color: '#f8fafc',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  pointerEvents: 'none',
                                }}
                              >
                                {vid.category}
                              </span>
                            )}
                          </div>
                          <div className="info" style={{ padding: '14px' }}>
                            <div className="name" style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>
                              {vid.name}
                            </div>
                            {vid.description && (
                              <div className="desc" style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 12px' }}>
                                {vid.description}
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  flex: 1,
                                  background: '#25D366',
                                  color: '#ffffff',
                                  textDecoration: 'none',
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  boxShadow: '0 2px 6px rgba(37, 211, 102, 0.25)',
                                }}
                              >
                                <span>💬 WhatsApp Order</span>
                              </a>
                              {vid.product && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenProduct(vid.product!)}
                                  style={{
                                    background: '#182235',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Details →
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <p className="muted" style={{ gridColumn: '1/-1', padding: '24px 0', textAlign: 'center' }}>
                      No videos available for this category yet.
                    </p>
                  )}
                </div>
              </section>

              {/* Contact AnmolKala */}
              <section className="section home-section">
                <div className="head">
                  <div>
                    <h2>Contact AnmolKala</h2>
                    <div className="muted">Ask about availability, price and customization.</div>
                  </div>
                </div>
                <div className="contact">
                  <a
                    href={`https://wa.me/${brandInfo.whatsapp}?text=Hello%20AnmolKala%2C%20I%20want%20to%20enquire%20about%20your%20products.`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <b>WhatsApp</b>
                    <br />
                    <span className="muted">+91 98101 16510</span>
                  </a>
                  <a href={`tel:+${brandInfo.phone}`}>
                    <b>Call</b>
                    <br />
                    <span className="muted">+91 97178 87313</span>
                  </a>
                  <a href={`mailto:${brandInfo.email}`}>
                    <b>Email</b>
                    <br />
                    <span className="muted">{brandInfo.email}</span>
                  </a>
                </div>
              </section>
            </div>
          </div>
        )}

        {currentView === 'catalog' && (
          <section className="section" id="catalog">
            <div className="head">
              <div>
                <h2>{activeCategory === 'All' ? 'All Products' : activeCategory}</h2>
                <div className="muted">
                  {filteredProducts.length
                    ? `${filteredProducts.length} products · Showing ${
                        (validPage - 1) * ITEMS_PER_PAGE + 1
                      }-${Math.min(validPage * ITEMS_PER_PAGE, filteredProducts.length)}`
                    : '0 products'}
                </div>
              </div>

              <select
                className="select"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as 'featured' | 'az' | 'za');
                  setPage(1);
                }}
              >
                <option value="featured">Featured</option>
                <option value="az">Name A–Z</option>
                <option value="za">Name Z–A</option>
              </select>
            </div>

            <div className="grid">
              {catalogSlice.length > 0 ? (
                catalogSlice.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    whatsappNumber={brandInfo.whatsapp}
                    isWishlisted={wishlist.includes(p.id)}
                    onToggleWishlist={handleToggleWishlist}
                    onOpenProduct={handleOpenProduct}
                    onCompare={handleToggleCompare}
                    variant="full"
                  />
                ))
              ) : (
                <div
                  style={{
                    gridColumn: '1/-1',
                    textAlign: 'center',
                    padding: '55px',
                    color: '#6b7685',
                  }}
                >
                  No matching products. Try another search or category.
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="pager">
                <button
                  type="button"
                  disabled={validPage === 1}
                  onClick={() => {
                    setPage((p) => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  ← Previous
                </button>
                <span className="pageinfo">
                  Page {validPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={validPage === totalPages}
                  onClick={() => {
                    setPage((p) => Math.min(totalPages, p + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Next →
                </button>
              </div>
            )}
          </section>
        )}

        {currentView === 'product' && selectedProduct && (
          <ProductDetail
            product={selectedProduct}
            allProducts={allProducts}
            whatsappNumber={brandInfo.whatsapp}
            isWishlisted={wishlist.includes(selectedProduct.id)}
            isSaved={savedList.includes(selectedProduct.id)}
            onToggleWishlist={handleToggleWishlist}
            onToggleSave={handleToggleSave}
            onBack={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                handleGoHome();
              }
            }}
            onOpenProduct={handleOpenProduct}
            onToast={showToast}
          />
        )}

        {currentView === 'videos' && (
          <VideoGallery
            videos={allProductVideos}
            whatsappNumber={brandInfo.whatsapp}
            onGoHome={handleGoHome}
            onOpenProduct={handleOpenProduct}
          />
        )}
      </main>

      <Footer
        brand={brandInfo}
        onSelectCategory={handleSelectCategory}
        onOpenAdmin={handleOpenAdmin}
      />

      <Drawer
        type={activeDrawer}
        isOpen={Boolean(activeDrawer)}
        onClose={() => setActiveDrawer(null)}
        products={drawerProducts}
        whatsappNumber={brandInfo.whatsapp}
        onOpenProduct={handleOpenProduct}
        onRemoveItem={(id, type) => {
          if (type === 'wish') handleToggleWishlist(id);
          else if (type === 'saved') handleToggleSave(id);
          else if (type === 'compare') handleToggleCompare(id);
          else if (type === 'recent') setRecentList((prev) => prev.filter((i) => i !== id));
        }}
        onOpenCompareModal={() => setIsCompareModalOpen(true)}
      />

      {isCompareModalOpen && (
        <CompareModal
          products={compareModalProducts}
          whatsappNumber={brandInfo.whatsapp}
          onClose={() => setIsCompareModalOpen(false)}
          onRemoveProduct={handleToggleCompare}
          onOpenProduct={handleOpenProduct}
        />
      )}

      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        items={customItems}
        onSaveItem={handleSaveAdminItem}
        onDeleteItem={handleDeleteAdminItem}
        onToast={showToast}
      />

      <Toast message={toastMessage} />
    </div>
  );
};

export default App;
