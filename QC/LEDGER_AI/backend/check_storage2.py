import os
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client

key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
client = create_client(os.getenv("SUPABASE_URL"), key)

BUCKET = "financial_document_uploads"
folders = client.storage.from_(BUCKET).list("")
all_files = []
for f in folders:
    name = f.get("name", "")
    try:
        files = client.storage.from_(BUCKET).list(name)
        for fi in files:
            all_files.append(name + "/" + fi.get("name", ""))
    except Exception as e:
        pass

print("BUCKET_FILES_COUNT=" + str(len(all_files)))
for f in all_files:
    print("BUCKET:" + f)

from db.connection import get_connection, get_cursor
conn = get_connection()
cursor = get_cursor(conn)
cursor.execute("SELECT document_id, file_path FROM documents ORDER BY document_id")
rows = cursor.fetchall()
cursor.close()
conn.close()

print("DB_DOCS_COUNT=" + str(len(rows)))
for row in rows:
    fp = row["file_path"] or ""
    if not fp or fp == "pending_upload":
        tag = "NO_PATH"
    elif fp.startswith("/") or (len(fp) > 1 and fp[1] == ":"):
        tag = "LOCAL"
    elif fp in all_files:
        tag = "OK"
    else:
        tag = "MISSING"
    print("DB:" + str(row["document_id"]) + ":" + tag + ":" + fp)
