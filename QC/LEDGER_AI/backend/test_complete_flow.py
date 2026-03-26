"""
Test script to verify the complete Supabase Storage integration
Run this after uploading a PDF to test the full flow
"""
from services.storage_service import get_supabase_client, get_pdf_local_path
from db.connection import get_connection, get_cursor

def test_bucket_access():
    """Test if we can access the bucket"""
    print("=== Testing Bucket Access ===")
    try:
        client = get_supabase_client()
        files = client.storage.from_('financial_document_uploads').list()
        print(f"[OK] Bucket accessible. Files found: {len(files)}")

        if files:
            print("\nFiles in bucket:")
            for f in files[:10]:
                print(f"  - {f['name']}")
        else:
            print("\n[WARNING] Bucket is empty. Upload a PDF first.")

        return len(files) > 0
    except Exception as e:
        print(f"[FAIL] Cannot access bucket: {e}")
        return False

def test_pdf_download():
    """Test downloading a PDF from storage"""
    print("\n=== Testing PDF Download ===")

    # Get a document with storage path
    conn = get_connection()
    cursor = get_cursor(conn)
    cursor.execute("""
        SELECT document_id, file_name, file_path
        FROM documents
        WHERE file_path IS NOT NULL
        AND file_path NOT LIKE '/%'
        AND file_path NOT LIKE '_:%'
        ORDER BY document_id DESC
        LIMIT 1
    """)
    doc = cursor.fetchone()
    cursor.close()
    conn.close()

    if not doc:
        print("[SKIP] No documents with storage paths found")
        return False

    print(f"Testing with Document ID: {doc['document_id']}")
    print(f"Storage path: {doc['file_path']}")

    try:
        local_path = get_pdf_local_path(doc['file_path'])
        if local_path:
            print(f"[OK] Successfully downloaded to: {local_path}")

            # Check file size
            import os
            size = os.path.getsize(local_path)
            print(f"[OK] File size: {size} bytes")
            return True
        else:
            print("[FAIL] Could not download PDF")
            return False
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False

def test_api_endpoint():
    """Test the API endpoint"""
    print("\n=== Testing API Endpoint ===")
    print("To test the API endpoint, run:")
    print("  curl http://localhost:8000/api/document-pdf/23")
    print("\nOr open in browser:")
    print("  http://localhost:8000/api/document-pdf/23")

if __name__ == "__main__":
    print("=" * 50)
    print("Supabase Storage Integration Test")
    print("=" * 50)
    print()

    has_files = test_bucket_access()

    if has_files:
        test_pdf_download()
    else:
        print("\n[ACTION REQUIRED]")
        print("Upload PDFs to Supabase Storage bucket 'financial_document_uploads'")
        print("Use the upload_helper.py function in your upload code.")

    test_api_endpoint()

    print("\n" + "=" * 50)
    print("Test Complete")
    print("=" * 50)
