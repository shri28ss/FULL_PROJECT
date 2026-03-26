# Switching Code Generation Provider

## Overview

LedgerAI now supports multiple providers for code generation:
- **Anthropic Direct** - Best quality, most expensive
- **OpenRouter** - Good quality, moderate cost, supports multiple models
- **9router** - Cheaper alternative for testing

Gemini is still used for direct LLM parsing (fast and cheap).

## Quick Switch

Change the provider by editing `.env`:

```bash
# For testing with 9router (cheapest)
CODE_GEN_PROVIDER=9router

# For production with OpenRouter (good balance)
CODE_GEN_PROVIDER=openrouter

# For best quality with Anthropic Direct
CODE_GEN_PROVIDER=anthropic
```

Restart the backend after changing.

## Configuration

### 1. Using 9router (Recommended for Testing)

```bash
CODE_GEN_PROVIDER=9router
NINEROUTER_API_KEY=your-9router-key-here
NINEROUTER_MODEL=anthropic/claude-sonnet-4.5
NINEROUTER_URL=https://api.9router.com/v1/chat/completions
```

### 2. Using OpenRouter (Recommended for Production)

```bash
CODE_GEN_PROVIDER=openrouter
OPENROUTER_API_KEY=your-openrouter-key-here
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
```

Get key from: https://openrouter.ai/keys

### 3. Using Anthropic Direct (Best Quality)

```bash
CODE_GEN_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-anthropic-key-here
ANTHROPIC_MODEL=claude-sonnet-4-5-20241022
```

Get key from: https://console.anthropic.com/

**Note:** Requires `anthropic` package:
```bash
cd backend
source .venv/bin/activate
pip install anthropic
```

## Common Settings

These apply to all providers:

```bash
CODE_GEN_MAX_TOKENS=4096      # Maximum tokens for code generation
CODE_GEN_TEMPERATURE=0        # 0 = deterministic, 1 = creative
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Processing Engine                   │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌─────────────────┐           ┌─────────────────────┐
│ Code Generation │           │  Direct LLM Parse   │
│   (Claude via   │           │     (Gemini)        │
│  configurable   │           │   Fast & Cheap      │
│    provider)    │           └─────────────────────┘
└─────────────────┘
         │
         ├─ Anthropic Direct
         ├─ OpenRouter
         └─ 9router
```

## Why Claude for Code Generation?

Claude Sonnet 4.5 produces significantly better Python code than Gemini:
- Cleaner, more maintainable code
- Better edge case handling
- More robust regex patterns
- Improved error handling

## Cost Comparison (Approximate)

| Provider | Cost per 1M tokens | Best For |
|----------|-------------------|----------|
| Anthropic Direct | $3-15 | Production, best quality |
| OpenRouter | $3-15 | Production, flexibility |
| 9router | $0.50-2 | Testing, development |
| Gemini (parsing) | $0.075 | Direct parsing (unchanged) |

## Testing the Switch

1. Edit `.env` and set `CODE_GEN_PROVIDER=9router`
2. Add your 9router API key
3. Restart backend: `cd backend && source .venv/bin/activate && python -m uvicorn main:app --reload --port 8000`
4. Upload a test document
5. Check logs to verify provider is being used

## Troubleshooting

**"Invalid CODE_GEN_PROVIDER"**
→ Check spelling: must be exactly "anthropic", "openrouter", or "9router"

**"ANTHROPIC_API_KEY not set"**
→ Add the API key for your chosen provider in `.env`

**"anthropic package not installed"**
→ Run: `pip install anthropic` (only needed for Anthropic Direct)

**Rate limit errors**
→ The client automatically retries with exponential backoff (5s, 10s, 20s)

## Monitoring

Check backend logs to see which provider is being used:

```
INFO ledgerai.code_gen_client - Code generation provider: 9router
INFO ledgerai.code_gen_client - 9router client initialized: anthropic/claude-sonnet-4.5
INFO ledgerai.extraction_service - Generating extraction code: family=BANK_ACCOUNT_STATEMENT
INFO ledgerai.code_gen_client - 9router generation success: 2847 chars
```

## Switching Back to Gemini

If you want to revert to Gemini for code generation:

1. Comment out the new code in `extraction_service.py`
2. Uncomment the old Gemini code
3. Restart backend

Or keep the new system and set:
```bash
CODE_GEN_PROVIDER=gemini  # (requires adding Gemini support to code_gen_client.py)
```

## Production Recommendation

For production, use **OpenRouter** with Claude Sonnet 4.5:
- Good balance of cost and quality
- Reliable uptime
- Supports fallback to other models if needed
- Easy to switch models without code changes

For testing/development, use **9router**:
- Significantly cheaper
- Same API interface
- Good for iterating on prompts
