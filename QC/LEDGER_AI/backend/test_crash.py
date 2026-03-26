import os
import sys

# ensure we import from the user's backend correctly
sys.path.insert(0, r"c:\Users\SHREE\UV_AI\LEDGER_AI\backend")

from backend import improve_code, ImproveCodeRequest
import traceback

try:
    req = ImproveCodeRequest(reconciliation={"summary": {}}, remarks={}, accepted_ids=[])
    res = improve_code(3, req)
    print("SUCCESS")
except Exception as e:
    print("CRASH TRACEBACK:")
    print(traceback.format_exc())
