"""
Test upload to verify Supabase Storage integration works
"""
from services.storage_service import get_supabase_client
import io

# Create a dummy PDF (just for testing)
dummy_pdf = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/Resources <<\n/Font <<\n/F1 4 0 R\n>>\n>>\n/MediaBox [0 0 612 792]\n/Contents 5 0 R\n>>\nendobj\n4 0 obj\n<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\nendobj\n5 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Test PDF) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000262 00000 n\n0000000341 00000 n\ntrailer\n<<\n/Size 6\n/Root 1 0 R\n>>\nstartxref\n433\n%%EOF"

client = get_supabase_client()

# Upload test file to the path from document 22
test_path = "b4401c10-1c36-4550-ae52-e3fd3297e5bb/97d911fe32a80c842e1d6282.pdf"

print(f"Uploading test PDF to: {test_path}")

try:
    result = client.storage.from_("financial_document_uploads").upload(
        path=test_path,
        file=dummy_pdf,
        file_options={"content-type": "application/pdf"}
    )
    print(f"✓ Upload successful!")
    print(f"Result: {result}")

    # Now test download
    print("\nTesting download...")
    from services.storage_service import get_pdf_local_path
    local_path = get_pdf_local_path(test_path)

    if local_path:
        print(f"✓ Download successful: {local_path}")
        print("\nNow try accessing: http://localhost:8000/api/document-pdf/22")
    else:
        print("✗ Download failed")

except Exception as e:
    print(f"✗ Upload failed: {e}")
