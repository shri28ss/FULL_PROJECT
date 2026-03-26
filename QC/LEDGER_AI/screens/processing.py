# import streamlit as st
# from db.connection import get_connection
 
# def get_document(document_id):
#     conn = get_connection()
#     cursor = conn.cursor(dictionary=True)
#     cursor.execute("SELECT * FROM documents WHERE document_id=%s", (document_id,))
#     doc = cursor.fetchone()
#     cursor.close()
#     conn.close()
#     return doc
 
# def show_processing():
 
#     document_id = st.session_state.current_document
#     doc = get_document(document_id)
#     # ----------------------------------------------
#     # ACCOUNT DISPLAY SECTION
#     # ----------------------------------------------
 
#     if doc.get("account_id") is None:
#         st.warning("Account details not found. You can map this document later.")
 
#     else:
#         conn = get_connection()
#         cursor = conn.cursor(dictionary=True)
 
#         cursor.execute("""
#             SELECT a.account_name,
#                    ai.account_number_last4,
#                    ai.card_last4,
#                    ai.loan_account_no,
#                    ai.wallet_id,
#                    ai.institution_name
#             FROM accounts a
#             LEFT JOIN account_identifiers ai
#                 ON a.account_id = ai.account_id
#                 AND ai.is_primary = 1
#             WHERE a.account_id = %s
#             LIMIT 1
#         """, (doc["account_id"],))
 
#         account = cursor.fetchone()
#         cursor.close()
#         conn.close()
 
#         if account:
#             display_number = (
#                 account.get("account_number_last4") or
#                 account.get("card_last4") or
#                 account.get("loan_account_no") or
#                 account.get("wallet_id")
#             )
 
#             st.success(
#                 f"Account Matched: {account.get('institution_name') or account.get('account_name')} "
#                 f"(•••• {display_number[-4:] if display_number and len(display_number) >= 4 else display_number})"
#             )
#     st.title("Processing Status")
 
#     st.info(f"Current Status: {doc['status']}")
 
#     if doc["status"] == "AWAITING_REVIEW":
#         st.session_state.screen = "review"
#         st.rerun()
 
#     elif doc["status"] == "APPROVE":
#         st.success("Transactions Posted Successfully")