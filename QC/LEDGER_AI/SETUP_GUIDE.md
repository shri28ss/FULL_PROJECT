# Ledger AI - Environment Setup Guide

## ✅ Current Environment Status

### Backend (Python)
- **Python Version:** 3.13.5
- **Package Manager:** pip 25.1
- **Virtual Environment:** `backend/venv/` (Active)

**Installed Dependencies:**
- ✅ fastapi 0.135.1
- ✅ uvicorn 0.41.0
- ✅ psycopg2-binary 2.9.10
- ✅ google-generativeai 0.8.6
- ✅ pdfplumber 0.11.9
- ✅ pikepdf 10.5.0
- ✅ APScheduler 3.11.2
- ✅ ollama 0.6.1
- ✅ RapidFuzz 3.14.3

### Frontend (React)
- **Node Version:** v24.14.0
- **npm Version:** 11.9.0
- **Framework:** React 19.2.0 + Vite 6.2.0 + TypeScript

**Installed Dependencies:**
- ✅ react 19.2.0
- ✅ react-dom 19.2.0
- ✅ react-router-dom 7.13.1
- ✅ axios 1.13.6
- ✅ lucide-react 0.576.0
- ✅ typescript 5.9.3

### Database
- **Type:** Supabase PostgreSQL
- **Connection:** Configured in `backend/.env`

---

## 🔧 Environment Configuration

### 1. Backend Environment Variables (`backend/.env`)

```env
GEMINI_API_KEY="YOUR_API_KEY"
SUPABASE_URL="https://ivbrlminlzhpitiyczze.supabase.co"
SUPABASE_ANON_KEY="sb_publishable_U4u5MwpsXLYsnCU_fr1Fig_q283BqdL"
SUPABASE_DB_URL="postgresql://postgres:ledgerAI%40uve@db.ivbrlminlzhpitiyczze.supabase.co:5432/postgres"
```

**Status:** ✅ Configured

---

## 🚀 How to Start the Application

### Option 1: Windows (Recommended)
Double-click `start.bat` in the project root.

This will:
1. Start Backend API on `http://localhost:8000`
2. Start Frontend Dev Server on `http://localhost:5173`

### Option 2: Manual Start

**Terminal 1 - Backend:**
```bash
cd backend
.\venv\Scripts\activate
uvicorn backend:app --reload
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Option 3: Linux/Mac
```bash
chmod +x start.sh
./start.sh
```

---

## 📦 Installation Commands (If Needed)

### Backend Setup
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

### Frontend Setup
```bash
cd frontend
npm install
```

---

## 🗄️ Database Setup

1. **Import Schema:**
   ```bash
   # Import backend/db/full_schema.sql into your database
   ```

2. **Verify Connection:**
   - Backend connects to Supabase PostgreSQL automatically
   - Connection string in `backend/.env`

---

## 🧪 Testing the Setup

### Test Backend API
```bash
curl http://localhost:8000/api/review-documents
```

### Test Frontend
Open browser: `http://localhost:5173`

---

## 📁 Project Structure

```
LEDGER_AI/
├── backend/
│   ├── venv/              # Python virtual environment
│   ├── services/          # Core business logic (19 modules)
│   ├── db/                # Database schema & connection
│   ├── repository/        # Data access layer
│   ├── statement_pdf/     # Sample bank PDFs
│   ├── .env              # Environment variables
│   ├── backend.py        # Main FastAPI app
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── pages/        # React pages (3 main views)
│   │   └── components/   # Reusable components
│   ├── node_modules/     # npm packages
│   ├── package.json      # npm dependencies
│   └── vite.config.ts    # Vite configuration
├── .gitignore            # Git ignore rules
├── start.bat             # Windows startup script
├── start.sh              # Linux/Mac startup script
└── README.md             # Project documentation
```

---

## 🔍 Troubleshooting

### Backend Issues

**Problem:** `ModuleNotFoundError`
```bash
cd backend
.\venv\Scripts\activate
pip install -r requirements.txt
```

**Problem:** Database connection error
- Check `backend/.env` has correct Supabase credentials
- Verify database schema is imported

**Problem:** Port 8000 already in use
```bash
# Kill existing process
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### Frontend Issues

**Problem:** `npm ERR!` or missing modules
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

**Problem:** Port 5173 already in use
- Vite will automatically use next available port (5174, 5175, etc.)

---

## 🎯 Next Steps

1. ✅ Environment is properly configured
2. ✅ All dependencies installed
3. ✅ Database connected
4. 🚀 Run `start.bat` to launch the application
5. 📊 Access the app at `http://localhost:5173`

---

## 📞 Support

- Check `README.md` for detailed feature documentation
- Review `frontend/QC-SOP.md` for QC workflow guide
- Check recent commits: `git log --oneline -10`

---

**Last Updated:** 2026-03-20
**Environment Status:** ✅ READY TO RUN
