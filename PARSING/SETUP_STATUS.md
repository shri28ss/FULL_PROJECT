# LedgerAI Local Setup - Quick Start

## ✅ Completed Steps

1. **Python 3.14.3** - Installed
2. **Node.js v22.22.0** - Installed
3. **Backend virtual environment** - Created at `backend/.venv`
4. **Frontend dependencies** - Installed (189 packages)
5. **Documentation created**:
   - `IMPROVEMENTS.md` - Roadmap for enhancements
   - `LOCAL_SETUP.md` - Detailed setup guide
   - `INSTALLATION_ISSUE.md` - Backend dependency issue

## ⚠️ Remaining Setup Tasks

### 1. Install Python Development Headers

**Required to compile backend dependencies:**

```bash
sudo dnf install python3-devel
```

### 2. Install Backend Dependencies

After installing python3-devel:

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
```

**If issues persist, use this alternative (skips camelot-py):**

```bash
pip install supabase python-dotenv "python-jose[cryptography]" pdfplumber pypdf PyPDF2 \
    google-genai bcrypt pandas pymupdf opencv-python fastapi "uvicorn[standard]" \
    httpx email-validator python-multipart requests
```

### 3. Configure Environment Variables

Edit `.env` in the project root with your actual credentials:

```bash
# Get from: https://supabase.com/dashboard → Settings → API
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key

# Get from: https://aistudio.google.com/apikey
GEMINI_API_KEY=your-actual-gemini-key
GEMINI_MODEL_NAME=models/gemini-2.0-flash-lite
```

### 4. Setup Supabase Database

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `migration_script.sql`
3. Execute the script
4. Go to Storage → Create bucket named `financial_document_uploads` (private)

### 5. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
source .venv/bin/activate
python -m uvicorn main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Access the app:** http://localhost:5173

## 📊 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Python | ✅ Installed | v3.14.3 |
| Node.js | ✅ Installed | v22.22.0 |
| Backend venv | ✅ Created | `.venv` directory |
| Backend deps | ❌ Blocked | Need python3-devel |
| Frontend deps | ✅ Installed | 189 packages |
| .env file | ⚠️ Needs config | Placeholder values |
| Database | ⚠️ Not setup | Run migration script |
| Storage bucket | ⚠️ Not created | Create in Supabase |

## 🚀 Next Actions

1. **Install python3-devel** (requires sudo password)
2. **Install backend dependencies**
3. **Configure .env with real credentials**
4. **Run database migration**
5. **Create storage bucket**
6. **Start both servers**

## 📚 Documentation

- **LOCAL_SETUP.md** - Complete setup instructions
- **IMPROVEMENTS.md** - Feature roadmap and enhancement suggestions
- **README.md** - Project overview and architecture
- **INSTALLATION_ISSUE.md** - Troubleshooting backend installation

## 🔧 Troubleshooting

If you encounter issues, check:
- Backend logs in terminal 1
- Frontend logs in browser console (F12)
- Supabase dashboard for database/storage status
- `.env` file has correct credentials (no placeholder values)

---

**Ready to proceed?** Install python3-devel and then run the backend installation command.
