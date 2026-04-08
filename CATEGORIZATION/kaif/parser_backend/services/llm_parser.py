"""
services/llm_parser.py
──────────────────────
STEP 4 METHOD 2 — Direct LLM transaction extraction.

Uses Gemini (same key as identifier_service) with page-wise chunking.

Why chunking:
  - Sending the full document in one call risks response truncation mid-JSON
    on large statements, causing extract_json_from_response to return [].
  - Gemini 2.5 Flash supports up to 65k output tokens so truncation per-chunk
    is extremely unlikely even for dense statements.
"""

import re
import json
import logging

from google import genai
from google.genai import types
from config import GEMINI_API_KEY, LLM_PARSER_MODEL
from services.llm_retry import call_with_retry

client = genai.Client(api_key=GEMINI_API_KEY)
logger = logging.getLogger("ledgerai.llm_parser")

# Pages per Gemini call. 10 pages ≈ 3000–5000 input tokens — well within limits.
# Gemini handles the output side fine (65k token output limit).
_CHUNK_SIZE = 10


def parse_with_llm(full_text: str, identifier_json: dict) -> str:
    """
    Split full_text into page chunks, extract transactions per chunk via Gemini,
    merge all results and return as a JSON array string.

    Caller contract is unchanged: returns a raw string that
    extract_json_from_response(response) can parse into a list.
    """
    doc_family  = identifier_json.get("document_family", "BANK_ACCOUNT_STATEMENT")
    doc_subtype = identifier_json.get("document_subtype", "")
    institution = identifier_json.get("institution_name", "Unknown")

    # ── Split full_text into per-page blocks ──────────────────────────────────
    # Uses the same ={80} page separator that processing_engine produces.
    pages = [
        block.strip()
        for block in re.split(r'={80}', full_text)
        if block.strip() and not re.fullmatch(r'\s*PAGE\s+\d+\s*', block.strip(), re.IGNORECASE)
    ]
    if not pages:
        pages = [full_text]

    total_pages = len(pages)
    logger.info(
        "LLM parse start: family=%s institution=%s pages=%d chunk_size=%d",
        doc_family, institution, total_pages, _CHUNK_SIZE,
    )

    # ── Process in chunks ─────────────────────────────────────────────────────
    all_txns = []

    for chunk_start in range(0, total_pages, _CHUNK_SIZE):
        chunk_pages = pages[chunk_start: chunk_start + _CHUNK_SIZE]
        chunk_end   = chunk_start + len(chunk_pages)
        chunk_text  = "\n\n".join(chunk_pages)

        logger.info(
            "LLM chunk pages %d–%d of %d (text_len=%d)",
            chunk_start + 1, chunk_end, total_pages, len(chunk_text),
        )

        try:
            raw_response = _parse_chunk(
                chunk_text=chunk_text,
                doc_family=doc_family,
                doc_subtype=doc_subtype,
                institution=institution,
            )
            chunk_txns = _safe_parse_json(raw_response, chunk_start + 1, chunk_end)
            all_txns.extend(chunk_txns)
            logger.info(
                "LLM chunk pages %d–%d: extracted %d transactions (running total=%d)",
                chunk_start + 1, chunk_end, len(chunk_txns), len(all_txns),
            )
        except Exception as e:
            logger.error(
                "LLM chunk pages %d–%d FAILED: %s — skipping chunk",
                chunk_start + 1, chunk_end, e,
            )

    logger.info(
        "LLM parse complete: %d total transactions across %d pages",
        len(all_txns), total_pages,
    )

    # Return as JSON string — caller (processing_engine) passes this to
    # extract_json_from_response which expects a string, not a list.
    return json.dumps(all_txns)


