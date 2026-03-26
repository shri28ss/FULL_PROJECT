# Backend Dependencies Installation Issue

## Problem

The backend installation is failing due to a missing Python development header (`Python.h`) required to compile the `pyiceberg` package (a dependency of `supabase`).

**Error:**
```
pyiceberg/avro/decoder_fast.c:41:10: fatal error: Python.h: No such file or directory
```

## Solution

You need to install Python development headers. Run this command:

```bash
sudo dnf install python3-devel
```

Then retry the backend installation:

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
```

## Alternative: Skip camelot-py

If the issue persists, you can install dependencies without `camelot-py` (which is rarely used):

```bash
cd backend
source .venv/bin/activate

# Install everything except camelot-py
pip install supabase python-dotenv "python-jose[cryptography]" pdfplumber pypdf PyPDF2 \
    google-genai bcrypt pandas pymupdf opencv-python fastapi "uvicorn[standard]" \
    httpx email-validator python-multipart requests
```

The application will work fine without `camelot-py` - it's only used for advanced table extraction which the current code doesn't utilize.

## Current Status

- ✅ Python 3.14.3 installed
- ✅ Node.js v22.22.0 installed
- ✅ Virtual environment created at `backend/.venv`
- ✅ pip upgraded to 26.0.1
- ❌ Dependencies installation failed (missing Python.h)
- ⏳ Frontend dependencies not yet installed

## Next Steps After Installing python3-devel

1. Install backend dependencies:
   ```bash
   cd backend
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

3. Configure `.env` file with your Supabase and Gemini credentials

4. Run database migration in Supabase SQL Editor

5. Start both servers and test
