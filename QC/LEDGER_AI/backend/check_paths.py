from db.connection import get_connection, get_cursor

conn = get_connection()
cursor = get_cursor(conn)
cursor.execute("SELECT document_id, user_id, file_name, file_path, status FROM documents ORDER BY document_id DESC LIMIT 15")
rows = cursor.fetchall()
cursor.close()
conn.close()

for row in rows:
    print("=" * 60)
    print("doc_id   :", row["document_id"])
    print("user_id  :", row["user_id"])
    print("file_name:", row["file_name"])
    print("file_path:", row["file_path"])
    print("status   :", row["status"])
