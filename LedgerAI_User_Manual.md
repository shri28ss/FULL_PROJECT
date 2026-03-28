# LedgerAI User Manual
**Version 1.0**

## 1. Introduction
LedgerAI is an advanced document processing and financial management platform that uses AI to extract transactions from bank statements and categorize them automatically.

---

## 2. Getting Started
### 2.1 Accessing the Application
1.  Open your browser and navigate to your **Vercel URL**.
2.  You will be greeted by the **Welcome Back** screen.

### 2.2 Login and Registration
*   **Login**: Enter your registered email and password on the landing page.
*   **Register**: If you don't have an account, click **"Register"** at the bottom to create a new profile.

**[IMAGE: Login Screen]**

---

## 3. Dashboard Overview
Once logged in, the **Overview** screen provides a bird’s-eye view of your financial health.

*   **Total Balance**: Shows the combined balance of all your connected accounts.
*   **Recent Activity**: A list of the latest transactions processed by the AI.
*   **Spending Analytics**: Quick charts showing your top spending categories.

**[IMAGE: Dashboard/Overview Screen]**

---

## 4. PDF Parsing & Extraction
This is the most important part of LedgerAI. It allows you to turn a PDF bank statement into organized data.

### 4.1 Navigating to Parsing
1.  On the left sidebar, click the **"Parsing"** tab.
2.  You will see the **"Extract PDF"** interface.

### 4.2 Uploading a Document
1.  Click the **Upload Box** or drag your PDF bank statement into it.
2.  The system will automatically attempt to **detect the PDF type** (e.g., SBI, HDFC, ICICI).
3.  Once the type is confirmed, click the **"UPLOAD & START EXTRACTION"** button.

### 4.3 Extraction Status
*   You can monitor the status in the cards below (**Total Uploads**, **Successfully Parsed**, **Failed/Corrupted**).
*   The table at the bottom shows the history of your uploaded documents.

**[IMAGE: Parsing Screen with Uploaded PDF]**

---

## 5. Reviewing & Categorization
After the AI extracts the data, you must review it for accuracy.

1.  Click the **"Review"** tab in the sidebar.
2.  Select the document you just processed.
3.  You will see a table of extracted transactions with their **Date**, **Description**, **Amount**, and **Category**.
4.  **Confirm Categories**: If the AI categorizes something incorrectly, you can manually select a new category from the dropdown.

**[IMAGE: Review Screen showing categories]**

---

## 6. Transactions & Analytics
### 6.1 Transaction List
The **Transactions** tab allows you to search, filter, and export your entire transaction history across all accounts.

### 6.2 Visual Insights (Analytics)
Navigate to the **Analytics** tab to see advanced charts:
*   Monthly spending trends.
*   Category-wise breakdown (Food, Rent, Shopping, etc.).
*   Income vs. Expense ratio.

**[IMAGE: Analytics Charts]**

---

## 7. Account Management
In the **Accounts** tab, you can:
*   Add new bank accounts manually.
*   Connect existing accounts to specific parsed documents.
*   View account-specific balances and history.

---

## 8. Troubleshooting Tips
*   **CORS Errors**: If you see a "Failed to connect" error, ensure your backend ALLOW_ORIGINS includes your current URL.
*   **PDF Detection Failed**: Ensure the PDF is a text-based bank statement and not a scanned image.
*   **Environment Variables**: Double-check `VITE_API_BASE_URL` in Vercel to ensure it points to your Render backend.

---

**End of Manual**
