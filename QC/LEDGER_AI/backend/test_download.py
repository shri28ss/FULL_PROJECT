"""
Test: Try downloading a PDF that exists in the bucket using the service role key.
Picks the first document whose file_path matches a known bucket file.
"""
from db.connection import get_connection, get_cursor
from services.storage_service import download_pdf_from_storage, SUPABASE_SERVICE_ROLE_KEY
import os

print("Service role key set:", "YES" if SUPABASE_SERVICE_ROLE_KEY else "NO (will fail RLS)")

conn = get_connection()
cursor = get_cursor(conn)
cursor.execute("""
    SELECT document_id, file_name, file_path
    FROM documents
    WHERE file_path IS NOT NULL
      AND file_path != 'pending_upload'
      AND file_path NOT LIKE '/%'
      AND LENGTH(file_path) > 10
    ORDER BY document_id DESC
    LIMIT 20
""")
rows = cursor.fetchall()
cursor.close()
conn.close()

print(f"\nFound {len(rows)} documents with storage-style file_path:")
for row in rows:
    print(f"  doc#{row['document_id']:3d} | {row['file_path']}")

print("\n--- Testing downloads ---")
for row in rows[:5]:  # Test first 5
    fp = row["file_path"]
    print(f"\nDocID={row['document_id']} path={fp}")
    result = download_pdf_from_storage(fp)
    if result:
        size = os.path.getsize(result)
        print(f"  SUCCESS: {result} ({size} bytes)")
    else:
        print(f"  FAILED: could not download")
