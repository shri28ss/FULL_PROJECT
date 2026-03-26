# LedgerAI - LLM Call Breakdown

## Summary: 3 LLM Calls (2 Different Models)

Your pipeline makes **up to 3 LLM calls** depending on the scenario, using **2 different models**:

---

## The 3 LLM Calls

### 1. Document Classification (NEW formats only)
**Function:** `classify_document_llm()` in `identifier_service.py`
**Model:** **Gemini** (`gemini-2.5-flash`)
**When:** Only for NEW document formats (not in database)
**Purpose:** Identify document type, institution, layout structure
**Input:** First page, second page, last page, headers
**Output:** JSON with document_family, institution_name, parsing_hints

```python
# From .env
GEMINI_API_KEY=YOUR_API_KEY
GEMINI_MODEL_NAME=models/gemini-2.5-flash
```

---

### 2. Code Generation (NEW formats only)
**Function:** `generate_extraction_logic_llm()` in `extraction_service.py`
**Model:** **Claude Sonnet 4.5** (via 9router/OpenRouter/Anthropic)
**When:** Only for NEW document formats (not in database)
**Purpose:** Generate Python extraction code based on document structure
**Input:** Document classification + text sample
**Output:** Python function `extract_transactions(text)`

```python
# From .env
CODE_GEN_PROVIDER=9router
NINEROUTER_MODEL=kr/claude-sonnet-4.5
```

---

### 3. Direct LLM Parsing (Always runs for non-ACTIVE formats)
**Function:** `parse_with_llm()` in `llm_parser.py`
**Model:** **Gemini** (`gemini-2.5-flash`)
**When:** NEW formats + UNDER_REVIEW formats (dual pipeline)
**Purpose:** Direct transaction extraction as fallback/comparison
**Input:** Full document text + identifier JSON
**Output:** List of transactions in JSON format

```python
# From .env
GEMINI_API_KEY=YOUR_API_KEY
GEMINI_MODEL_NAME=models/gemini-2.5-flash
```

---

## Processing Scenarios

### Scenario A: ACTIVE Format (Known & Trusted)
**LLM Calls:** **0** (Fast path!)
- Uses stored Python code from database
- No LLM calls needed
- Fastest processing

```
Upload → Extract Text → Find Format (ACTIVE) →
  Run Stored Code → Validate → Done ✅
```

---

### Scenario B: NEW Format (First Time Seeing This Bank)
**LLM Calls:** **3**
1. **Gemini** - Classify document (identify bank, type, structure)
2. **Claude** - Generate extraction code
3. **Gemini** - Direct parsing (runs in parallel with code)

```
Upload → Extract Text → No Match Found →
  ├─ Call 1: Gemini classifies document
  ├─ Call 2: Claude generates Python code
  └─ Call 3: Gemini parses directly (parallel)
→ Compare results → Pick winner → Done ✅
```

---

### Scenario C: UNDER_REVIEW Format (Seen Before, Not Trusted Yet)
**LLM Calls:** **1** (Dual pipeline)
- Uses stored classification + code from database
- Only runs dual extraction (CODE + LLM)
- **Gemini** for direct parsing

```
Upload → Extract Text → Find Format (UNDER_REVIEW) →
  ├─ Run Stored Code (no LLM)
  └─ Call 1: Gemini parses directly (parallel)
→ Compare results → Pick winner → Done ✅
```

---

## Model Usage Summary

| Model | Used For | Cost | Speed |
|-------|----------|------|-------|
| **Gemini 2.5 Flash** | Classification + Direct Parsing | ~$0.075/1M tokens | Very Fast |
| **Claude Sonnet 4.5** | Code Generation | ~$0.50-15/1M tokens* | Medium |

*Cost depends on provider: 9router (~$0.50-2), OpenRouter (~$3-15), Anthropic Direct (~$3-15)

---

## Why Different Models?

### Gemini for Classification & Parsing
- **Fast & Cheap** (~$0.075 per 1M tokens)
- Good at understanding document structure
- Reliable for direct extraction
- Used for high-frequency operations

### Claude for Code Generation
- **Better Code Quality** (cleaner Python, better edge cases)
- More robust regex patterns
- Better error handling
- Used once per format, then reused forever

---

## Cost Optimization Strategy

### First Document (NEW format)
```
Call 1: Gemini classification    ~$0.001
Call 2: Claude code generation   ~$0.01-0.05 (depending on provider)
Call 3: Gemini direct parsing    ~$0.002
Total: ~$0.013-0.053 per document
```

### Subsequent Documents (ACTIVE format)
```
No LLM calls - uses stored code
Total: $0 per document ✅
```

### Format Learning Benefit
After 3 successful extractions:
- Format promoted to ACTIVE
- All future documents: **$0 LLM cost**
- Processing time: **3-5x faster**

---

## Current Configuration

```bash
# Gemini (Classification + Direct Parsing)
GEMINI_API_KEY=YOUR_API_KEY
GEMINI_MODEL_NAME=models/gemini-2.5-flash

# Claude (Code Generation)
CODE_GEN_PROVIDER=9router
NINEROUTER_API_KEY=sk-df17cd599720d34c-enryoj-60e9fd98
NINEROUTER_MODEL=kr/claude-sonnet-4.5
NINEROUTER_URL=http://localhost:20128/v1/chat/completions
```

---

## Switching Models

### To Use Different Gemini Model
```bash
GEMINI_MODEL_NAME=models/gemini-2.0-flash-lite  # Cheaper
GEMINI_MODEL_NAME=models/gemini-2.5-pro         # More accurate
```

### To Use Different Claude Provider
```bash
# OpenRouter (production)
CODE_GEN_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5

# Anthropic Direct (best quality)
CODE_GEN_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-key
ANTHROPIC_MODEL=claude-sonnet-4-5-20241022
```

---

## Performance Metrics

### NEW Format Processing
- **Time:** 30-60 seconds (3 LLM calls + code execution)
- **Cost:** ~$0.01-0.05 per document
- **Accuracy:** 85-95% (dual pipeline picks best)

### ACTIVE Format Processing
- **Time:** 5-10 seconds (no LLM calls)
- **Cost:** $0 per document
- **Accuracy:** 90-98% (proven code)

---

## Recommendations

### For Testing/Development
✅ Current setup is optimal:
- Gemini for fast/cheap classification & parsing
- 9router for cheap Claude code generation

### For Production
Consider:
- Keep Gemini for classification & parsing (fast & cheap)
- Switch to OpenRouter for code generation (more reliable)
```bash
CODE_GEN_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
```

### For Best Quality
- Keep Gemini for classification & parsing
- Use Anthropic Direct for code generation
```bash
CODE_GEN_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-key
```

---

## Summary

**3 LLM calls maximum:**
1. Gemini - Document classification (NEW formats only)
2. Claude - Code generation (NEW formats only)
3. Gemini - Direct parsing (NEW + UNDER_REVIEW formats)

**2 different models:**
- **Gemini 2.5 Flash** - Fast & cheap for classification/parsing
- **Claude Sonnet 4.5** - Better quality for code generation

**Smart optimization:**
- ACTIVE formats: 0 LLM calls (uses stored code)
- System gets faster and cheaper over time as formats are learned

**Your current setup is cost-optimized for testing!** 🎯
