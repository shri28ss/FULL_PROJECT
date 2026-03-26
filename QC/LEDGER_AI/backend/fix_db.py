import sys
sys.path.insert(0, r"c:\Users\SHREE\UV_AI\LEDGER_AI\backend")
from db.connection import get_connection

sql = """
CREATE TABLE IF NOT EXISTS transaction_overrides (
    override_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    staging_transaction_id BIGINT       NOT NULL,
    field_name             VARCHAR(100) NOT NULL,
    ai_value               TEXT         NULL,
    user_value             TEXT         NULL,
    overridden_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (staging_transaction_id)
        REFERENCES ai_transactions_staging(staging_transaction_id) ON DELETE CASCADE
);
"""
try:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    print("SUCCESS CREATING TABLE")
except Exception as e:
    import traceback
    print("ERROR:")
    print(traceback.format_exc())
