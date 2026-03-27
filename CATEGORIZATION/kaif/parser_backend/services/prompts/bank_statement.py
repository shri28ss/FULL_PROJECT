
import re

def build_prompt(identifier_json: dict, text_sample: str) -> str:
    """
    Optimized bank statement code generation prompt.
    Reduced from ~3500 to ~800 tokens while maintaining quality.
    """

    # ── Extract key fields from identifier_json ──────────────────────
    doc_family   = identifier_json.get("document_family", "BANK_ACCOUNT_STATEMENT")
    doc_subtype  = identifier_json.get("document_subtype", "")
    institution  = identifier_json.get("institution_name", "")
    table_headers = (identifier_json.get("identity_markers", {}).get("transaction_table_identity", {}).get("table_header_markers", []))

    return f"""
You are analyzing a bank statement to understand its structure and create a robust Python extraction function.

════════════════════════════════════════════
DOCUMENT METADATA
════════════════════════════════════════════

Document Family: {doc_family}
Document Subtype: {doc_subtype}
Institution: {institution}
Detected Headers: {', '.join(table_headers) if table_headers else 'None'}

════════════════════════════════════════════
SAMPLE TEXT (First ~30000 characters)
════════════════════════════════════════════

{text_sample}

════════════════════════════════════════════
YOUR TASK
════════════════════════════════════════════

Analyze the sample text above and identify:

1. **Transaction Block Location**
   - Where do transactions start in the document?
   - What markers/patterns indicate the beginning of transaction data?
   - Where do transactions end?

2. **Date Pattern Recognition**
   - What date format is used? (DD/MM/YYYY, MM-DD-YYYY, DD-MMM-YY, etc.)
   - Are dates in a fixed column position or variable?
   - How to reliably extract transaction dates?

3. **Column Structure**
   - Which columns exist in the transaction table?
   - What is the order of columns?
   - Are transactions single-line or multi-line entries?
   - How are description details spread across lines?

4. **Debit/Credit Identification**
   - How to distinguish debit vs credit amounts?
   - Are there separate columns, or symbols (-, +, Dr, Cr)?
   - Are debits in parentheses or marked differently?

5. **Balance Column**
   - Which column represents running balance?
   - Is it always present for each transaction?

6. **Multi-line Transaction Handling**
   - Do transaction descriptions span multiple lines?
   - How to detect continuation lines vs new transactions?
   - What patterns separate one transaction from the next?

════════════════════════════════════════════
OUTPUT REQUIREMENTS
════════════════════════════════════════════

Provide a complete, production-ready Python function with this EXACT signature:
```python
def extract_transactions(full_text: str) -> list[dict]:
    \"\"\"
    Extract transactions from bank statement text.
    
    Args:
        full_text: Complete extracted text from PDF
        
    Returns:
        List of transaction dictionaries in the format:
        [
          {{
            "date": "YYYY-MM-DD",
            "details": "<transaction description only, no dates/amounts/noise>",
            "debit": <float or null>,
            "credit": <float or null>,
            "balance": <float or null>,
            "confidence": <0.0 to 1.0>
          }}
        ]
    \"\"\"
    import re
    from datetime import datetime
    
    # Your implementation here
    pass
```

════════════════════════════════════════════
CODE REQUIREMENTS
════════════════════════════════════════════

✓ Use ONLY standard library (re, datetime, etc.) - no external dependencies
✓ Make the code generalizable to work with similar statement formats
✓ DO NOT hardcode specific values like account numbers or names
✓ Use pattern matching and structure detection, not exact text matching
✓ Handle edge cases: missing balances, multi-line descriptions, special characters
✓ Assign confidence scores:
  - 1.0: Clean extraction with all fields present
  - 0.8-0.9: Minor issues (missing balance, partial data)
  - 0.5-0.7: Ambiguous parsing or incomplete information
  - <0.5: Low confidence extraction
✓ Clean the "details" field: remove dates, amounts, extra whitespace
✓ Convert dates to YYYY-MM-DD format
✓ Return empty list if no transactions found
✓ Include helpful inline comments explaining the logic

════════════════════════════════════════════
EXPECTED OUTPUT FORMAT
════════════════════════════════════════════

First, provide a brief analysis (2-3 paragraphs) explaining:
- The statement structure you identified
- Date format and column layout
- How debit/credit/balance are distinguished
- Any quirks or special handling needed

Then provide the complete Python function.

Begin your analysis now.
"""


