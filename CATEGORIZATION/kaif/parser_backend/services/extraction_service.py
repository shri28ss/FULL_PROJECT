"""
services/extraction_service.py
──────────────────────────────
STEP 4 — Generate extraction code via LLM (Claude/OpenRouter/9router)
and execute it safely against document text.

This module is the thin orchestrator. All document-family-specific
prompts live in services/prompts/*.py.
"""

import re
import logging
from typing import List, Dict, Any

from services.code_gen_client import get_code_gen_client
from services.prompts import get_prompt
from services.code_sandbox import execute_extraction_code, validate_code, clean_llm_code

logger = logging.getLogger("ledgerai.extraction_service")


# ═══════════════════════════════════════════════════════════
# GENERATE EXTRACTION CODE VIA LLM
# ═══════════════════════════════════════════════════════════

def generate_extraction_logic_llm(
    identifier_json: dict,
    text_sample: str,
) -> str:
    """
    Generates extraction code using the family-specific prompt from services/prompts/.
    Uses Claude (via Anthropic/OpenRouter/9router) for better code quality.
    Returns validated Python code string containing extract_transactions().
    """
    document_family = identifier_json.get("document_family", "BANK_ACCOUNT_STATEMENT")

    prompt = get_prompt(document_family, identifier_json, text_sample)

    logger.info(
        "Generating extraction code: family=%s prompt_len=%d",
        document_family, len(prompt),
    )

    # Get the configured code generation client (Claude via Anthropic/OpenRouter/9router)
    code_gen_client = get_code_gen_client()

    # Generate code with retry logic built into the client
    content = code_gen_client.generate(prompt, max_retries=3)

    if not content:
        raise ValueError("LLM returned empty extraction code.")

    raw_output = _strip_markdown(content)

    # Validate AST before returning — reject dangerous code immediately
    validation_error = validate_code(raw_output)
    if validation_error:
        raise ValueError(f"Generated code failed security validation: {validation_error}")

    logger.info("Generated + validated code: %d chars.", len(raw_output))
    return raw_output


def refine_extraction_logic_llm(
    current_logic: str,
    user_feedback: str,
    text_sample: str,
) -> str:
    """
    Takes existing extraction code and user feedback, and uses LLM to 'fix' or 'refine' it.
    This is used during retries when a user provides specific notes about errors.
    """
    logger.info("Refining extraction logic based on user feedback: %s", user_feedback)

    prompt = f"""
You are an expert Python data engineer. You are fixing a broken financial statement parser.

════════════════════════════════════════════
USER FEEDBACK: THE BUG REPORT
════════════════════════════════════════════
{user_feedback}

════════════════════════════════════════════
THE CURRENT (FAILING) CODE
════════════════════════════════════════════
{current_logic}

════════════════════════════════════════════
DOCUMENT TEXT (RAW SAMPLE)
════════════════════════════════════════════
{text_sample[:25000]}

════════════════════════════════════════════
YOUR MISSION: FIX THE PATTERN
════════════════════════════════════════════
Rewrite the `extract_transactions` function to be a state-based processor.

1. **Transaction Starter**: A transaction ALWAYS starts with a date pattern (e.g., DD/MM/YY). 
2. **Multi-line Narration**: Once a transaction is detected, keep accumulating all text until NOTHING remains or the NEXT transaction date is found. Do NOT strip narration after the first line.
3. **Column Logic**: 
   - Identify the 'Withdrawal' and 'Deposit' columns correctly. 
   - Skip 'Chq/Ref No' and 'Value Date' columns—these are noise.
   - If the logic is capturing 03 or 21 from a date like 03/07/21 into an amount field, YOUR REGEX IS WRONG. Correct it.
4. **Data Cleaning**: 
   - Strip 'Chq./Ref.No.' digit strings from the 'details' field. 
   - Details must only contain the narration.
5. **Output Schema**: Return a list of dicts with:
   {{
     "date": "YYYY-MM-DD",
     "details": str,
     "debit": float|None,
     "credit": float|None,
     "balance": float|None,
     "confidence": float
   }}
6. **Generality**: Write code that handles the entire format dynamically. Do not hard-code row numbers. 

Return ONLY the code block. No explanation. 
"""


    code_gen_client = get_code_gen_client()
    content = code_gen_client.generate(prompt, max_retries=2)

    if not content:
        raise ValueError("LLM returned empty refinement.")

    fixed_code = _strip_markdown(content)
    
    # Validate
    val_err = validate_code(fixed_code)
    if val_err:
        raise ValueError(f"Refined code failed security validation: {val_err}")

    return fixed_code



# ═══════════════════════════════════════════════════════════
# EXECUTE EXTRACTION CODE
# ═══════════════════════════════════════════════════════════

def extract_transactions_using_logic(
    full_text: str,
    extraction_code: str,
) -> List[Dict]:
    """
    Execute LLM-generated Python code safely via code_sandbox,
    Returns cleaned transaction list.
    """
    try:
        # Gap 3 fix: use code_sandbox (AST-validated exec) not raw exec
        raw_transactions = execute_extraction_code(extraction_code, full_text)

        if not isinstance(raw_transactions, list):
            raise ValueError(
                f"Extraction returned {type(raw_transactions)}, expected List[Dict]."
            )
        
        logger.info("Code extraction success: %d transactions.", len(raw_transactions))
        return raw_transactions

    except Exception as e:
        logger.error("Code extraction failed: %s", e)
        raise RuntimeError(f"LLM extraction execution failed: {e}")


# ═══════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════

def _strip_markdown(content: str) -> str:
    """
    Extract only the Python function from LLM output.

    Handles three output shapes:
      1. Wrapped in ```python ... ``` fences
      2. Step 1 analysis prose followed by bare function (two-step prompt output)
      3. Bare function only (old prompt style)

    In all cases returns only the text starting from
    'def extract_transactions' to end of output.
    """
    raw = content.strip()

    # Case 1 — markdown fences present: pull the block containing the function
    if "```" in raw:
        parts = raw.split("```")
        for part in parts:
            if "def extract_transactions" in part:
                raw = part.strip()
                if raw.lower().startswith("python"):
                    raw = raw[6:].strip()
                break

    # Cases 2 & 3 — find where the function starts and discard everything before it
    # This handles Step 1 prose sitting above the function
    fn_marker = "def extract_transactions"
    idx = raw.find(fn_marker)
    if idx > 0:
        # Content before function (Step 1 analysis) — strip it
        raw = raw[idx:]
    elif idx == -1:
        # Function not found — return as-is and let exec() raise a clear error
        logger.warning("_strip_markdown: 'def extract_transactions' not found in LLM output.")

    return raw.strip()