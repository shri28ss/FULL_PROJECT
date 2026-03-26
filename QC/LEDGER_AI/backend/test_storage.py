"""
Test script to verify Supabase Storage integration
"""
from services.storage_service import get_supabase_client, is_supabase_storage_path, get_pdf_local_path

def test_storage_connection():
    """Test if we can connect to Supabase"""
    try:
        client = get_supabase_client()
        print("[OK] Successfully connected to Supabase")
        return True
    except Exception as e:
        print(f"[FAIL] Failed to connect to Supabase: {e}")
        return False

def test_path_detection():
    """Test path detection logic"""
    print("\n--- Testing Path Detection ---")

    # Test local paths
    local_paths = [
        "/tmp/file.pdf",
        "C:\\Users\\file.pdf",
        "/home/user/file.pdf"
    ]

    for path in local_paths:
        result = is_supabase_storage_path(path)
        status = "[FAIL]" if result else "[OK]"
        print(f"{status} {path} -> Local: {not result}")

    # Test storage paths
    storage_paths = [
        "documents/user_1/file.pdf",
        "pdfs/statement.pdf",
        "bucket/path/to/file.pdf"
    ]

    for path in storage_paths:
        result = is_supabase_storage_path(path)
        status = "[OK]" if result else "[FAIL]"
        print(f"{status} {path} -> Storage: {result}")

def test_list_buckets():
    """List available storage buckets"""
    try:
        client = get_supabase_client()
        buckets = client.storage.list_buckets()
        print("\n--- Available Storage Buckets ---")
        for bucket in buckets:
            print(f"  - {bucket.name} (ID: {bucket.id})")
        return True
    except Exception as e:
        print(f"[FAIL] Failed to list buckets: {e}")
        return False

if __name__ == "__main__":
    print("=== Supabase Storage Test ===\n")

    # Test 1: Connection
    if not test_storage_connection():
        print("\n[WARNING] Cannot proceed without Supabase connection")
        exit(1)

    # Test 2: Path detection
    test_path_detection()

    # Test 3: List buckets
    test_list_buckets()

    print("\n=== Test Complete ===")