def parse_with_vision(pdf_bytes: bytes, identifier_json: dict, note: str = None) -> str:
    """
    Extract transactions directly using Gemini Vision (multimodal) by sending
     the PDF bytes. Good for scanned or image-heavy PDFs.
    """
    doc_family  = identifier_json.get("document_family", "BANK_ACCOUNT_STATEMENT")
    doc_subtype = identifier_json.get("document_subtype", "")
    institution = identifier_json.get("institution_name", "Unknown")

    prompt = f"""
You are a financial data extraction engine with COMPUTER VISION capabilities.

Extract ALL transaction entries from the provided PDF document. 
The document might be a scan or have complex layout — use your vision capabilities to accurately read every row.

════════════════════════════════════════════
DOCUMENT INFO
════════════════════════════════════════════
Document Family: {doc_family}
Document Subtype: {doc_subtype}
Institution: {institution}
{f"USER NOTE: {note}" if note else ""}

════════════════════════════════════════════
RULES
════════════════════════════════════════════

1. Extract EVERY transaction row. Look for dates and amounts.
2. DETAILS field must contain ONLY the transaction description. 
   Clean up any noise like page numbers or header fragments.
3. Handle Indian number formats (1,00,000.00).
4. Normalize dates to YYYY-MM-DD.
5. DEBIT/CREDIT: Every transaction MUST have either debit or credit filled.

════════════════════════════════════════════
OUTPUT FORMAT (JSON ARRAY)
════════════════════════════════════════════

[
  {{
    "date": "YYYY-MM-DD",
    "details": "<transaction description only>",
    "debit": <float or null>,
    "credit": <float or null>,
    "balance": <float or null>,
    "confidence": <0.0 to 1.0>
  }}
]

Return ONLY the JSON array. No markdown. No explanation.
"""

    logger.info("Vision extraction starting for %s (note=%s)", institution, "YES" if note else "NO")
    
    try:
        response = call_with_retry(
            client, LLM_PARSER_MODEL, 
            [
                types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                prompt
            ],
            config={"temperature": 0}
        )
        return response.text.strip()
    except Exception as e:
        logger.error("Vision extraction failed: %s", e)
        raise


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _parse_chunk(
    chunk_text: str,
    doc_family: str,
    doc_subtype: str,
    institution: str,
) -> str:
    """
    Send a single page chunk to Gemini and return the raw response text.
    Uses call_with_retry (same as identifier_service) for resilience.
    """
    prompt = f"""
You are a financial data extraction engine.

Extract ALL transaction entries from the provided document text.

════════════════════════════════════════════
DOCUMENT INFO
════════════════════════════════════════════
Document Family: {doc_family}
Document Subtype: {doc_subtype}
Institution: {institution}

════════════════════════════════════════════
RULES
════════════════════════════════════════════

1. Extract EVERY transaction row. A transaction starts with a date.
2. SKIP these entirely — they are NOT transactions:
   - Headers (Date, Particulars, Debit, Credit, Balance)
   - Footers (Page numbers, disclaimers, generated on...)
   - Summary rows (Opening Balance, Closing Balance, Total Debit/Credit)
   - Account info (Branch, IFSC, MICR, Account Number)
3. DETAILS field must contain ONLY the transaction narration/description:
   - Do NOT include dates, amounts, page numbers, or header text in details.
   - Do NOT include footer text, branch info, or account numbers in details.
   - Example GOOD: "NEFT CR ACME CORP SALARY"
   - Example BAD: "01/01/2025 NEFT CR ACME CORP 50000.00 Page 1 of 3"
4. Handle Indian number formats (1,00,000.00).
5. Normalize dates to YYYY-MM-DD.
6. DEBIT/CREDIT: Every transaction MUST have either debit or credit filled (not both None).
   - If running balance increases, the amount is credit.
   - If running balance decreases, the amount is debit.
   - If column headers say Withdrawal/Debit use those.
   - If column headers say Deposit/Credit use those.

════════════════════════════════════════════
OUTPUT FORMAT (JSON ARRAY)
════════════════════════════════════════════

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

════════════════════════════════════════════
DOCUMENT TEXT
════════════════════════════════════════════

{chunk_text}

════════════════════════════════════════════
Return ONLY the JSON array. No markdown. No explanation.
"""

    response = call_with_retry(
        client, LLM_PARSER_MODEL, prompt,
        config={"temperature": 0},
    )
    return response.text.strip()


def _safe_parse_json(response: str, page_from: int, page_to: int) -> list:
    """
    Parse a JSON array out of the raw Gemini response for a chunk.
    Returns [] on any failure — never raises.
    """
    cleaned = response.replace("```json", "").replace("```", "").strip()
    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(
                "LLM chunk pages %d–%d: JSON parse failed (%s). Preview: %s",
                page_from, page_to, e, cleaned[:300],
            )
            return []
    logger.warning(
        "LLM chunk pages %d–%d: no JSON array found in response. Preview: %s",
        page_from, page_to, cleaned[:300],
    )
    return []