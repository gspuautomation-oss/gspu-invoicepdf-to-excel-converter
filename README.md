# GSPU Invoice PDF to Excel Converter

A fast, local-only **PDF Invoice & Challan to Excel Converter** built with Node.js, React, AG Grid Community, `pdfjs-dist`, `tesseract.js`, `sharp`, and `exceljs`.

---

## How to Use on Another Computer (Windows / Mac / Linux)

### Step 1: Install Node.js (One-Time Requirement)
On the target computer, make sure **Node.js (v20 or v22 LTS)** is installed:
1. Go to **[https://nodejs.org/](https://nodejs.org/)** and download the **LTS** installer.
2. Run the installer with default settings.

### Step 2: Extract the ZIP File
1. Copy **`GSPU_Invoice_PDF_to_Excel_Converter.zip`** to the other computer (via USB drive, email, or shared folder).
2. Right-click the `.zip` file and select **Extract All...** into any folder (for example, `C:\GSPU-Invoice-Converter`).

### Step 3: Start the Application

#### Option A: One-Click Windows Startup (Recommended)
- Open the extracted folder and double-click **`START_APP.bat`**.
- **First Run Only**: It will automatically run `npm install` to download the local packages into `node_modules` (requires internet only the very first time).
- **Every Run After**: Works **100% offline**! It starts the local server at `http://localhost:3000` and automatically opens your web browser.

#### Option B: Using Command Prompt / PowerShell / Terminal
Open a terminal inside the extracted folder and run:

```bash
# 1. Install dependencies (only needed once on the new system)
npm install

# 2. Start the application
npm start
```

Then open **http://localhost:3000** in Chrome, Edge, or any modern browser.

---

## Core Workflow

1. **Upload PDFs**: Select or drag & drop up to **20 PDF files** at once (supports GST/VAT/TRN invoices, EPFO Challans, ESIC Challans, ESIC D&I statements, and scanned PDFs).
2. **Extract Data**: Click the blue arrow button (`→`) to extract all fields into horizontal columns and corresponding PDF rows in the consolidated sheet.
3. **Edit & Verify**: Review and edit any cell directly in the spreadsheet editor, preview original PDFs (`Eye` icon), undo/redo, or filter rows.
4. **Download Consolidated Excel**: Click the green/teal download button to save **`Invoice_Extracted_Data.xlsx`** containing all uploaded PDFs in a single **`Invoice Details`** worksheet.
