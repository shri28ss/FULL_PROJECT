from db.connection import get_connection
import json
 
 
# ---------------------------------------------------------
# GET DOCUMENT
# ---------------------------------------------------------
def get_document(document_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True, buffered=True)
 
    cursor.execute("""
        SELECT * FROM documents
        WHERE document_id=%s
    """, (document_id,))
 
    doc = cursor.fetchone()
    cursor.close()
    conn.close()
    return doc
# ---------------------------------------------------------
# GET DOCUMENT PASSWORD
# ---------------------------------------------------------
def get_document_password(document_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True, buffered=True)
 
    cursor.execute("""
        SELECT encrypted_password
        FROM document_password
        WHERE document_id=%s
    """, (document_id,))
 
    row = cursor.fetchone()
    cursor.close()
    conn.close()
 
    return row["encrypted_password"] if row else None
 
# ---------------------------------------------------------
# DOCUMENT STATUS
# ---------------------------------------------------------
 
def update_document_status(document_id: int, status: str):
    conn = get_connection()
    cursor = conn.cursor(buffered=True)
    cursor.execute("""
        UPDATE documents
        SET status=%s
        WHERE document_id=%s
    """, (status, document_id))
    conn.commit()
    cursor.close()
    conn.close()
 
 
def update_processing_start(document_id: int):
    conn = get_connection()
    cursor = conn.cursor(buffered=True)
    cursor.execute("""
        UPDATE documents
        SET status='EXTRACTING_TEXT',
            processing_started_at=NOW()
        WHERE document_id=%s
    """, (document_id,))
    conn.commit()
    cursor.close()
    conn.close()
 
 
def update_processing_complete(document_id: int, parser_type: str):
    conn = get_connection()
    cursor = conn.cursor(buffered=True)
    cursor.execute("""
        UPDATE documents
        SET transaction_parsed_type=%s,
            processing_completed_at=NOW()
        WHERE document_id=%s
    """, (parser_type, document_id))
    conn.commit()
    cursor.close()
    conn.close()
 
 
# ---------------------------------------------------------
# AUDIT
# ---------------------------------------------------------
 
def insert_audit(document_id: int, status: str, error_message: str = None):
    conn = get_connection()
    cursor = conn.cursor(buffered=True)
    cursor.execute("""
        INSERT INTO document_upload_audit
        (document_id, status, error_message)
        VALUES (%s,%s,%s)
    """, (document_id, status, error_message))
    conn.commit()
    cursor.close()
    conn.close()
 
 
# ---------------------------------------------------------
# TEXT EXTRACTION
# ---------------------------------------------------------
 
def insert_text_extraction(document_id: int, extracted_text: str):
    conn = get_connection()
    cursor = conn.cursor(buffered=True)
    cursor.execute("""
        INSERT INTO document_text_extractions
        (document_id, extraction_method, extracted_text, extraction_status)
        VALUES (%s,'PDF_TEXT',%s,'SUCCESS')
    """, (document_id, extracted_text))
    conn.commit()
    cursor.close()
    conn.close()
 
def update_document_statement(document_id: int, statement_id: int):
    conn = get_connection()
    cursor = conn.cursor(buffered=True)
 
    cursor.execute("""
        UPDATE documents
        SET statement_id=%s
        WHERE document_id=%s
    """, (statement_id, document_id))
 
    conn.commit()
    cursor.close()
    conn.close()
 
# ---------------------------------------------------------
# STATEMENT STATUS
# ---------------------------------------------------------
 
def update_statement_status(statement_id: int, new_status: str):
    conn = get_connection()
    cursor = conn.cursor(buffered=True)
    cursor.execute("""
        UPDATE statement_categories
        SET status=%s
        WHERE statement_id=%s
    """, (new_status, statement_id))
    conn.commit()
    cursor.close()
    conn.close()
 
 
# ---------------------------------------------------------
# STAGING INSERT
# ---------------------------------------------------------
 
def insert_staging_transactions(
    document_id: int,
    user_id: int,
    code_txns: list,
    llm_txns: list,
    code_confidence: float,
    llm_confidence: float
):
    conn = get_connection()
    cursor = conn.cursor(buffered=True)
 
    # Insert CODE
    cursor.execute("""
        INSERT INTO ai_transactions_staging
        (document_id, user_id, transaction_json, parser_type, overall_confidence)
        VALUES (%s,%s,%s,'CODE',%s)
    """, (
        document_id,
        user_id,
        json.dumps(code_txns),
        code_confidence
    ))
 
    # Insert LLM
    cursor.execute("""
        INSERT INTO ai_transactions_staging
        (document_id, user_id, transaction_json, parser_type, overall_confidence)
        VALUES (%s,%s,%s,'LLM',%s)
    """, (
        document_id,
        user_id,
        json.dumps(llm_txns),
        llm_confidence
    ))
 
    conn.commit()
    cursor.close()
    conn.close()
 
 
# ---------------------------------------------------------
# FINAL APPROVAL INSERT
# ---------------------------------------------------------
 
def insert_uncategorized_transactions(
    document_id: int,
    user_id: int,
    statement_id: int,
    staging_transaction_id: int,
    transactions: list
):
    conn = get_connection()
    cursor = conn.cursor(buffered=True)
 
    for txn in transactions:
        cursor.execute("""
            INSERT INTO uncategorized_transactions
            (user_id, document_id, statement_id, staging_transaction_id,
             txn_date, debit, credit, balance, description, confidence)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            user_id,
            document_id,
            statement_id,
            staging_transaction_id,
            txn.get("date"),
            txn.get("debit"),
            txn.get("credit"),
            txn.get("balance"),
            txn.get("details"),
            txn.get("confidence")
        ))
 
    cursor.execute("""
        UPDATE documents
        SET status='POSTED'
        WHERE document_id=%s
    """, (document_id,))
 
    conn.commit()
    cursor.close()
    conn.close()
 
def get_review_transactions(document_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True, buffered=True)
 
    cursor.execute("""
        SELECT s.*, d.statement_id
        FROM ai_transactions_staging s
        JOIN documents d ON s.document_id = d.document_id
        WHERE s.document_id=%s
        AND s.parser_type = d.transaction_parsed_type
        LIMIT 1
    """, (document_id,))
 
    data = cursor.fetchone()
    cursor.close()
    conn.close()
    return data