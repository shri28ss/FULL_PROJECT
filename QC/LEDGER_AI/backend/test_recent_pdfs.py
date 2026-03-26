import os
from db.connection import get_connection, get_cursor
from services.storage_service import download_pdf_from_storage

def main():
    conn = get_connection()
    cursor = get_cursor(conn)
    cursor.execute('''
        SELECT document_id, file_path 
        FROM documents 
        WHERE file_path IS NOT NULL AND file_path NOT LIKE '/%' AND file_path != 'pending_upload'
        ORDER BY document_id DESC 
        LIMIT 15
    ''')
    rows = cursor.fetchall()
    
    print("Checking recent documents for PDFs in storage...")
    found_any = False
    
    for row in rows:
        doc_id = row['document_id']
        fp = row['file_path']
        try:
            res = download_pdf_from_storage(fp)
            if res and os.path.exists(res):
                print(f"Document ID {doc_id} -> SUCCESS! The PDF exists and can be viewed.")
                found_any = True
            else:
                print(f"Document ID {doc_id} -> NO PDF (404 Not Found in bucket)")
        except Exception as e:
            print(f"Document ID {doc_id} -> ERROR: {e}")
            
    if not found_any:
        print("\nCONCLUSION: None of the last 15 documents have a PDF physically saved in the Supabase bucket.")
        print("Your friend needs to upload a new document NOW for it to be visible.")
    else:
        print("\nCONCLUSION: Some documents have PDFs! Click the SUCCESS document IDs in your panel to see them.")

if __name__ == "__main__":
    main()
