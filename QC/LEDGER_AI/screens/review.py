# import streamlit as st
# import json
# from db.connection import get_connection
 
# def show_review():
 
#     document_id = st.session_state.current_document
#     # ----------------------------------------------
#     # ACCOUNT DISPLAY SECTION
#     # ----------------------------------------------
 
#     conn = get_connection()
#     cursor = conn.cursor(dictionary=True)
 
#     cursor.execute("""
#         SELECT d.account_id,
#                a.account_name,
#                ai.account_number_last4,
#                ai.card_last4,
#                ai.loan_account_no,
#                ai.wallet_id,
#                ai.institution_name
#         FROM documents d
#         LEFT JOIN accounts a ON d.account_id = a.account_id
#         LEFT JOIN account_identifiers ai
#             ON a.account_id = ai.account_id
#             AND ai.is_primary = 1
#         WHERE d.document_id = %s
#         LIMIT 1
#     """, (document_id,))
 
#     account = cursor.fetchone()
#     cursor.close()
#     conn.close()
 
#     if not account or account.get("account_id") is None:
#         st.warning("⚠ Account details not found. You can map this document later.")
#     else:
#         display_number = (
#             account.get("account_number_last4") or
#             account.get("card_last4") or
#             account.get("loan_account_no") or
#             account.get("wallet_id")
#         )
 
#         st.success(
#             f"✅ Account Matched: {account.get('institution_name') or account.get('account_name')} "
#             f"(•••• {display_number[-4:] if display_number and len(display_number) >= 4 else display_number})"
#         )
#     conn = get_connection()
#     cursor = conn.cursor(dictionary=True)
 
#     cursor.execute("""
#     SELECT s.*, d.statement_id
#     FROM ai_transactions_staging s
#     JOIN documents d ON s.document_id = d.document_id
#     WHERE s.document_id=%s
#     AND s.parser_type = d.transaction_parsed_type
#     LIMIT 1
#     """, (document_id,))
 
#     staging = cursor.fetchone()
#     cursor.close()
#     conn.close()
 
#     transactions = json.loads(staging["transaction_json"])
 
#     st.title("Review Transactions")
 
#     st.dataframe(transactions, use_container_width=True)
 
#     if st.button("Submit"):
 
#         conn = get_connection()
#         cursor = conn.cursor()
 
#         for txn in transactions:
#             cursor.execute("""
#                 INSERT INTO uncategorized_transactions
#                 (user_id, document_id, statement_id, staging_transaction_id,
#                  txn_date, debit, credit, balance, description, confidence)
#                 VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
#             """, (
#                 st.session_state.user_id,
#                 document_id,
#                 staging["statement_id"],
#                 staging["staging_transaction_id"],
#                 txn["date"],
#                 txn.get("debit"),
#                 txn.get("credit"),
#                 txn.get("balance"),
#                 txn.get("details"),
#                 txn.get("confidence")
#             ))
 
#         cursor.execute("""
#             UPDATE documents
#             SET status='APPROVE'
#             WHERE document_id=%s
#         """, (document_id,))
 
#         conn.commit()
#         cursor.close()
#         conn.close()
 
#         st.success("Transactions Posted")
#         st.session_state.screen = "upload"
#         st.rerun()