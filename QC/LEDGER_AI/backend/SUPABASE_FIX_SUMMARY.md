# Supabase Storage Fix - Summary

## Problem Identified
- Database has 6 documents with Supabase storage paths saved
- The `financial_document_uploads` bucket exists but is EMPTY
- PDFs cannot be fetched because files were never uploaded to Supabase Storage

## What Was Fixed

### 1. Backend PDF Fetching (✅ COMPLETE)
- `services/storage_service.py` - Downloads PDFs from Supabase Storage
  - Uses bucket: `financial_document_uploads`
  - Handles both local paths (backward compatibility) and Supabase paths
  - Downloads to temp file and returns local path

- `backend.py` - Updated `/api/document-pdf/{document_id}` endpoint
  - Now calls `get_pdf_local_path()` which downloads from Supabase if needed
  - Handles password-protected PDFs
  - Serves decrypted PDFs when needed

- `services/pdf_service.py` - Updated text extraction
  - Now downloads from Supabase before extracting text
  - Works transparently with both local and storage paths

### 2. What You Need to Do

**Your upload process is NOT uploading files to Supabase Storage.**

Current behavior:
- Files are saved to local temp directory
- Only the path is saved to database
- Files are never uploaded to Supabase

**Fix Option 1: Update Your Upload Code**

Use the helper function in `services/upload_helper.py`:

```python
from services.upload_helper import upload_pdf_to_supabase

# In your upload logic:
file_bytes = uploaded_file.read()

# Upload to Supabase Storage
storage_path = upload_pdf_to_supabase(
    file_bytes=file_bytes,
    user_id=str(user_id),
    original_filename=uploaded_file.name
)

# Save storage_path to database (not local path)
```

**Fix Option 2: Manual Upload via Supabase Dashboard**

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Go to Storage > `financial_document_uploads`
4. Upload files with exact paths from database:
   - `72fede0b-e1ae-4183-a785-86065edf4cc8/8f9c47bd4d88f515ad4e9c91.pdf`
   - `b4401c10-1c36-4550-ae52-e3fd3297e5bb/97d911fe32a80c842e1d6282.pdf`
   - etc.

## Testing

Once files are uploaded to Supabase Storage:

```bash
# Test the endpoint
curl http://localhost:8000/api/document-pdf/23

# Should download PDF from Supabase and serve it
```

## Files Modified
- ✅ `backend/services/storage_service.py` - Supabase download logic
- ✅ `backend/backend.py` - PDF endpoint updated
- ✅ `backend/services/pdf_service.py` - Text extraction updated
- ✅ `backend/requirements.txt` - Added `supabase` package
- ✅ `backend/services/upload_helper.py` - Upload helper created

## Next Steps
1. Update your upload code to use `upload_pdf_to_supabase()`
2. Test by uploading a new PDF
3. Verify it appears in Supabase Storage bucket
4. Verify you can fetch it via `/api/document-pdf/{id}`
