from db.connection import get_client
import json

sb = get_client()

# doc_id = 143
doc_id = 143
print(f"--- Doc {doc_id} staged transactions ---")
res = sb.table('ai_transactions_staging').select('transaction_json, parser_type').eq('document_id', doc_id).execute()
for row in res.data:
    print(f"Parser: {row['parser_type']}")
    txns = row['transaction_json']
    if isinstance(txns, str): txns = json.loads(txns)
    for t in txns:
        print(f"  {t}")

# Also check account 5936 history
account_id = 5936
print(f"\n--- Account {account_id} history (uncat) ---")
res = sb.table('uncategorized_transactions').select('txn_date, details, debit, credit').eq('account_id', account_id).execute()
for r in res.data:
    print(f"  {r}")

print(f"\n--- Account {account_id} history (ledger) ---")
res = sb.table('transactions').select('transaction_date, details, amount').eq('base_account_id', account_id).execute()
for r in res.data:
    print(f"  {r}")
