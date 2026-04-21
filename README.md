# Craze Credit - Financial & Risk Dashboard (Live)

This project is an expert financial and risk management application designed to consolidate data from multiple ERP sources (Business Central / Navision) and risk providers (Risk Portfolio).

## 🚀 Features

- **Premium Design**: Modern dark-mode interface inspired by "DEbt Hunter".
- **Automated Consolidation**: Processing script that joins Customer, Ledger Entries, Risk Portfolio, and Internal Limit data.
- **Business Modules**:
    - **Limit Management**: Renewal alerts and expansion proposals based on usage.
    - **Risk Control**: Audit discrepancies between internal systems and credit insurance.
    - **Commercial Analytics**: Risk overview by sales manager and debt collection panels.

## 🛠️ Project Structure

```text
├── Customers (2).xlsx         # Customer master data
├── Customer Ledger... .xlsx   # Ledger entries (invoices)
├── RISK_PORTFOLIO... .xlsx    # External risk coverage
├── Default... .xlsx           # Internal system limits (BC)
├── process_data.py            # Data processing script (Python)
├── data.js                    # Processed data for the frontend
├── index.html                 # Main UI entry point
├── style.css                  # Dashboard styles
└── app.js                     # Frontend application logic
```

## 📋 Requirements

- Python 3.9+
- `pandas` and `openpyxl` libraries for initial processing.

## 🖥️ Getting Started

1. **Process the Data**:
   If you update the Excel files, run the script to regenerate the dashboard database:
   ```bash
   python3 process_data.py
   ```

2. **View the Dashboard**:
   Simply open the `index.html` file in any modern web browser.

## ✒️ Author
Project developed by **Christian Vidal Wolf**.
