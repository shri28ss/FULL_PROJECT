"""
services/identifier_service.py
──────────────────────────────
Document identification — uses call_llm() which has automatic fallback
through Gemini direct → Gemini via OpenRouter → Claude Haiku via OpenRouter.
"""

import re
import json
import logging
from typing import Dict, List, Optional

from config import CLASSIFIER_MODEL
from services.llm_provider import call_llm   # ← replaces direct Gemini + client
from repository.statement_category_repo import (
    get_all_matchable_formats,
    insert_statement_category,
)

logger = logging.getLogger("ledgerai.identifier_service")


# ════════════════════════════════════════════════════════════
# INSTITUTION NAME NORMALISATION  [UNTOUCHED]
# ════════════════════════════════════════════════════════════

_LEGAL_SUFFIX_RE = re.compile(
    r"\s*,?\s*\b(limited|ltd\.?|pvt\.?|private)\s*$",
    re.IGNORECASE,
)


def normalise_institution_name(raw: str) -> str:
    if not raw or not raw.strip():
        return "UNKNOWN"
    name = raw.strip()
    prev = None
    while prev != name:
        prev = name
        name = _LEGAL_SUFFIX_RE.sub("", name).strip().rstrip(",").strip()
    return name.upper()


# ════════════════════════════════════════════════════════════
# FIRST N PAGES EXTRACTION
# ════════════════════════════════════════════════════════════

def _get_first_pages_text(pages: List[str], max_pages: int = 3) -> str:
    chunks = []
    for i, page_text in enumerate(pages[:max_pages], start=1):
        text = page_text.strip()
        if text:
            chunks.append(f"--- PAGE {i} ---\n{text}")
    return "\n\n".join(chunks)


# ════════════════════════════════════════════════════════════
# FORMAT EXISTENCE CHECK  [UNTOUCHED logic]
# ════════════════════════════════════════════════════════════

def _get_table_columns_fingerprint(identifier_json: dict) -> str:
    headers = (
        identifier_json
        .get("identity_markers", {})
        .get("transaction_table_identity", {})
        .get("table_header_markers", [])
    )
    normalised = sorted(
        re.sub(r"\s+", "", h.lower())
        for h in headers
        if isinstance(h, str) and h.strip()
    )
    return "|".join(normalised)


def _format_name_token_similarity(name_a: str, name_b: str) -> float:
    def _tokenise(name: str) -> set:
        s = re.sub(r"[_\s]v\d+$", "", name.strip(), flags=re.IGNORECASE)
        return set(re.split(r"[_\s]+", s.lower())) - {""}

    tokens_a = _tokenise(name_a)
    tokens_b = _tokenise(name_b)
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union        = tokens_a | tokens_b
    return len(intersection) / len(union)


def check_format_exists(
    new_identifier_json: dict,
    format_name_similarity_threshold: float = 0.65,
) -> Optional[Dict]:
    raw_inst      = new_identifier_json.get("institution_name") or ""
    new_norm_inst = normalise_institution_name(raw_inst)

    if not new_norm_inst or new_norm_inst == "UNKNOWN":
        logger.debug("check_format_exists: institution unknown — skip")
        return None

    new_col_fp = _get_table_columns_fingerprint(new_identifier_json)
    if not new_col_fp:
        logger.debug("check_format_exists: no table columns in new doc — skip")
        return None

    new_format_name = new_identifier_json.get("id") or ""

    try:
        all_rows: List[Dict] = get_all_matchable_formats()
    except Exception as exc:
        logger.warning("check_format_exists: DB fetch failed — %s", exc)
        return None

    for row in all_rows:
        stored_raw_inst  = row.get("institution_name") or ""
        stored_norm_inst = normalise_institution_name(stored_raw_inst)
        if stored_norm_inst != new_norm_inst:
            continue

        stored_format_name = row.get("format_name") or ""
        sim = _format_name_token_similarity(stored_format_name, new_format_name)
        if sim < format_name_similarity_threshold:
            logger.debug(
                "check_format_exists: fmt_sim=%.2f < %.2f ('%s' vs '%s') — skip",
                sim, format_name_similarity_threshold, stored_format_name, new_format_name,
            )
            continue

        stored_col_fp = _get_table_columns_fingerprint(
            row.get("identifier_json") or {}
        )
        if stored_col_fp != new_col_fp:
            logger.debug(
                "check_format_exists: col_fp mismatch ('%s' vs '%s') — skip",
                stored_col_fp, new_col_fp,
            )
            continue

        logger.info(
            "check_format_exists: MATCH — institution=%s fmt_sim=%.2f col_fp=%s",
            new_norm_inst, sim, new_col_fp,
        )
        return row

    return None


# ════════════════════════════════════════════════════════════
# DOCUMENT CLASSIFICATION
# ════════════════════════════════════════════════════════════

