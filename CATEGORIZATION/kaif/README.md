# LedgerAI - Intelligent Bank Statement Processor

LedgerAI is a multi-service platform designed to ingest, parse, and categorize bank statements with high precision using a combination of Rule-matching, Machine Learning, and LLMs (vial Google Gemini).

## 🏗 Architecture Overview

The system consists of four primary components:

1.  **Node.js Backend (Port 3000):** The orchestration hub. It manages user accounts, document staging, and the final categorization workflow.
2.  **ML Microservice (Port 5000):** A Python service using spaCy and Sentence-Transformers for specialized transaction classification.
3.  **Parser Backend (Port 8000):** A Python FastAPI service that handles PDF text extraction and uses LLMs to identify bank formats and parse transactions.
4.  **Frontend (Port 5173):** A modern React + Vite web application with a premium UI for uploading statements and reviewing parsed results.

---

## 🚀 Quick Start

### 1. Prerequisites
*   Node.js (v18+)
*   Python (3.9+)
*   Supabase Account (Database + Auth)
*   Google Gemini API Key

### 2. Environment Setup
Each service requires its own `.env` file. Copy the templates/placeholders provided in each directory and fill in your credentials.

**Core Required Variables:**
*   `SUPABASE_URL` & `SUPABASE_ANON_KEY`
*   `GEMINI_API_KEY` (for Parser)

---

## 🛠 Installation & Startup

### A. Main Backend (Node.js)
```bash
cd backend
npm install
npm run dev
```

### B. ML Microservice (Python)
```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate 
pip install -r requirements.txt
python -m spacy download en_core_web_sm
python main.py
```

### C. Parser Backend (Python)
```bash
cd parser_backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### D. Web Frontend (React)
```bash
cd frontend-web
npm install
npm run dev
```

---

## 📂 Project Structure

```text
kaif/
├── backend/            # Express.js API
├── ml-service/         # Python ML Classification
├── parser_backend/    # Python LLM Extraction Pipeline
├── frontend-web/       # React + Vite UI
└── schema.sql          # Database structure for Supabase
```

## 🔐 Security Note
Ensure that `Row Level Security (RLS)` is enabled in your Supabase instance. Use the provided `schema.sql` to initialize your database tables and functions correctly.

---

## 📝 License
Proprietary - Developed for LedgerAI.
