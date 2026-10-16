# Anmol Kala — Admin Dashboard & Supabase Integration Guide

This guide explains how to access, use, and deploy the secure Admin Dashboard for **Anmol Kala**.

---

## 1. Accessing the Admin Login ("A" Icon in Footer)

- Scroll to the **very bottom of the website footer** on any page.
- At the absolute bottom center, below the copyright and tagline, you will see a **small, discreet circular icon containing the letter `A`**.
- It is designed with subtle gold accents matching the Anmol Kala brand.
- Tapping or clicking this icon immediately opens the **Dedicated Admin Login Page** (`/admin/login`).

---

## 2. Administrator Credentials

- **Admin Username / Email**: `anmolkala.in@gmail.com`
- **Initial Password**: `mnbvcxz12`

> **Note**: Both Supabase Auth and secure SHA-256 local encrypted fallback are supported. The system works immediately with these credentials even before configuring external database keys, and seamlessly synchronizes with Supabase once credentials are provided.

---

## 3. Updating the Admin Password

The administrator can change their password at any time:
1. Log in to the Admin Dashboard.
2. In the sidebar or navigation menu, select **Admin & Security** (🛡️).
3. Under **Change Admin Password**:
   - Enter your **Current Password** (e.g. `mnbvcxz12`).
   - Enter your **New Password** (minimum 8 characters).
   - Re-enter to **Confirm New Password**.
4. Click **Update Password**.
5. The password will be verified against the current credential before being securely hashed and saved.

---

## 4. Admin Dashboard Sections

The dashboard is organized into 12 independent, dedicated sections with a desktop sidebar and responsive mobile drawer:

1. **📊 Overview Dashboard**:
   - Real metrics retrieved directly from the database: Total Products, Categories, Images, Videos, Available Products, and Unavailable Products.
   - Quick administrative action shortcuts.
   - Recently updated products table and recently uploaded media thumbnails.

2. **📦 Product Management**:
   - View, search, and filter the entire craft catalogue.
   - Search by **Product Name** or **Unique Product ID** (e.g. `AK-001`, `AK-032`).
   - Filter by Category and Availability Status.
   - **Unique Product IDs**: Every product has a permanent unique ID. Renaming a product preserves its unique ID.
   - **Add New Product**: Automatically generates a unique product ID, accepts title, category, description, and tags.
   - **Native Device Image Picker**: Photo uploads use your device's native file picker (phone gallery or computer file manager). **No manual image URL field is used.**
   - **Delete Product**: Requires explicit confirmation in a modal before deleting.

3. **🗂️ Category Management**:
   - View all active categories with product counts.
   - Create new categories.
   - Rename existing categories (automatically cascades to products).
   - Safe deletion: Deletion is blocked if a category still contains products to prevent orphaned items.

4. **🖼️ Product Image Management**:
   - Dedicated workspace for product photos.
   - Browse images linked to specific products.
   - Tap "Upload Image from Device" to upload directly from phone gallery or laptop.
   - Inspect image details and storage paths.

5. **🎬 Product Video Management**:
   - Independent workspace exclusively for videos.
   - HTML5 video player previews.
   - Upload MP4/MOV demonstration videos directly from your file manager.
   - Assign video demonstrations to products.

6. **⬆️ Upload Center**:
   - Centralized media workstation.
   - Includes dedicated action buttons:
     - `📁 Upload from Gallery`
     - `🔍 Choose Files`
     - `🖼️ Upload Images`
     - `🎬 Upload Videos`
     - `✖ Cancel Upload`
     - `💾 Save Changes`
   - Real-time drag & drop, file size & MIME type validation, preview thumbnails, and upload progress bar.

7. **🎨 Media Gallery**:
   - High-resolution visual grid of all uploaded photos and videos.
   - Filter by All, Images, or Videos.
   - Click to inspect: unique Media ID, linked Product ID, file size, and upload date.

8. **⚡ Availability Manager**:
   - Fast batch toggle between "In Stock / Available", "Made to Order", and "Out of Stock / Unavailable".
   - Updates storefront badges immediately.

9. **🕒 Recently Updated Products**:
   - Chronological audit table of products modified during sessions.

10. **📋 Activity Logs**:
    - Complete security and operation log (Logins, Product Edits, Media Uploads, Password Changes).

11. **🛡️ Admin & Security**:
    - Session status, expiration details, password change form, and secure logout.

12. **⚙️ Website Settings**:
    - Verified contact details: Brand name, WhatsApp (+91 98101 16510), Support Phone (+91 97178 87313), and Email (anmolkala.in@gmail.com).

---

## 5. Supabase Database & Storage Setup

### Step 1: Run SQL Migrations
1. Open your Supabase Dashboard: [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to **SQL Editor** > **New Query**.
3. Copy and paste the entire contents of `SUPABASE_SCHEMA.sql` from this repository.
4. Click **Run**.
5. This creates:
   - `public.store_items` (extended with `availability`)
   - `public.categories`
   - `public.product_media`
   - `public.activity_logs`
   - `public.admin_profiles`
   - Row Level Security (RLS) policies for secure public reading and authenticated admin writes.

### Step 2: Storage Bucket Configuration
1. In Supabase Dashboard, go to **Storage**.
2. Verify the `anmolkala-media` bucket exists and is set to **Public** (already scripted in `SUPABASE_SCHEMA.sql`).
3. If not, click **New Bucket**, name it `anmolkala-media`, and toggle **Public Bucket: ON**.

---

## 6. Environment Variables for Deployment (Vercel)

Add the following environment variables in your Vercel Project Settings (**Settings > Environment Variables**):

| Variable | Description | Example |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL | `https://cdnvwluozfqjwycgaemp.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase Public / Anon API Key | *From Supabase Dashboard > API* |
| `VITE_SUPABASE_STORAGE_BUCKET` | Public storage bucket | `anmolkala-media` |
| `ADMIN_USERNAME` | Admin email | `anmolkala.in@gmail.com` |
| `ADMIN_PASSWORD` | Initial admin password | `mnbvcxz12` |

---

## 7. Testing & Verification Checklist

- [x] Discreet circular **"A" icon** appears at the bottom of the footer.
- [x] Clicking the "A" icon opens the dedicated **Admin Login** page (`/admin/login`).
- [x] Logging in with `anmolkala.in@gmail.com` and `mnbvcxz12` opens the **Admin Dashboard**.
- [x] Admin can update their password via verification of the current password.
- [x] All 12 independent sections navigate cleanly on desktop and mobile.
- [x] Products preserve unique IDs (`AK-001` or UUID) upon renaming or editing.
- [x] Native device file picker opens when uploading photos and videos (zero manual image URL fields).
- [x] Changes persist across page refreshes.
- [x] All 174 original product photos and storefront pages remain completely functional.