def classify_document_llm(pages: List[str]) -> dict:
    """
    Identify the document family, institution, and structural markers
    by sending the first few pages to the LLM.

    Uses call_llm() so Gemini overload triggers automatic fallback.
    """
    first_pages_text = _get_first_pages_text(pages, max_pages=3)

    prompt = f"""
You are a financial document analysis expert specializing in Indian financial statements.

Analyze the provided financial statement text and generate a comprehensive identification JSON
that can be used to reliably identify this specific document format in the future.

══════════════════════════════════════════════════════════════════════════════
TASK: Generate Document Identification Markers
══════════════════════════════════════════════════════════════════════════════

Study the document carefully and extract ALL identifying characteristics.

DOCUMENT FAMILIES (pick exactly one):
- BANK_ACCOUNT_STATEMENT
- CREDIT_CARD_STATEMENT
- LOAN_STATEMENT
- WALLET_STATEMENT
- INVESTMENT_STATEMENT
- DEMAT_STATEMENT
- TAX_LEDGER_STATEMENT
- PAYMENT_GATEWAY_SETTLEMENT
- OVERDRAFT_CASH_CREDIT_STATEMENT

══════════════════════════════════════════════════════════════════════════════
REQUIRED JSON STRUCTURE
══════════════════════════════════════════════════════════════════════════════

{{
  "id": "DOCUMENT_FAMILY_INSTITUTION_SUBTYPE_V1",
  "document_family": "<one of the families above>",
  "document_subtype": "<specific variant or empty string>",
  "institution_name": "<bank/institution name without Ltd/Pvt>",
  "confidence_score": <0.0 to 1.0>,
  "parsing_hints": {{
    "layout_type": "SINGLE_COLUMN or MULTI_COLUMN",
    "summary_section_labels": ["Opening Balance", "Closing Balance"],
    "transaction_boundary_signals": ["DATE"],
    "ref_no_pattern": "<regex or null>",
    "page_break_pattern": "<regex or null>",
    "details_strip_patterns": [],
    "known_summary_amounts": []
  }},
  "identity_markers": {{
    "issuer_identity": {{
      "header_markers": ["text that appears in the document header"],
      "regulatory_identifiers": {{
        "cin": {{ "rule": "regex", "pattern": "<regex or null>" }},
        "ifsc": {{ "rule": "regex", "pattern": "<regex or null>" }},
        "swift": {{ "rule": "regex", "pattern": "<regex or null>" }},
        "gstin": {{ "rule": "regex", "pattern": "<regex or null>" }}
      }}
    }},
    "account_identity": {{
      "account_number": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "customer_id": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "card_number": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "loan_account": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "folio_number": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "bo_id": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "dp_id": {{ "rule": "regex", "pattern": "<regex or null>" }}
    }},
    "transaction_table_identity": {{
      "table_header_markers": ["Column1", "Column2", "Column3"],
      "minimum_column_count": 4,
      "presence_of_running_balance": true,
      "debit_credit_style": true
    }},
    "financial_summary_identity": {{
      "total_outstanding": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "minimum_due": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "emi_amount": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "credit_limit": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "drawing_power": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "portfolio_value": {{ "rule": "regex", "pattern": "<regex or null>" }},
      "total_tax": {{ "rule": "regex", "pattern": "<regex or null>" }}
    }},
    "footer_identity": {{
      "footer_markers": ["footer text pattern 1", "footer text pattern 2"]
    }}
  }}
}}

══════════════════════════════════════════════════════════════════════════════
CRITICAL OUTPUT RULES
══════════════════════════════════════════════════════════════════════════════
✓ Return ONLY the JSON object
✓ No markdown code blocks (no ```json```)
✓ No explanations before or after
✓ No comments in the JSON
✓ All regex patterns must use double backslashes (\\\\d not \\d)
✓ Set null for fields not applicable to the document type
✓ confidence_score must be between 0.0 and 1.0

BEGIN ANALYSIS OF THE PROVIDED FINANCIAL STATEMENT NOW.

Analyze this financial statement and generate identification markers:

{first_pages_text}
"""

    raw = call_llm(prompt=prompt, model=CLASSIFIER_MODEL, temperature=0)

    # ── Clean and parse the LLM JSON response ────────────────────────────────
    def _clean_json(s: str) -> str:
        s = re.sub(r"```(?:json)?", "", s).strip()
        start = s.find("{")
        end   = s.rfind("}")
        if start != -1 and end != -1:
            s = s[start:end + 1]
        s = re.sub(r",\s*([\]}])", r"\1", s)
        s = re.sub(r":\s*True\b",  ": true",  s)
        s = re.sub(r":\s*False\b", ": false", s)
        s = re.sub(r":\s*None\b",  ": null",  s)
        if s.count("{") > s.count("}"):
            s += "}" * (s.count("{") - s.count("}"))
        return s

    try:
        identifier = json.loads(_clean_json(raw))
    except Exception as e:
        logger.error(
            "classify_document_llm: JSON parse failed — %s | raw_preview=%s",
            e, raw[:500],
        )
        m = re.search(r"(\{.*\})", raw, re.DOTALL)
        if m:
            try:
                identifier = json.loads(_clean_json(m.group(1)))
            except Exception:
                raise ValueError(f"LLM returned invalid JSON: {e}")
        else:
            raise ValueError(f"LLM returned no JSON-like content: {e}")

    # ── Ensure parsing_hints exists with safe defaults ────────────────────────
    if "parsing_hints" not in identifier:
        logger.warning("classify_document_llm: parsing_hints missing — injecting defaults")
        identifier["parsing_hints"] = {
            "layout_type":                  "SINGLE_COLUMN",
            "summary_section_labels":       [],
            "transaction_boundary_signals": ["DATE"],
            "ref_no_pattern":               None,
            "page_break_pattern":           r"Page \d+ of \d+",
            "details_strip_patterns":       [],
            "known_summary_amounts":        [],
        }
    else:
        ph = identifier["parsing_hints"]
        ph.setdefault("layout_type",                  "SINGLE_COLUMN")
        ph.setdefault("summary_section_labels",       [])
        ph.setdefault("transaction_boundary_signals", ["DATE"])
        ph.setdefault("ref_no_pattern",               None)
        ph.setdefault("page_break_pattern",           r"Page \d+ of \d+")
        ph.setdefault("details_strip_patterns",       [])
        ph.setdefault("known_summary_amounts",        [])

    raw_inst = identifier.get("institution_name") or "Unknown"
    identifier["institution_name"] = normalise_institution_name(raw_inst)

    logger.info(
        "classify_document_llm: family=%s  institution=%s (raw=%r)  "
        "layout=%s  id=%s",
        identifier.get("document_family"),
        identifier.get("institution_name"),
        raw_inst,
        identifier.get("parsing_hints", {}).get("layout_type"),
        identifier.get("id"),
    )

    return identifier


