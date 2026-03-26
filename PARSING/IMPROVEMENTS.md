# LedgerAI Improvement Roadmap

## High Priority

### 1. Switch Code Generator to Claude Sonnet 4.5
**Status**: Planned
**Impact**: High
**Effort**: Medium

Claude excels at structured code generation compared to Gemini. Keep Gemini for direct LLM parsing (fast/cheap), but use Claude for extraction code generation.

**Implementation**:
```python
# In extraction_service.py
from anthropic import Anthropic
anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)

def generate_extraction_logic_llm(identifier_json, text_sample):
    response = anthropic_client.messages.create(
        model="claude-sonnet-4-5-20241022",
        max_tokens=4096,
        temperature=0,
        messages=[{"role": "user", "content": prompt}]
    )
```

**Benefits**:
- Cleaner, more maintainable Python code
- Better edge case handling
- More robust regex patterns
- Improved error handling in generated code

---

### 2. Add Real-Time Processing Status Updates
**Status**: Not Started
**Impact**: High (UX)
**Effort**: Medium

Users currently wait in the dark during processing. Add WebSocket or Server-Sent Events for real-time updates.

**Implementation**:
- Add SSE endpoint: `/documents/{id}/status-stream`
- Emit events: "Extracting page 3/15", "Running CODE extractor", "Validating 127 transactions"
- Update frontend to consume SSE stream

**Benefits**:
- Better user experience
- Reduced perceived wait time
- Users can see progress and know system is working

---

### 3. Improve Error Recovery
**Status**: Not Started
**Impact**: High
**Effort**: Medium

Current flow fails completely if CODE crashes. Need graceful degradation.

**Implementation**:
- Add retry logic with exponential backoff
- Implement partial success handling (save what worked)
- Provide detailed error messages to users (not just "FAILED")
- Add error categorization (PDF_CORRUPT, CODE_FAILED, LLM_TIMEOUT, etc.)

**Benefits**:
- Higher success rate
- Better debugging
- Users understand what went wrong

---

### 4. Auto-Promote Format Status
**Status**: Not Started
**Impact**: High (Performance)
**Effort**: Low

New formats start as UNDER_REVIEW, requiring dual pipeline every time until manually promoted.

**Implementation**:
```python
if statement_status == "UNDER_REVIEW":
    success_count = get_format_success_count(statement_id)
    avg_accuracy = get_format_avg_accuracy(statement_id)

    if success_count >= 3 and avg_accuracy >= 95:
        update_statement_status(statement_id, "ACTIVE")
        logger.info("Auto-promoted format %s to ACTIVE", statement_id)
```

**Benefits**:
- Faster processing after format is proven
- Reduced LLM costs
- Automatic optimization

---

### 5. Transaction Deduplication
**Status**: Not Started
**Impact**: High (Data Quality)
**Effort**: Medium

No duplicate detection - users could upload same PDF twice and get duplicate transactions.

**Implementation**:
```python
def generate_transaction_hash(user_id, account_id, date, amount, description):
    content = f"{user_id}:{account_id}:{date}:{amount}:{description[:50]}"
    return hashlib.sha256(content.encode()).hexdigest()

# Check before inserting into uncategorized_transactions
existing = sb.table("uncategorized_transactions")\
    .select("transaction_hash")\
    .eq("transaction_hash", txn_hash)\
    .execute()
```

**Schema Change**:
```sql
ALTER TABLE uncategorized_transactions
ADD COLUMN transaction_hash VARCHAR(64) UNIQUE;

CREATE INDEX idx_transaction_hash ON uncategorized_transactions(transaction_hash);
```

**Benefits**:
- Prevents duplicate data
- Cleaner transaction history
- Better data integrity

---

## Medium Priority

### 6. Add Caching Layer
**Status**: Not Started
**Impact**: Medium (Performance)
**Effort**: Medium

Repeated PDF text extraction is expensive. Cache extracted text.

**Implementation**:
- Add Redis or in-memory cache
- Cache key: `pdf_text:{file_hash}`
- TTL: 1 hour
- Cache extracted text, identifier results

**Benefits**:
- Faster re-processing
- Reduced PDF parsing overhead
- Better performance for retries

---

### 7. Batch Processing
**Status**: Not Started
**Impact**: Medium (UX)
**Effort**: High

Allow uploading multiple PDFs at once.

**Implementation**:
- Update upload endpoint to accept multiple files
- Process in parallel with ThreadPoolExecutor
- Show batch progress UI

**Benefits**:
- Better UX for bulk uploads
- Time savings for users
- More efficient processing

---

### 8. Enhanced Transaction Validation
**Status**: Partial (only date validation exists)
**Impact**: Medium (Data Quality)
**Effort**: Low

Current `_is_valid_transaction()` only checks date format.

**Add**:
- Amount validation (debit XOR credit, not both null)
- Balance reconciliation (running balance should match debits/credits)
- Date sequence validation (chronological order)
- Reasonable amount ranges (flag transactions > 10M)

**Benefits**:
- Higher data quality
- Catch extraction errors early
- Better confidence scoring

---

### 9. Code Quality Metrics
**Status**: Not Started
**Impact**: Medium (Observability)
**Effort**: Low

