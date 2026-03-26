# LedgerAI Local Development Setup Guide

## Prerequisites

✅ **Installed on your system:**
- Python 3.14.3
- Node.js v22.22.0
- npm 10.9.4

## Setup Steps

### 1. Environment Variables

Your `.env` file exists but needs to be configured with actual credentials.

**Edit `.env` in the project root:**

```bash
# Get these from: https://supabase.com/dashboard → Your Project → Settings → API
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key-here

# Get from: https://aistudio.google.com/apikey
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL_NAME=models/gemini-2.0-flash-lite
```

### 2. Database Setup

**Run the migration script in Supabase:**

1. Go to Supabase Dashboard → SQL Editor
2. Open `migration_script.sql` from the project root
3. Execute the script to create all tables

**Create Storage Bucket:**

1. Go to Supabase Dashboard → Storage
2. Click "New Bucket"
3. Name: `financial_document_uploads`
4. Make it **private** (not public)
5. Click "Create bucket"

### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
source .venv/bin/activate  # Linux/Mac
# OR
.venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Start the backend server
python -m uvicorn main:app --reload --port 8000
```

Backend will be available at: **http://localhost:8000**

**Test the backend:**
```bash
curl http://localhost:8000/health
# Should return: {"status":"ok","supabase_configured":true}
```

### 4. Frontend Setup

Open a **new terminal** (keep backend running):

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

Frontend will be available at: **http://localhost:5173**

### 5. Verify Setup

1. Open http://localhost:5173 in your browser
2. You should see the LedgerAI login page
3. Try creating an account
4. Upload a test bank statement PDF

## Common Issues

### Backend won't start

**Error: "MISSING / PLACEHOLDER SUPABASE CONFIG DETECTED"**
- Solution: Fill in actual Supabase credentials in `.env`

**Error: "ModuleNotFoundError"**
- Solution: Make sure virtual environment is activated and dependencies are installed
```bash
source .venv/bin/activate
pip install -r requirements.txt
```

### Frontend won't start

**Error: "Cannot find module"**
- Solution: Install dependencies
```bash
cd frontend
npm install
```

**Error: "CORS error" when calling API**
- Solution: Make sure backend is running on port 8000
- Check that frontend is configured to call http://localhost:8000

### Database errors

**Error: "relation does not exist"**
- Solution: Run the migration script in Supabase SQL Editor

**Error: "bucket not found"**
- Solution: Create the `financial_document_uploads` bucket in Supabase Storage

## Development Workflow

### Running both servers

**Terminal 1 (Backend):**
```bash
cd backend
source .venv/bin/activate
python -m uvicorn main:app --reload --port 8000
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

### Viewing Logs

Backend logs appear in Terminal 1 with detailed processing information.

Frontend logs appear in the browser console (F12 → Console tab).

### Testing Document Upload

1. Go to http://localhost:5173
2. Register/Login
3. Click "Upload Document"
4. Select a bank statement PDF
5. If password-protected, enter the password
6. Watch the processing status
7. Review extracted transactions
8. Approve to save

## Project Structure

```
LedgerAI/
├── backend/              # FastAPI backend
│   ├── .venv/           # Python virtual environment (create this)
│   ├── main.py          # Entry point
│   ├── requirements.txt # Python dependencies
│   └── services/        # Core processing logic
├── frontend/            # React frontend
│   ├── node_modules/    # npm dependencies (install with npm install)
│   ├── src/            # React source code
│   └── package.json    # npm dependencies
├── .env                # Environment variables (configure this)
└── migration_script.sql # Database schema
```

## Next Steps

After setup is complete:

1. Read `IMPROVEMENTS.md` for planned enhancements
2. Test with various bank statement formats
3. Check Supabase dashboard to see stored documents and transactions
4. Review backend logs to understand the processing pipeline

## Useful Commands

```bash
# Backend - Run tests (when added)
cd backend
pytest

# Frontend - Build for production
cd frontend
npm run build

# Frontend - Lint code
cd frontend
npm run lint

# Backend - Check Python version
python3 --version

# Frontend - Check Node version
node --version
```

## API Documentation

Once backend is running, visit:
- Health check: http://localhost:8000/health
- Root: http://localhost:8000/

Key endpoints:
- `POST /auth/register` - Create account
- `POST /auth/login` - Login
- `POST /documents/upload` - Upload PDF
- `GET /documents/status/{id}` - Check processing status
- `GET /documents/{id}/review` - Get extracted transactions
- `POST /documents/{id}/approve` - Approve and save transactions

## Support

If you encounter issues:
1. Check the terminal logs for error messages
2. Verify all environment variables are set correctly
3. Ensure Supabase database and storage are configured
4. Check that both backend and frontend are running
