# document_service.py

import os
from typing import Dict, Any, List

from repository.document_repo import (
    create_document,
    update_document_status,
    link_statement_to_document,
    insert_upload_audit,
    save_extracted_text,
    insert_statement_transactions,
    save_document_password
)

from services.review_service import run_review_engine


# ==========================================================
# MAIN DOCUMENT PROCESSOR
# ==========================================================

def process_document(
    user_id: int,
    file_path: str,
    extracted_text: str,
    statement_id: int,
    extracted_transactions: List[Dict],
    password: str = None
) -> Dict[str, Any]:

    file_name = os.path.basename(file_path)

    # ------------------------------------------------------
    # 1️⃣ Create Document Entry
    # ------------------------------------------------------
    document_id = create_document(
        user_id=user_id,
        file_name=file_name,
        file_path=file_path,
        is_password_protected=bool(password)
    )

    # Log lifecycle (audit table only)
    insert_upload_audit(document_id, "UPLOADED")

    try:

        # ------------------------------------------------------
        # 2️⃣ Set Admin Status → UNDER_REVIEW
        # ------------------------------------------------------
        # Your ENUM allows only:
        # ACTIVE, UNDER_REVIEW, DISABLED, EXPERIMENTAL
        update_document_status(document_id, "UNDER_REVIEW")

        # ------------------------------------------------------
        # 3️⃣ Save Password (if provided)
        # ------------------------------------------------------
        if password:
            save_document_password(document_id, password)

        # ------------------------------------------------------
        # 4️⃣ Save Extracted Text
        # ------------------------------------------------------
        save_extracted_text(document_id, extracted_text)

        # ------------------------------------------------------
        # 5️⃣ Link Statement Format
        # ------------------------------------------------------
        link_statement_to_document(document_id, statement_id)

        # ------------------------------------------------------
        # 6️⃣ Store Extracted Transactions
        # ------------------------------------------------------
        insert_statement_transactions(
            document_id=document_id,
            statement_id=statement_id,
            transactions=extracted_transactions
        )

        # ------------------------------------------------------
        # 7️⃣ Run Review Engine (AI vs Code validation)
        # ------------------------------------------------------
        review_result = run_review_engine(
            statement_id=statement_id,
            file_path=file_path,
            extracted_text=extracted_text
        )

        # Log lifecycle completion (audit only)
        insert_upload_audit(document_id, "COMPLETED")

        # ------------------------------------------------------
        # 8️⃣ Return Result
        # ------------------------------------------------------
        return {
            "document_id": document_id,
            "review_result": review_result
        }

    except Exception as e:

        # ------------------------------------------------------
        # If Anything Fails → Disable Document
        # ------------------------------------------------------
        update_document_status(document_id, "DISABLED")
        insert_upload_audit(document_id, "FAILED", str(e))

        raise e