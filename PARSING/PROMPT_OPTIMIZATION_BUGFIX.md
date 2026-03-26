# Prompt Optimization - Bug Fix

**Date:** March 24, 2026
**Issue:** Code generation using `Optional` without importing it
**Status:** ✅ Fixed

---

## Problem

After optimizing the prompts, the generated code failed with:
```
CODE extraction FAILED: name 'Optional' is not defined
```

**Root cause:** The optimized prompt said "only import re" but Claude Sonnet 4.5 was generating code using `Optional` from the `typing` module, which wasn't imported.

---

## Impact

- **Good news:** The dual-pipeline system worked as designed - LLM parser extracted 20 transactions successfully
- **Bad news:** CODE path failed, so no code was saved for future reuse
- **Result:** Document processed correctly, but format won't become ACTIVE (stays EXPERIMENTAL)

---

## Fix Applied

Updated both prompts to explicitly forbid typing imports:

**bank_statement.py & credit_card.py:**
```python
RULES:
- Raw Python only, no markdown
- Only use built-in types (dict, list, str, float, int, bool, None)
- Do NOT import typing, Optional, List, Dict - use lowercase dict, list instead
- Only import re if needed
```

This tells Claude to use:
- `list` instead of `List[Dict]`
- `dict` instead of `Dict[str, Any]`
- `float | None` or just `None` instead of `Optional[float]`

---

## Testing

Upload the same document again. Expected result:
- CODE path should succeed (no import errors)
- Both CODE and LLM should extract transactions
- System picks the winner based on accuracy
- If CODE wins 3 times, format becomes ACTIVE

---

## Why This Happened

The original verbose prompt (437 lines) explicitly said:
```
5. RAW PYTHON ONLY
   - No markdown fences (```python)
   - Only import re (pre-injected)
   - No external libraries
```

The optimized prompt (63 lines) said:
```
- Raw Python only, no markdown, only import re
```

Claude interpreted "only import re" as "you can import re" not "ONLY re, nothing else". The fix makes it explicit: "Do NOT import typing".

---

## Lesson Learned

When optimizing prompts:
1. ✅ Remove verbose explanations
2. ✅ Condense repeated rules
3. ❌ Don't assume implicit constraints are understood
4. ✅ Be explicit about what NOT to do

"Only import re" → ambiguous
"Do NOT import typing, Optional, List, Dict" → explicit

---

**Fix applied:** March 24, 2026 at 23:40 IST
**Files modified:** bank_statement.py, credit_card.py
**Ready for testing:** Yes