# ════════════════════════════════════════════════════════════
# SAVE NEW FORMAT  [UNTOUCHED]
# ════════════════════════════════════════════════════════════

def derive_statement_type(identifier_json: dict) -> str:
    family   = identifier_json.get("document_family", "UNKNOWN")
    type_map = {
        "BANK_ACCOUNT_STATEMENT":          "BANK_STATEMENT",
        "CREDIT_CARD_STATEMENT":           "CREDIT_CARD",
        "LOAN_STATEMENT":                  "LOAN",
        "WALLET_STATEMENT":                "WALLET",
        "INVESTMENT_STATEMENT":            "INVESTMENT",
        "DEMAT_STATEMENT":                 "DEMAT",
        "TAX_LEDGER_STATEMENT":            "TAX_LEDGER",
        "PAYMENT_GATEWAY_SETTLEMENT":      "PAYMENT_GATEWAY",
        "OVERDRAFT_CASH_CREDIT_STATEMENT": "OD_CC",
    }
    return type_map.get(family, family)


def save_new_statement_format(
    format_name: str,
    identifier_json: dict,
    extraction_logic: str,
    threshold: float = 65.0,
) -> int:
    statement_type  = derive_statement_type(identifier_json)
    document_family = identifier_json.get("document_family", "UNKNOWN")

    raw_name         = identifier_json.get("institution_name") or "Unknown"
    institution_name = normalise_institution_name(raw_name)
    identifier_json  = {**identifier_json, "institution_name": institution_name}

    existing = check_format_exists(identifier_json)
    if existing:
        logger.info(
            "save_new_statement_format: dedup hit — returning existing statement_id=%s "
            "(institution=%s  family=%s)",
            existing["statement_id"], institution_name, document_family,
        )
        return existing["statement_id"]

    ifsc_code = None
    try:
        ifsc_pattern = (
            identifier_json
            .get("identity_markers", {})
            .get("issuer_identity", {})
            .get("regulatory_identifiers", {})
            .get("ifsc", {})
            .get("pattern")
        )
        if ifsc_pattern:
            import re as _re
            m = _re.search(r"([A-Z]{4})", str(ifsc_pattern))
            if m:
                ifsc_code = m.group(1)
    except Exception:
        pass

    logger.info(
        "Saving NEW format: name=%s  type=%s  institution=%s  ifsc=%s",
        format_name, statement_type, institution_name, ifsc_code,
    )
    return insert_statement_category(
        statement_type=statement_type,
        format_name=format_name,
        institution_name=institution_name,
        identifier_json=identifier_json,
        extraction_logic=extraction_logic,
        ifsc_code=ifsc_code,
        threshold=threshold,
    )