# Quick Start Guide - Unified Application

## Running the Application

### 1. Install Dependencies
```bash
cd C:\Users\SHREE\MAIN_PROJECT\CATEGORIZATION\kaif\frontend-web
npm install
```

### 2. Start the Application
```bash
npm run dev
```

### 3. Access the Application
- Open browser to the Vite dev server URL (typically `http://localhost:5173`)
- Login using Categorization authentication

---

## Application Flow

### User Journey:
1. **Login** → Categorization Auth (`/auth`)
2. **Dashboard** → Overview page (`/`)
3. **Parsing** → Upload PDFs and view documents (`/parsing`)
4. **Review** → Review extracted transactions (`/review?id=<document_id>`)

---

## Navigation Structure

```
┌─────────────────────────────────────┐
│         LedgerAI (Sidebar)          │
├─────────────────────────────────────┤
│ 📊 Overview         (/)             │
│ 💳 Transactions     (/transactions) │
│ 🏦 Accounts         (/accounts)     │
│ 📈 Analytics        (/analytics)    │
│ 📄 Parsing          (/parsing)      │ ← NEW
│ ✅ Review           (/review)       │ ← NEW
└─────────────────────────────────────┘
```

---

## Key Features

### Parsing Page (`/parsing`)
- **Upload PDF documents**
- **Real-time processing status** with stepper UI
- **Stats cards** showing:
  - Total Uploads
  - Successfully Parsed
  - Failed/Corrupted
  - Pending Review
- **Documents table** with:
  - Sort options (Newest first, Oldest first, Alphabetically)
  - View transactions button
  - Delete document button
- **Auto-refresh** after upload completes (no redirect)

### Review Page (`/review?id=<document_id>`)
- **Transaction tables:**
  - Code-extracted transactions
  - LLM-extracted transactions
- **Metadata display:**
  - Bank name
  - Transaction counts
  - Confidence scores
- **Actions:**
  - Approve document
  - Link to account
  - Download JSON
- **Identifier config** (JSON view)

---

## API Endpoints Used

### Parsing Module APIs:
- `POST /documents/verify-type` - Detect PDF type
- `POST /documents/upload` - Upload document
- `GET /documents/status/:id` - Poll processing status
- `GET /documents/stats` - Get statistics
- `GET /documents/recent` - Get recent documents
- `DELETE /documents/:id` - Delete document
- `GET /documents/:id/review` - Get review data
- `POST /documents/:id/approve` - Approve document
- `POST /documents/:id/select-account` - Link account
- `GET /documents/:id/download-json` - Download JSON

---

## Troubleshooting

### Issue: Dependencies not found
**Solution:**
```bash
cd C:\Users\SHREE\MAIN_PROJECT\CATEGORIZATION\kaif\frontend-web
npm install
```

### Issue: API calls failing
**Check:**
1. Parser backend is running
2. API base URL is correct in `PARSING/frontend/src/api/api.js`
3. CORS is configured properly

### Issue: Routing not working
**Check:**
1. React Router is properly configured
2. All routes are wrapped in `<BrowserRouter>`
3. Navigation uses correct paths (`/parsing`, `/review`)

### Issue: Theme not applied
**Check:**
1. CSS variables are defined in Categorization's CSS
2. Light mode class is applied: `document.body.classList.add('light-mode')`

---

## Development Notes

### File Locations:
- **Main App:** `CATEGORIZATION/kaif/frontend-web/src/App.jsx`
- **Parsing Page:** `CATEGORIZATION/kaif/frontend-web/src/pages/Parsing.jsx`
- **Review Page:** `CATEGORIZATION/kaif/frontend-web/src/pages/Review.jsx`
- **Sidebar:** `CATEGORIZATION/kaif/frontend-web/src/components/Sidebar.jsx`
- **API Config:** `PARSING/frontend/src/api/api.js`

### Important:
- Parser module files are still in place but not used as standalone app
- Original Upload.jsx has merged Dashboard functionality
- All authentication goes through Categorization module
- Theme uses CSS variables for consistency

---

## Testing Checklist

- [ ] Login works via Categorization auth
- [ ] Navigation shows all 6 items (Overview, Transactions, Accounts, Analytics, Parsing, Review)
- [ ] Can upload PDF on Parsing page
- [ ] Processing stepper shows correct status
- [ ] Table refreshes after upload (no redirect)
- [ ] Stats cards update correctly
- [ ] Sort dropdown works
- [ ] Can view transactions (navigate to Review)
- [ ] Can delete documents
- [ ] Review page shows transactions
- [ ] Can approve documents
- [ ] Can link accounts
- [ ] Can download JSON
- [ ] Theme is consistent across all pages

---

## Success Criteria

✅ Single unified application
✅ Categorization is main entry point
✅ Parser functionality integrated seamlessly
✅ Consistent UI theme
✅ No duplicate authentication
✅ No duplicate pages
✅ All data preserved
✅ All features working

---

**Last Updated:** 2026-03-26
**Status:** ✅ Integration Complete
