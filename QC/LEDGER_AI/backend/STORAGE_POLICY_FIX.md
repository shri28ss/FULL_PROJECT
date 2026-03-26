# URGENT: Supabase Storage Policy Fix

## Problem
Your `financial_document_uploads` bucket has Row Level Security (RLS) enabled, but no policies allow uploads.

Error: `new row violates row-level security policy`

## Solution

Go to Supabase Dashboard and add these policies:

### 1. Go to Storage Policies
1. Open https://supabase.com/dashboard
2. Select your project
3. Go to **Storage** > **Policies**
4. Select bucket: `financial_document_uploads`

### 2. Add Policy: Allow Public Uploads

Click "New Policy" and add:

**Policy Name:** Allow public uploads
**Policy Command:** INSERT
**Target Roles:** public, anon

**Policy Definition:**
```sql
true
```

OR if you want to restrict by user:
```sql
bucket_id = 'financial_document_uploads'
```

### 3. Add Policy: Allow Public Downloads

**Policy Name:** Allow public downloads
**Policy Command:** SELECT
**Target Roles:** public, anon

**Policy Definition:**
```sql
bucket_id = 'financial_document_uploads'
```

### 4. Alternative: Disable RLS (Quick Fix)

If you want to allow all access (not recommended for production):

1. Go to Storage > `financial_document_uploads`
2. Click "Edit bucket"
3. **Uncheck "Enable RLS"** or set bucket to **Public**

## After Fixing

Run this test:
```bash
cd backend
python test_upload.py
```

Should see: "Upload successful!"