Track which formats consistently fail CODE extraction.

**Schema Changes**:
```sql
ALTER TABLE statement_categories
ADD COLUMN code_failure_rate DECIMAL(5,2),
ADD COLUMN last_code_failure_reason TEXT,
ADD COLUMN total_attempts INT DEFAULT 0,
ADD COLUMN code_success_count INT DEFAULT 0;
```

**Benefits**:
- Identify problematic formats
- Data-driven format improvements
- Better monitoring

---

### 10. Frontend Improvements
**Status**: Not Started
**Impact**: Medium (UX)
**Effort**: Medium

**Add**:
- Progress bar during upload/processing
- Transaction diff view (side-by-side CODE vs LLM with highlights)
- Bulk edit transactions before approval
- Export to CSV/Excel (not just JSON)
- Dark mode support
- Mobile responsive design improvements

**Benefits**:
- Better user experience
- More professional UI
- Increased usability

---

## Low Priority / Nice-to-Have

### 11. Multi-Page Transaction Handling
**Status**: Not Started
**Impact**: Low (Edge Cases)
**Effort**: Medium

Some transactions span pages. Add context window to CODE generator.

**Implementation**:
- Pass previous page + current page + next page to LLM
- Let LLM handle split transactions
- Add transaction continuation detection

---

### 12. OCR Support for Scanned PDFs
**Status**: Not Started
**Impact**: Medium (Coverage)
**Effort**: High

Currently detect `SCANNED_PDF` but don't process it.

**Implementation**:
- Add Tesseract OCR or Google Vision API
- Pre-process scanned PDFs to extract text
- Fall back to OCR when pdfplumber fails

**Benefits**:
- Support more PDF types
- Handle older bank statements
- Wider document coverage

---

### 13. Smart Account Matching
**Status**: Basic implementation exists
**Impact**: Medium (UX)
**Effort**: Medium

Current `account_detector.py` exists but auto-linking could be smarter.

**Improvements**:
- Match by institution name + last 4 digits
- Learn from user corrections
- Confidence scoring with thresholds
- Fuzzy matching for institution names

---

### 14. Comprehensive Audit Trail
**Status**: Not Started
**Impact**: Low (Compliance)
**Effort**: Medium

Track all user edits to transactions.

**Schema**:
```sql
CREATE TABLE transaction_edit_history (
    edit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transaction_id BIGINT NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    edited_by BIGINT NOT NULL,
    edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES uncategorized_transactions(uncategorized_transaction_id),
    FOREIGN KEY (edited_by) REFERENCES users(user_id)
);
```

**Benefits**:
- Full audit trail
- Compliance ready
- Debug user issues

---

### 15. Rate Limiting
**Status**: Not Started
**Impact**: Low (Security)
**Effort**: Low

Add per-user upload limits to prevent abuse.

**Implementation**:
```python
# Max 10 PDFs per hour per user
# Max 50 MB total per day per user
# Use Redis for rate limit tracking
```

---

## Architecture Improvements

### 16. Move to Async Processing Queue
**Status**: Not Started
**Impact**: High (Scalability)
**Effort**: High

Replace threading with proper task queue (Celery/RQ/BullMQ).

**Current**:
```python
threading.Thread(target=run_processing, daemon=True).start()
```

**Better**:
```python
celery_app.send_task('process_document', args=[document_id])
```

**Benefits**:
- Better scalability
- Retry mechanisms
- Task monitoring
- Distributed processing

---

### 17. Isolated Code Execution Service
**Status**: Not Started
**Impact**: High (Security)
**Effort**: High

Run LLM-generated code in isolated containers instead of main backend.

**Implementation**:
- Deploy code execution to AWS Lambda / Cloud Run
- Send code + text via API
- Receive extracted transactions
- Better security isolation

**Benefits**:
- Enhanced security
- Resource isolation
- Scalable execution
- Crash protection

---

## Immediate Action Plan (Next Sprint)

1. ✅ **Switch code generator to Claude Sonnet 4.5** (Highest ROI)
2. ✅ **Add transaction deduplication** (Data quality critical)
3. ✅ **Improve validation** (Amount + balance checks)
4. ✅ **Add real-time status updates** (UX improvement)
5. ✅ **Auto-promote UNDER_REVIEW → ACTIVE** (Performance win)

---

## Metrics to Track

- **Processing Success Rate**: % of documents that complete successfully
- **CODE vs LLM Win Rate**: Which pipeline wins more often
- **Average Processing Time**: Time from upload to AWAITING_REVIEW
- **Format Reuse Rate**: % of documents using ACTIVE formats (fast path)
- **User Approval Rate**: % of staged transactions approved by users
- **Error Categories**: Distribution of failure types

---

## Technical Debt

- Remove commented-out OpenRouter code in `extraction_service.py`
- Consolidate duplicate `db/connection.py` and `backend/db/connection.py`
- Add type hints throughout backend
- Add comprehensive unit tests (currently none)
- Add integration tests for processing pipeline
- Document all API endpoints with OpenAPI/Swagger
- Add logging levels (currently all INFO)
- Implement proper configuration management (not just env vars)
