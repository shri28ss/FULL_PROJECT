import os
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client

key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
print("Key type:", "service_role" if os.getenv("SUPABASE_SERVICE_ROLE_KEY") else "anon")
client = create_client(os.getenv("SUPABASE_URL"), key)

BUCKET = "financial_document_uploads"
folders = client.storage.from_(BUCKET).list("")
print("FOLDERS IN BUCKET:")
all_files = []
for f in folders:
    name = f.get("name", "")
    try:
        files = client.storage.from_(BUCKET).list(name)
        for fi in files:
            full = name + "/" + fi.get("name", "")
            all_files.append(full)
            print("  " + full)
    except Exception as e:
        print("  Error in", name, "->", e)

print("\nTotal bucket files:", len(all_files))

# Compare with DB
from db.connection import get_connection, get_cursor
conn = get_connection()
cursor = get_cursor(conn)
cursor.execute("SELECT document_id, file_name, file_path FROM documents ORDER BY document_id")
rows = cursor.fetchall()
cursor.close()
conn.close()

print("\nDB vs BUCKET comparison:")
ok = local = missing = no_path = 0
for row in rows:
    fp = row["file_path"] or ""
    if not fp or fp == "pending_upload":
        tag = "NO PATH"
        no_path += 1
    elif fp.startswith("/") or (len(fp) > 1 and fp[1] == ":"):
        tag = "LOCAL PATH"
        local += 1
    elif fp in all_files:
        tag = "OK"
        ok += 1
    else:
        tag = "MISSING"
        missing += 1
    print(f"  doc#{row['document_id']:3d} [{tag:<12}] {fp[:70]}")

print(f"\n--- SUMMARY ---")
print(f"  OK (exists in bucket)  : {ok}")
print(f"  Local/stale paths      : {local}")
print(f"  Missing from bucket    : {missing}")
print(f"  No path set            : {no_path}")
print(f"  Total docs             : {len(rows)}")
