import React, { useState } from 'react';
import { Product } from '../types';
import { handleImageError, getWaUrl, getProductUrl } from '../utils/helpers';
import { ProductCard } from './ProductCard';

interface ProductDetailProps {
  product: Product;
  allProducts: Product[];
  whatsappNumber: string;
  isWishlisted: boolean;
  isSaved: boolean;
  onToggleWishlist: (id: string) => void;
  onToggleSave: (id: string) => void;
  onBack: () => void;
  onOpenProduct: (product: Product) => void;
  onToast: (msg: string) => void;
}

export const ProductDetail: React.FC<ProductDetailProps> = ({
  product,
  allProducts,
  whatsappNumber,
  isWishlisted,
  isSaved,
  onToggleWishlist,
  onToggleSave,
  onBack,
  onOpenProduct,
  onToast,
}) => {
  const [relPage, setRelPage] = useState<number>(1);
  const [showVideo, setShowVideo] = useState<boolean>(false);
  const perPage = 10;

  const isReview = product.category === 'Product Image Requires Review';
  const related = allProducts.filter(
    (p) => p.category === product.category && p.id !== product.id
  );
  const totalRelPages = Math.max(1, Math.ceil(related.length / perPage));
  const currentPage = Math.min(relPage, totalRelPages);
  const start = (currentPage - 1) * perPage;
  const currentRelated = related.slice(start, start + perPage);

  const handleCopyLink = () => {
    const url = getProductUrl(product);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        onToast('Product link copied to clipboard');
      });
    } else {
      onToast(`Link: ${url}`);
    }
  };

  const handleShare = () => {
    const url = getProductUrl(product);
    if (navigator.share) {
      navigator
        .share({
          title: product.name,
          text: `AnmolKala product: ${product.name}`,
          url,
        })
        .catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  return (
    <section className="product-page">
      <button type="button" className="backbtn" onClick={onBack}>
        ← Back to products
      </button>

      <div className="product-top">
        <div>
          {product.video_url && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setShowVideo(false)}
                style={{
                  background: !showVideo ? '#182235' : '#f1f5f9',
                  color: !showVideo ? '#ffffff' : '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                📷 Photo
              </button>
              <button
                type="button"
                onClick={() => setShowVideo(true)}
                style={{
                  background: showVideo ? '#182235' : '#f1f5f9',
                  color: showVideo ? '#ffffff' : '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>🎥</span>
                <span>Craft Video (play)</span>
              </button>
            </div>
          )}

          {showVideo && product.video_url ? (
            <div style={{ background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
              <video
                src={product.video_url}
                controls
                autoPlay
                playsInline
                style={{ width: '100%', maxHeight: '420px', display: 'block', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <img
              className="product-image"
              src={product.image_url || product.image || '/logo.png'}
              alt={product.name}
              onError={handleImageError}
            />
          )}
        </div>

        <div className="product-meta">
          <div className="ct">{product.category}</div>
          <h1>{product.name}</h1>
          <p>
            <b>Product ID:</b> {product.id}
          </p>

          {isReview ? (
            <div className="review">
              <b>Product Image Requires Review</b>
              <br />
              This image appears to be a company/brand graphic rather than a clearly
              identifiable physical product, so no product type has been invented for it.
            </div>
          ) : (
            <p className="lead">{product.description}</p>
          )}

          <div className="product-actions">
            <button type="button" onClick={() => onToggleWishlist(product.id)}>
              {isWishlisted ? '♥ Remove Wishlist' : '♡ Add to Wishlist'}
            </button>
            <button type="button" onClick={() => onToggleSave(product.id)}>
              {isSaved ? '🛒 In Saved' : '🛒 Save for Later'}
            </button>
            <button type="button" onClick={handleCopyLink}>
              🔗 Copy Link
            </button>
            <button type="button" onClick={handleShare}>
              ↗ Share
            </button>
            {!isReview && (
              <a
                className="wa"
                href={getWaUrl(product, whatsappNumber)}
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 Order on WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {!isReview && (
        <div className="related">
          <div className="head">
            <div>
              <h2>More from {product.category}</h2>
              <div className="muted">{related.length} matching products · 10 per page</div>
            </div>
          </div>

          <div className="grid">
            {currentRelated.length > 0 ? (
              currentRelated.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  whatsappNumber={whatsappNumber}
                  isWishlisted={false}
                  onToggleWishlist={onToggleWishlist}
                  onOpenProduct={onOpenProduct}
                  variant="compact"
                />
              ))
            ) : (
              <div style={{ gridColumn: '1/-1', padding: '30px' }} className="muted">
                No other products in this category.
              </div>
            )}
          </div>

          {totalRelPages > 1 && (
            <div className="pager">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setRelPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <span className="pageinfo">
                Page {currentPage} of {totalRelPages}
              </span>
              <button
                type="button"
                disabled={currentPage === totalRelPages}
                onClick={() => setRelPage((p) => Math.min(totalRelPages, p + 1))}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
