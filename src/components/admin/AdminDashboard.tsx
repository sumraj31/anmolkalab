import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StoreItem,
  CategoryItem,
  MediaItem,
  AdminSession,
  DashboardSection,
  ProductAvailability,
} from '../../types';
import {
  fetchProducts,
  saveProduct,
  deleteProduct,
  fetchCategories,
  saveCategory,
  deleteCategory,
  fetchMediaItems,
  uploadMediaFile,
  deleteMediaItem,
  logoutAdmin,
  updateAdminPassword,
  generateUniqueId,
  fetchDatabaseStatus,
  DatabaseStatus,
} from '../../services/supabase';
import { handleImageError } from '../../utils/helpers';

interface AdminDashboardProps {
  session: AdminSession;
  onLogout: () => void;
  onBackToStore: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  session,
  onLogout,
  onBackToStore,
}) => {
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');

  // Core Data
  const [products, setProducts] = useState<StoreItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);

  // Search & Filters in Product Management
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');

  // Edit / Add Product Form State
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAvailability, setFormAvailability] = useState<ProductAvailability>('in_stock');
  const [formTags, setFormTags] = useState('');
  const [formPhotoFiles, setFormPhotoFiles] = useState<File[]>([]);
  const [formPhotoPreviews, setFormPhotoPreviews] = useState<string[]>([]);
  const [formExistingPhoto, setFormExistingPhoto] = useState<string>('');
  const [formVideoFile, setFormVideoFile] = useState<File | null>(null);
  const [formVideoPreview, setFormVideoPreview] = useState<string>('');
  const [formExistingVideo, setFormExistingVideo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formNewCategoryInline, setFormNewCategoryInline] = useState(false);
  const [formNewCategoryName, setFormNewCategoryName] = useState('');

  // Confirmation Modals
  const [productToDelete, setProductToDelete] = useState<StoreItem | null>(null);
  const [mediaToDelete, setMediaToDelete] = useState<MediaItem | null>(null);

  // Quick Action File Pickers
  const [quickUploadProductId, setQuickUploadProductId] = useState<string | null>(null);
  const quickPhotoPickerRef = useRef<HTMLInputElement | null>(null);
  const quickVideoPickerRef = useRef<HTMLInputElement | null>(null);

  // Dedicated Photo Upload Center State
  const [photoUploadFiles, setPhotoUploadFiles] = useState<File[]>([]);
  const [photoUploadPreviews, setPhotoUploadPreviews] = useState<string[]>([]);
  const [photoTargetProduct, setPhotoTargetProduct] = useState<string>('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const dedicatedPhotoPickerRef = useRef<HTMLInputElement | null>(null);

  // Dedicated Video Upload Center State
  const [videoUploadFile, setVideoUploadFile] = useState<File | null>(null);
  const [videoUploadPreview, setVideoUploadPreview] = useState<string>('');
  const [videoTargetProduct, setVideoTargetProduct] = useState<string>('');
  const [videoUploading, setVideoUploading] = useState(false);
  const dedicatedVideoPickerRef = useRef<HTMLInputElement | null>(null);

  // Categories Manager State
  const [categoryInputName, setCategoryInputName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Media Library filter
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all');

  // Settings / Password Form State
  const [passCurrent, setPassCurrent] = useState('');
  const [passNew, setPassNew] = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passLoading, setPassLoading] = useState(false);

  // Helper for notification toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  // Load All Data from Supabase
  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, cats, medias, dbInfo] = await Promise.all([
        fetchProducts(),
        fetchCategories(),
        fetchMediaItems(),
        fetchDatabaseStatus(),
      ]);
      setProducts(prods);
      setCategories(cats);
      setMediaList(medias);
      setDbStatus(dbInfo);
    } catch (e) {
      showToast('Could not load database records. Using offline copy.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Summary counts
  const totalProducts = products.filter((p) => p.type !== 'video').length;
  const totalPhotos = mediaList.filter((m) => m.media_type === 'image').length;
  const totalVideos = products.filter((p) => Boolean(p.video_url)).length;

  // Filtered products in Manage Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tags.toLowerCase().includes(q);

      const matchCat = categoryFilter === 'all' || p.category === categoryFilter;

      const matchAvail =
        availabilityFilter === 'all' ||
        (availabilityFilter === 'in_stock' && (p.availability === 'in_stock' || !p.availability)) ||
        (availabilityFilter === 'made_to_order' && p.availability === 'made_to_order') ||
        (availabilityFilter === 'out_of_stock' && p.availability === 'out_of_stock');

      return matchQuery && matchCat && matchAvail;
    });
  }, [products, searchQuery, categoryFilter, availabilityFilter]);

  // Open Add Product Form
  const handleOpenAddProduct = () => {
    setEditingItem(null);
    setIsAddingNew(true);
    setFormName('');
    setFormCategory(categories[0]?.name || 'Puja Thali');
    setFormDescription('');
    setFormAvailability('in_stock');
    setFormTags('');
    setFormPhotoFiles([]);
    setFormPhotoPreviews([]);
    setFormExistingPhoto('');
    setFormVideoFile(null);
    setFormVideoPreview('');
    setFormExistingVideo('');
    setFormNewCategoryInline(false);
    setFormNewCategoryName('');
    setActiveSection('add-product');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Open Edit Product Form
  const handleOpenEditProduct = (p: StoreItem) => {
    setEditingItem(p);
    setIsAddingNew(false);
    setFormName(p.name);
    setFormCategory(p.category);
    setFormDescription(p.description);
    setFormAvailability(p.availability || 'in_stock');
    setFormTags(p.tags || '');
    setFormPhotoFiles([]);
    setFormPhotoPreviews([]);
    setFormExistingPhoto(p.image_url || '/logo.png');
    setFormVideoFile(null);
    setFormVideoPreview('');
    setFormExistingVideo(p.video_url || '');
    setFormNewCategoryInline(false);
    setFormNewCategoryName('');
    setActiveSection('add-product');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Select photos for Add/Edit Form
  const handleSelectFormPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setFormPhotoFiles((prev) => [...prev, ...files]);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (loadEv) => {
        if (loadEv.target?.result) {
          setFormPhotoPreviews((prev) => [...prev, String(loadEv.target?.result)]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Select video for Add/Edit Form
  const handleSelectFormVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormVideoFile(file);
    const blobUrl = URL.createObjectURL(file);
    setFormVideoPreview(blobUrl);
  };

  // Save Product (Create or Edit)
  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Please enter a product name.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalCategory = formCategory;
      if (formNewCategoryInline && formNewCategoryName.trim()) {
        finalCategory = formNewCategoryName.trim();
        await saveCategory({
          id: `CAT-${Date.now().toString(36).toUpperCase()}`,
          name: finalCategory,
          display_order: categories.length,
        });
      }

      const productId = editingItem ? editingItem.id : generateUniqueId('AK');
      const slug = `${formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${productId.toLowerCase()}`;

      let finalImageUrl = formExistingPhoto || '/logo.png';
      let finalVideoUrl = formExistingVideo || '';

      // Upload photos if newly selected
      if (formPhotoFiles.length > 0) {
        for (const file of formPhotoFiles) {
          const media = await uploadMediaFile(file, productId, 'image');
          if (media.storage_path) {
            finalImageUrl = media.storage_path;
          }
        }
      }

      // Upload video if newly selected
      if (formVideoFile) {
        const media = await uploadMediaFile(formVideoFile, productId, 'video');
        if (media.storage_path) {
          finalVideoUrl = media.storage_path;
        }
      }

      const productPayload: StoreItem = {
        id: productId,
        type: 'product',
        name: formName.trim(),
        category: finalCategory || 'Puja Thali',
        slug,
        description: formDescription.trim(),
        image_url: finalImageUrl,
        video_url: finalVideoUrl,
        tags: formTags.trim() || `${formName} handmade craft resin`,
        published: true,
        availability: formAvailability,
        created_at: editingItem?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const saved = await saveProduct(productPayload);

      // Update state
      setProducts((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = saved;
          return copy;
        }
        return [saved, ...prev];
      });

      showToast(editingItem ? 'Product updated successfully.' : 'Product added successfully! It is now live on your website.');
      setActiveSection('products');
      setIsAddingNew(false);
      setEditingItem(null);
      loadData();
    } catch (err: any) {
      showToast(`Could not save product: ${err?.message || 'Please check your connection and try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Product
  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      await deleteProduct(productToDelete.id);
      setProducts((prev) => prev.filter((p) => p.id !== productToDelete.id));
      showToast(`"${productToDelete.name}" has been deleted.`);
    } catch (e: any) {
      showToast(`Error deleting product: ${e.message}`);
    } finally {
      setProductToDelete(null);
    }
  };

  // Quick Photo Upload for a product in the list
  const handleQuickPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !quickUploadProductId) return;

    showToast('Uploading photo...');
    try {
      const media = await uploadMediaFile(file, quickUploadProductId, 'image');
      setProducts((prev) =>
        prev.map((p) => (p.id === quickUploadProductId ? { ...p, image_url: media.storage_path } : p))
      );
      showToast('Product photo updated successfully!');
      loadData();
    } catch (err: any) {
      showToast('Photo upload failed. Please try again.');
    } finally {
      setQuickUploadProductId(null);
    }
  };

  // Quick Video Upload for a product in the list
  const handleQuickVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !quickUploadProductId) return;

    showToast('Uploading video...');
    try {
      const media = await uploadMediaFile(file, quickUploadProductId, 'video');
      setProducts((prev) =>
        prev.map((p) => (p.id === quickUploadProductId ? { ...p, video_url: media.storage_path } : p))
      );
      showToast('Product video uploaded successfully!');
      loadData();
    } catch (err: any) {
      showToast('Video upload failed. Please try again.');
    } finally {
      setQuickUploadProductId(null);
    }
  };

  // Dedicated Photo Center Upload Action
  const handleDedicatedPhotoUpload = async () => {
    if (!photoUploadFiles.length) {
      showToast('Please select at least one photo first.');
      return;
    }

    setPhotoUploading(true);
    try {
      const targetId = photoTargetProduct || products[0]?.id || 'GENERAL';
      for (const file of photoUploadFiles) {
        await uploadMediaFile(file, targetId, 'image');
      }
      showToast(`${photoUploadFiles.length} photo(s) uploaded successfully!`);
      setPhotoUploadFiles([]);
      setPhotoUploadPreviews([]);
      loadData();
    } catch (e: any) {
      showToast(`Upload failed: ${e.message}`);
    } finally {
      setPhotoUploading(false);
    }
  };

  // Dedicated Video Center Upload Action
  const handleDedicatedVideoUpload = async () => {
    if (!videoUploadFile) {
      showToast('Please select a video file first.');
      return;
    }
    if (!videoTargetProduct) {
      showToast('Please select which product this video showcases.');
      return;
    }

    setVideoUploading(true);
    try {
      await uploadMediaFile(videoUploadFile, videoTargetProduct, 'video');
      showToast('Video uploaded and attached to product successfully!');
      setVideoUploadFile(null);
      setVideoUploadPreview('');
      loadData();
    } catch (e: any) {
      showToast(`Video upload failed: ${e.message}`);
    } finally {
      setVideoUploading(false);
    }
  };

  // Category Add Action
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = categoryInputName.trim();
    if (!cleanName) return;

    try {
      const newCat: CategoryItem = {
        id: `CAT-${Date.now().toString(36).toUpperCase()}`,
        name: cleanName,
        display_order: categories.length,
      };
      await saveCategory(newCat);
      setCategories((prev) => [...prev, newCat]);
      setCategoryInputName('');
      showToast(`Category "${cleanName}" added successfully.`);
    } catch (e: any) {
      showToast(`Error adding category: ${e.message}`);
    }
  };

  // Category Rename Action
  const handleRenameCategory = async (cat: CategoryItem) => {
    const cleanName = editingCategoryName.trim();
    if (!cleanName || cleanName === cat.name) {
      setEditingCategoryId(null);
      return;
    }

    try {
      const updated: CategoryItem = { ...cat, name: cleanName };
      await saveCategory(updated);
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? updated : c)));
      showToast(`Category renamed to "${cleanName}".`);
      setEditingCategoryId(null);
    } catch (e: any) {
      showToast(`Error renaming category: ${e.message}`);
    }
  };

  // Category Delete Action
  const handleDeleteCategory = async (cat: CategoryItem) => {
    const assignedCount = products.filter((p) => p.category.toLowerCase() === cat.name.toLowerCase()).length;
    if (assignedCount > 0) {
      showToast(`Cannot delete "${cat.name}". It contains ${assignedCount} product(s). Please move them first.`);
      return;
    }

    try {
      await deleteCategory(cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      showToast(`Category "${cat.name}" removed.`);
    } catch (e: any) {
      showToast(`Error deleting category: ${e.message}`);
    }
  };

  // Delete Media
  const handleConfirmDeleteMedia = async () => {
    if (!mediaToDelete) return;
    try {
      await deleteMediaItem(mediaToDelete.id);
      setMediaList((prev) => prev.filter((m) => m.id !== mediaToDelete.id));
      showToast('Media removed.');
    } catch (e: any) {
      showToast(`Error deleting media: ${e.message}`);
    } finally {
      setMediaToDelete(null);
    }
  };

  // Update Password
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passCurrent || !passNew || !passConfirm) {
      showToast('Please fill in all password fields.');
      return;
    }
    if (passNew !== passConfirm) {
      showToast('New passwords do not match.');
      return;
    }
    if (passNew.length < 8) {
      showToast('New password must be at least 8 characters long.');
      return;
    }

    setPassLoading(true);
    try {
      const res = await updateAdminPassword(passCurrent, passNew);
      if (res.success) {
        showToast('Password updated successfully!');
        setPassCurrent('');
        setPassNew('');
        setPassConfirm('');
      } else {
        showToast(res.error || 'Failed to update password.');
      }
    } catch (e: any) {
      showToast('Could not update password. Please verify current password.');
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#faf8f5',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#1e293b',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Hidden file pickers for quick uploads from product list */}
      <input
        type="file"
        ref={quickPhotoPickerRef}
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleQuickPhotoSelect}
      />
      <input
        type="file"
        ref={quickVideoPickerRef}
        accept="video/mp4"
        style={{ display: 'none' }}
        onChange={handleQuickVideoSelect}
      />

      {/* TOP BAR */}
      <header
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e7e2d8',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Brand */}
          <div
            onClick={() => setActiveSection('overview')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          >
            <img
              src="/logo.png"
              alt="Anmol Kala"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '2px solid #d8b45a',
                objectFit: 'cover',
                background: '#fff',
              }}
            />
            <div>
              <div style={{ fontWeight: 800, fontSize: '18px', color: '#0f172a', lineHeight: 1.2 }}>
                Anmol Kala
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', letterSpacing: '1px', fontWeight: 700 }}>
                CLIENT DASHBOARD
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveSection('overview')}
              style={{
                background: activeSection === 'overview' ? '#182235' : 'transparent',
                color: activeSection === 'overview' ? '#ffffff' : '#334155',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              🏠 Home
            </button>
            <button
              type="button"
              onClick={handleOpenAddProduct}
              style={{
                background: activeSection === 'add-product' ? '#c9a24d' : '#f0e8d5',
                color: activeSection === 'add-product' ? '#ffffff' : '#785617',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ＋ Add Product
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('products')}
              style={{
                background: activeSection === 'products' ? '#182235' : 'transparent',
                color: activeSection === 'products' ? '#ffffff' : '#334155',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              📦 Products
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('images')}
              style={{
                background: activeSection === 'images' ? '#182235' : 'transparent',
                color: activeSection === 'images' ? '#ffffff' : '#334155',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              📷 Photos
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('videos')}
              style={{
                background: activeSection === 'videos' ? '#182235' : 'transparent',
                color: activeSection === 'videos' ? '#ffffff' : '#334155',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              🎥 Videos
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('categories')}
              style={{
                background: activeSection === 'categories' ? '#182235' : 'transparent',
                color: activeSection === 'categories' ? '#ffffff' : '#334155',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              🗂️ Categories
            </button>
          </nav>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onBackToStore}
              title="View live website"
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#182235',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap',
              }}
            >
              <span>👁️</span>
              <span className="hidden-mobile">View Website</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '6px',
                padding: '7px 10px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#991b1b',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main style={{ maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '24px 16px', flex: 1 }}>
        {/* ============================================================
            1. DASHBOARD HOME (OVERVIEW)
            ============================================================ */}
        {activeSection === 'overview' && (
          <div>
            {/* Welcome banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, #182235 0%, #2a3952 100%)',
                color: '#ffffff',
                padding: '28px 24px',
                borderRadius: '14px',
                marginBottom: '24px',
                boxShadow: '0 8px 20px rgba(24, 34, 53, 0.15)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '26px', margin: '0 0 6px', fontWeight: 800 }}>
                  Welcome to Anmol Kala Manager
                </h1>
                <p style={{ margin: 0, fontSize: '14px', color: '#cbd5e1', maxWidth: '600px', lineHeight: 1.5 }}>
                  Manage your craft catalogue easily. Tap any card below to add new items, update photos, or organize categories.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddProduct}
                style={{
                  background: 'linear-gradient(135deg, #d8b45a 0%, #c9a24d 100%)',
                  color: '#182235',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 20px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(201, 162, 77, 0.35)',
                }}
              >
                ＋ Add New Product
              </button>
            </div>

            {/* Small Useful Summaries */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px',
                marginBottom: '28px',
              }}
            >
              <div
                style={{
                  background: '#ffffff',
                  padding: '18px 20px',
                  borderRadius: '12px',
                  border: '1px solid #e7e2d8',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Total Products
                </div>
                <div style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                  {totalProducts}
                </div>
                <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '2px', fontWeight: 600 }}>
                  Active in storefront
                </div>
              </div>

              <div
                style={{
                  background: '#ffffff',
                  padding: '18px 20px',
                  borderRadius: '12px',
                  border: '1px solid #e7e2d8',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Total Photos
                </div>
                <div style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                  {totalPhotos || products.length}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  Product showcase images
                </div>
              </div>

              <div
                style={{
                  background: '#ffffff',
                  padding: '18px 20px',
                  borderRadius: '12px',
                  border: '1px solid #e7e2d8',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Total Videos
                </div>
                <div style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                  {totalVideos}
                </div>
                <div style={{ fontSize: '11px', color: '#2563eb', marginTop: '2px', fontWeight: 600 }}>
                  Craft demonstration videos
                </div>
              </div>

              <div
                style={{
                  background: '#ffffff',
                  padding: '18px 20px',
                  borderRadius: '12px',
                  border: '1px solid #e7e2d8',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Collections
                </div>
                <div style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                  {categories.length}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  Thalis, Clocks, Frames, Trays
                </div>
              </div>
            </div>

            {/* Clear Action Cards */}
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: '#0f172a' }}>
              What would you like to do?
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px',
              }}
            >
              {/* 1. Add Product Card */}
              <div
                onClick={handleOpenAddProduct}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2dac9',
                  padding: '22px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#c9a24d';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2dac9';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    background: '#fef3c7',
                    color: '#b45309',
                    fontSize: '24px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  ➕
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                    Add New Product
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Add a new item to your website with photos, video and price.
                  </p>
                </div>
              </div>

              {/* 2. Manage Products Card */}
              <div
                onClick={() => setActiveSection('products')}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2dac9',
                  padding: '22px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#c9a24d';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2dac9';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '24px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  📦
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                    Manage Products
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Edit names, descriptions, photos, and availability.
                  </p>
                </div>
              </div>

              {/* 3. Upload Photos Card */}
              <div
                onClick={() => setActiveSection('images')}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2dac9',
                  padding: '22px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#c9a24d';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2dac9';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    background: '#dcfce7',
                    color: '#15803d',
                    fontSize: '24px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  📷
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                    Upload Photos
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Choose pictures directly from your phone or computer.
                  </p>
                </div>
              </div>

              {/* 4. Upload Videos Card */}
              <div
                onClick={() => setActiveSection('videos')}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2dac9',
                  padding: '22px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#c9a24d';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2dac9';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    background: '#fae8ff',
                    color: '#a21caf',
                    fontSize: '24px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  🎥
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                    Upload Videos
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Add a product video to your website.
                  </p>
                </div>
              </div>

              {/* 5. Categories Card */}
              <div
                onClick={() => setActiveSection('categories')}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2dac9',
                  padding: '22px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#c9a24d';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2dac9';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    background: '#ffedd5',
                    color: '#c2410c',
                    fontSize: '24px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  🗂️
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                    Categories
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Organize your craft collections (Thalis, Frames, Clocks, etc.).
                  </p>
                </div>
              </div>

              {/* 6. Media Library Card */}
              <div
                onClick={() => setActiveSection('media-gallery')}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2dac9',
                  padding: '22px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#c9a24d';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2dac9';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    background: '#f1f5f9',
                    color: '#475569',
                    fontSize: '24px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  🖼️
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                    Media Library
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Browse and manage all uploaded photos and videos.
                  </p>
                </div>
              </div>

              {/* 7. Settings Card */}
              <div
                onClick={() => setActiveSection('settings')}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2dac9',
                  padding: '22px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#c9a24d';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2dac9';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    background: '#f3e8ff',
                    color: '#7e22ce',
                    fontSize: '24px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  ⚙️
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                    Settings
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Change admin password and view database connection.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            2. ADD / EDIT PRODUCT — ONE EASY FORM
            ============================================================ */}
        {activeSection === 'add-product' && (
          <div style={{ maxWidth: '820px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <button
                  type="button"
                  onClick={() => setActiveSection('products')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                    marginBottom: '4px',
                  }}
                >
                  ← Back to Products
                </button>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  {editingItem ? 'Edit Product' : 'Add New Product'}
                </h1>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
                  {editingItem
                    ? `Updating "${editingItem.name}" (ID: ${editingItem.id})`
                    : 'Fill in the details below. It will appear on your website as soon as you tap Save.'}
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSaveProductForm}
              style={{
                background: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #e7e2d8',
                padding: '28px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              }}
            >
              {/* Product Name */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Enter product name (e.g. Peacock Resin Puja Thali)"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Category */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontWeight: 700, fontSize: '13px' }}>Category *</label>
                  <button
                    type="button"
                    onClick={() => setFormNewCategoryInline(!formNewCategoryInline)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#b45309',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {formNewCategoryInline ? 'Choose Existing' : '＋ Add New Category'}
                  </button>
                </div>

                {!formNewCategoryInline ? (
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      background: '#fff',
                    }}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formNewCategoryName}
                    onChange={(e) => setFormNewCategoryName(e.target.value)}
                    placeholder="Type new category name (e.g. Diya Holders)"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid #c9a24d',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      background: '#fffdf9',
                    }}
                  />
                )}
              </div>

              {/* Description */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                  Product Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Write a short description about the product (materials, size, finish)..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Availability */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
                  Availability
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setFormAvailability('in_stock')}
                    style={{
                      background: formAvailability === 'in_stock' ? '#16a34a' : '#ffffff',
                      color: formAvailability === 'in_stock' ? '#ffffff' : '#334155',
                      border: formAvailability === 'in_stock' ? '1px solid #16a34a' : '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>🟢</span> Available (In Stock)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormAvailability('made_to_order')}
                    style={{
                      background: formAvailability === 'made_to_order' ? '#d97706' : '#ffffff',
                      color: formAvailability === 'made_to_order' ? '#ffffff' : '#334155',
                      border: formAvailability === 'made_to_order' ? '1px solid #d97706' : '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>🟡</span> Made to Order
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormAvailability('out_of_stock')}
                    style={{
                      background: formAvailability === 'out_of_stock' ? '#dc2626' : '#ffffff',
                      color: formAvailability === 'out_of_stock' ? '#ffffff' : '#334155',
                      border: formAvailability === 'out_of_stock' ? '1px solid #dc2626' : '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>🔴</span> Out of Stock
                  </button>
                </div>
              </div>

              {/* Product Photos (Device Native File Selection) */}
              <div style={{ marginBottom: '24px', padding: '16px', borderRadius: '10px', background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '14px', marginBottom: '4px' }}>
                  📷 Product Photos
                </label>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
                  Tap below to choose photos directly from your phone gallery or computer.
                </p>

                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleSelectFormPhotos}
                  id="form-photo-input"
                  style={{ display: 'none' }}
                />

                <label
                  htmlFor="form-photo-input"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '11px 18px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#182235',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <span>📷</span> Select Photos from Gallery
                </label>

                {/* Previews */}
                {(formPhotoPreviews.length > 0 || formExistingPhoto) && (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
                    {formExistingPhoto && formPhotoPreviews.length === 0 && (
                      <div style={{ position: 'relative' }}>
                        <img
                          src={formExistingPhoto}
                          alt="Current photo"
                          style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                          onError={handleImageError}
                        />
                        <span style={{ position: 'absolute', bottom: '4px', left: '4px', background: '#0008', color: '#fff', fontSize: '9px', padding: '2px 4px', borderRadius: '3px' }}>
                          Current
                        </span>
                      </div>
                    )}
                    {formPhotoPreviews.map((src, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img
                          src={src}
                          alt="New preview"
                          style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #22c55e' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFormPhotoPreviews((prev) => prev.filter((_, idx) => idx !== i));
                            setFormPhotoFiles((prev) => prev.filter((_, idx) => idx !== i));
                          }}
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            background: '#ef4444',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '22px',
                            height: '22px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Product Video (Device Native File Selection) */}
              <div style={{ marginBottom: '28px', padding: '16px', borderRadius: '10px', background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '14px', marginBottom: '4px' }}>
                  🎥 Product Craft Video (Optional)
                </label>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
                  Add a real craft making or demonstration video (MP4).
                </p>

                <input
                  type="file"
                  accept="video/mp4"
                  onChange={handleSelectFormVideo}
                  id="form-video-input"
                  style={{ display: 'none' }}
                />

                <label
                  htmlFor="form-video-input"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '11px 18px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#182235',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <span>🎥</span> Select Video from Gallery
                </label>

                {(formVideoPreview || formExistingVideo) && (
                  <div style={{ marginTop: '14px', maxWidth: '320px', position: 'relative' }}>
                    <video
                      src={formVideoPreview || formExistingVideo}
                      controls
                      playsInline
                      style={{ width: '100%', borderRadius: '8px', maxHeight: '180px', background: '#000' }}
                    />
                    {formVideoPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormVideoFile(null);
                          setFormVideoPreview('');
                        }}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          fontSize: '13px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    background: isSubmitting ? '#94a3b8' : '#15803d',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '13px 26px',
                    fontSize: '15px',
                    fontWeight: 800,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(21, 128, 61, 0.25)',
                  }}
                >
                  {isSubmitting ? 'Saving product...' : '💾 Save Product to Website'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('products')}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '13px 20px',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ============================================================
            3. MANAGE PRODUCTS LIST
            ============================================================ */}
        {activeSection === 'products' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                  Manage Products
                </h1>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  Edit names, descriptions, photos, and availability.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddProduct}
                style={{
                  background: 'linear-gradient(135deg, #182235 0%, #0f172a 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>＋</span> Add New Product
              </button>
            </div>

            {/* Search and filter controls */}
            <div
              style={{
                background: '#ffffff',
                padding: '14px 16px',
                borderRadius: '12px',
                border: '1px solid #e7e2d8',
                marginBottom: '16px',
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your products by name, category, or ID..."
                style={{
                  flex: 1,
                  minWidth: '220px',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  background: '#fff',
                }}
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  background: '#fff',
                }}
              >
                <option value="all">All Statuses</option>
                <option value="in_stock">In Stock</option>
                <option value="made_to_order">Made to Order</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>

            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
              Showing {filteredProducts.length} of {products.length} products
            </div>

            {/* Products List */}
            <div style={{ display: 'grid', gap: '10px' }}>
              {filteredProducts.length === 0 ? (
                <div style={{ background: '#fff', padding: '40px', textAlign: 'center', borderRadius: '12px', color: '#64748b' }}>
                  No products matched your search.
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const availColor =
                    p.availability === 'out_of_stock'
                      ? '#dc2626'
                      : p.availability === 'made_to_order'
                      ? '#d97706'
                      : '#16a34a';

                  const availLabel =
                    p.availability === 'out_of_stock'
                      ? 'Out of Stock'
                      : p.availability === 'made_to_order'
                      ? 'Made to Order'
                      : 'In Stock';

                  return (
                    <article
                      key={p.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e7e2d8',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      {/* Left: Thumbnail & Name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '260px', flex: 1 }}>
                        <img
                          src={p.image_url || '/logo.png'}
                          alt={p.name}
                          style={{
                            width: '56px',
                            height: '56px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            background: '#fafafa',
                            flexShrink: 0,
                          }}
                          onError={handleImageError}
                        />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: '#0369a1' }}>{p.category}</span>
                            <span>•</span>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{p.id}</span>
                            {p.video_url && <span style={{ color: '#a21caf', fontWeight: 700 }}>🎥 Video attached</span>}
                          </div>
                        </div>
                      </div>

                      {/* Middle: Availability Pill */}
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: '20px',
                          background: `${availColor}15`,
                          color: availColor,
                          border: `1px solid ${availColor}40`,
                        }}
                      >
                        {availLabel}
                      </span>

                      {/* Right: Actions */}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditProduct(p)}
                          style={{
                            background: '#182235',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          ✏️ Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setQuickUploadProductId(p.id);
                            quickPhotoPickerRef.current?.click();
                          }}
                          title="Replace product photo"
                          style={{
                            background: '#ffffff',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          📷 Photo
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setQuickUploadProductId(p.id);
                            quickVideoPickerRef.current?.click();
                          }}
                          title="Attach or replace video"
                          style={{
                            background: '#ffffff',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          🎥 Video
                        </button>

                        <button
                          type="button"
                          onClick={() => setProductToDelete(p)}
                          style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            4. PHOTO UPLOAD SECTION
            ============================================================ */}
        {activeSection === 'images' && (
          <div style={{ maxWidth: '820px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
              Upload Photos
            </h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '13px' }}>
              Choose pictures directly from your phone or computer.
            </p>

            <div
              style={{
                background: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #e7e2d8',
                padding: '28px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                marginBottom: '28px',
              }}
            >
              {/* Product Target Dropdown */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                  Which product is this photo for?
                </label>
                <select
                  value={photoTargetProduct}
                  onChange={(e) => setPhotoTargetProduct(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#fff',
                  }}
                >
                  <option value="">Choose a product (optional)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Upload Drop Zone */}
              <input
                type="file"
                multiple
                ref={dedicatedPhotoPickerRef}
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  setPhotoUploadFiles((prev) => [...prev, ...files]);
                  files.forEach((f) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      if (ev.target?.result) {
                        setPhotoUploadPreviews((prev) => [...prev, String(ev.target?.result)]);
                      }
                    };
                    reader.readAsDataURL(f);
                  });
                }}
              />

              <div
                onClick={() => dedicatedPhotoPickerRef.current?.click()}
                style={{
                  border: '2px dashed #c9a24d',
                  borderRadius: '12px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  background: '#fefdfb',
                  cursor: 'pointer',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '38px', marginBottom: '8px' }}>📷</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Tap here to select photos from your device
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Select one or multiple photos (JPG, PNG, WEBP)
                </div>
              </div>

              {/* Previews */}
              {photoUploadPreviews.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
                    Selected Photos ({photoUploadPreviews.length}):
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {photoUploadPreviews.map((src, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img
                          src={src}
                          alt="preview"
                          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoUploadPreviews((prev) => prev.filter((_, idx) => idx !== i));
                            setPhotoUploadFiles((prev) => prev.filter((_, idx) => idx !== i));
                          }}
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            background: '#ef4444',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={photoUploading || photoUploadFiles.length === 0}
                onClick={handleDedicatedPhotoUpload}
                style={{
                  background: photoUploading || photoUploadFiles.length === 0 ? '#94a3b8' : '#15803d',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: photoUploading || photoUploadFiles.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {photoUploading ? 'Uploading...' : 'Upload Photos Now'}
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            5. VIDEO UPLOAD SECTION
            ============================================================ */}
        {activeSection === 'videos' && (
          <div style={{ maxWidth: '820px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
              Upload Videos
            </h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '13px' }}>
              Add a craft demonstration video to your website.
            </p>

            <div
              style={{
                background: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #e7e2d8',
                padding: '28px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                marginBottom: '28px',
              }}
            >
              {/* Product Target Dropdown */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                  Which product does this video showcase? *
                </label>
                <select
                  value={videoTargetProduct}
                  onChange={(e) => setVideoTargetProduct(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#fff',
                  }}
                >
                  <option value="">Select product to attach video...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id}) {p.video_url ? '— [Has Video]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Upload Drop Zone */}
              <input
                type="file"
                ref={dedicatedVideoPickerRef}
                accept="video/mp4"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setVideoUploadFile(file);
                  setVideoUploadPreview(URL.createObjectURL(file));
                }}
              />

              <div
                onClick={() => dedicatedVideoPickerRef.current?.click()}
                style={{
                  border: '2px dashed #0284c7',
                  borderRadius: '12px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  background: '#f0f9ff',
                  cursor: 'pointer',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '38px', marginBottom: '8px' }}>🎥</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Tap here to select a video from your device
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Supports MP4 format videos
                </div>
              </div>

              {/* Video Player Preview */}
              {videoUploadPreview && (
                <div style={{ marginBottom: '20px', maxWidth: '360px' }}>
                  <video
                    src={videoUploadPreview}
                    controls
                    playsInline
                    style={{ width: '100%', maxHeight: '220px', borderRadius: '8px', background: '#000' }}
                  />
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    {videoUploadFile?.name} ({(videoUploadFile!.size / (1024 * 1024)).toFixed(1)} MB)
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={videoUploading || !videoUploadFile}
                onClick={handleDedicatedVideoUpload}
                style={{
                  background: videoUploading || !videoUploadFile ? '#94a3b8' : '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: videoUploading || !videoUploadFile ? 'not-allowed' : 'pointer',
                }}
              >
                {videoUploading ? 'Uploading video...' : 'Upload Video Now'}
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            6. CATEGORIES SECTION
            ============================================================ */}
        {activeSection === 'categories' && (
          <div style={{ maxWidth: '820px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
              Categories
            </h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '13px' }}>
              Organize your products into collections.
            </p>

            {/* Add Category Form */}
            <form
              onSubmit={handleAddCategory}
              style={{
                background: '#ffffff',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #e7e2d8',
                marginBottom: '20px',
                display: 'flex',
                gap: '10px',
              }}
            >
              <input
                type="text"
                required
                value={categoryInputName}
                onChange={(e) => setCategoryInputName(e.target.value)}
                placeholder="New Category Name (e.g. Diya Holders, Wall Art)..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  background: '#182235',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ＋ Add Category
              </button>
            </form>

            {/* Category List */}
            <div style={{ display: 'grid', gap: '8px' }}>
              {categories.map((cat) => {
                const count = products.filter((p) => p.category.toLowerCase() === cat.name.toLowerCase()).length;
                const isEditing = editingCategoryId === cat.id;

                return (
                  <div
                    key={cat.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e7e2d8',
                      borderRadius: '8px',
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    {!isEditing ? (
                      <div>
                        <span style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>{cat.name}</span>
                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '10px' }}>
                          ({count} product{count === 1 ? '' : 's'})
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '400px' }}>
                        <input
                          type="text"
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: '4px',
                            border: '1px solid #c9a24d',
                            fontSize: '14px',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameCategory(cat)}
                          style={{
                            background: '#15803d',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategoryId(null)}
                          style={{
                            background: '#e2e8f0',
                            color: '#334155',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '6px 10px',
                            fontSize: '12px',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {!isEditing && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryId(cat.id);
                            setEditingCategoryName(cat.name);
                          }}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '6px 10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          disabled={count > 0}
                          title={count > 0 ? 'Cannot delete category with products' : 'Delete category'}
                          style={{
                            background: count > 0 ? '#f1f5f9' : '#fee2e2',
                            color: count > 0 ? '#94a3b8' : '#dc2626',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '6px 10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: count > 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================
            7. MEDIA LIBRARY SECTION
            ============================================================ */}
        {activeSection === 'media-gallery' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
                  Media Library
                </h1>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  View and manage all uploaded product photos and craft videos.
                </p>
              </div>

              {/* Filter pills */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setMediaFilter('all')}
                  style={{
                    background: mediaFilter === 'all' ? '#182235' : '#ffffff',
                    color: mediaFilter === 'all' ? '#fff' : '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  All ({mediaList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMediaFilter('image')}
                  style={{
                    background: mediaFilter === 'image' ? '#182235' : '#ffffff',
                    color: mediaFilter === 'image' ? '#fff' : '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Photos
                </button>
                <button
                  type="button"
                  onClick={() => setMediaFilter('video')}
                  style={{
                    background: mediaFilter === 'video' ? '#182235' : '#ffffff',
                    color: mediaFilter === 'video' ? '#fff' : '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Videos
                </button>
              </div>
            </div>

            {/* Media Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '14px',
              }}
            >
              {mediaList
                .filter((m) => mediaFilter === 'all' || m.media_type === mediaFilter)
                .map((m) => {
                  const linkedProduct = products.find((p) => p.id === m.product_id);

                  return (
                    <div
                      key={m.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e7e2d8',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div style={{ height: '140px', background: '#f8fafc', position: 'relative' }}>
                        {m.media_type === 'video' ? (
                          <video
                            src={m.storage_path}
                            controls
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <img
                            src={m.storage_path}
                            alt={m.file_name || 'media'}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={handleImageError}
                          />
                        )}
                        <span
                          style={{
                            position: 'absolute',
                            top: '6px',
                            left: '6px',
                            background: '#000a',
                            color: '#fff',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {m.media_type === 'video' ? '🎥 Video' : '📷 Photo'}
                        </span>
                      </div>

                      <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', wordBreak: 'break-all' }}>
                          {m.file_name || m.id}
                        </div>
                        {linkedProduct && (
                          <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '2px' }}>
                            {linkedProduct.name}
                          </div>
                        )}
                        <div style={{ marginTop: 'auto', paddingTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => setMediaToDelete(m)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#dc2626',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ============================================================
            8. SETTINGS & PASSWORD SECTION
            ============================================================ */}
        {activeSection === 'settings' && (
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>
              Admin Settings
            </h1>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '13px' }}>
              Change your password and check database connection.
            </p>

            {/* Database status card */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e7e2d8',
                padding: '20px',
                marginBottom: '20px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '16px' }}>🟢</span>
                <span style={{ fontWeight: 800, fontSize: '14px', color: '#16a34a' }}>
                  Live Supabase Database Connected
                </span>
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                Provider: {dbStatus?.provider || 'Supabase PostgreSQL'}<br />
                Connected to: {dbStatus?.database || 'postgres'}<br />
                Total synced items: {products.length} products, {categories.length} categories
              </div>
            </div>

            {/* Password Form */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #e7e2d8',
                padding: '24px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              }}
            >
              <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 16px', color: '#0f172a' }}>
                Change Admin Password
              </h2>

              <form onSubmit={handlePasswordSubmit}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                    Current Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={passCurrent}
                    onChange={(e) => setPassCurrent(e.target.value)}
                    placeholder="Enter current password"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                    New Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={passNew}
                    onChange={(e) => setPassNew(e.target.value)}
                    placeholder="Minimum 8 characters"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                    Confirm New Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={passConfirm}
                    onChange={(e) => setPassConfirm(e.target.value)}
                    placeholder="Re-type new password"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: '#64748b' }}>
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                    />
                    Show password characters
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={passLoading}
                  style={{
                    background: passLoading ? '#94a3b8' : '#182235',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '11px 20px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: passLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {passLoading ? 'Updating password...' : 'Update Password'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* CONFIRM DELETE PRODUCT MODAL */}
      {productToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setProductToDelete(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              padding: '24px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px', color: '#0f172a' }}>
              Delete "{productToDelete.name}"?
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, margin: '0 0 20px' }}>
              Are you sure you want to permanently remove this product from your website? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProduct}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Yes, Delete Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MEDIA MODAL */}
      {mediaToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setMediaToDelete(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 6px', color: '#0f172a' }}>
              Delete media item?
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
              Are you sure you want to delete this file?
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setMediaToDelete(null)}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMedia}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST FEEDBACK NOTIFICATION */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#182235',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>✨</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
