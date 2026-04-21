import pandas as pd
import json
from datetime import datetime

CUSTOMERS_FILE = 'Customers (2).xlsx'
LEDGER_FILE = 'Customer Ledger Entries (21).xlsx'
RISK_FILE = 'RISK_PORTFOLIO_800000592007_20260421_0855010.xlsx'
DEBITOR_FILE = 'Default21_04_2026_9_47_15.xlsx'
SALESPERSON_FILE = 'salesperson.xlsx'

def process():
    print("Loading datasets...")
    df_customers = pd.read_excel(CUSTOMERS_FILE)
    df_ledger = pd.read_excel(LEDGER_FILE)
    df_risk = pd.read_excel(RISK_FILE)
    df_debitor = pd.read_excel(DEBITOR_FILE, header=2)

    # 1. Load Salesperson mapping (Code -> Name)
    df_sp = pd.read_excel(SALESPERSON_FILE, header=None, skiprows=2)
    df_sp.columns = df_sp.iloc[0]
    df_sp = df_sp.iloc[1:].reset_index(drop=True)
    df_sp = df_sp[['Code', 'Name']].dropna(subset=['Code'])
    df_sp['Code'] = df_sp['Code'].astype(int)
    df_sp.rename(columns={'Code': 'sp_code', 'Name': 'Salesperson Name'}, inplace=True)

    # 2. Clean Debitor
    df_debitor = df_debitor[['Nr.', 'Name', 'Kreditlimit (MW)', 'Zahlungsformcode']]
    df_debitor['Nr.'] = df_debitor['Nr.'].astype(str)

    # 3. Prepare Customers
    df_customers['No.'] = df_customers['No.'].astype(str)

    # Add salesperson name via CUSTOMER field (= salesperson code)
    df_customers['sp_code'] = pd.to_numeric(df_customers['CUSTOMER'], errors='coerce').astype('Int64')
    df_customers = pd.merge(df_customers, df_sp, on='sp_code', how='left')
    df_customers['Salesperson Name'] = df_customers['Salesperson Name'].fillna('Unassigned')

    # 4. Join Customers + Debitor
    merged = pd.merge(df_customers, df_debitor, left_on='No.', right_on='Nr.', how='left', suffixes=('', '_deb'))

    # 5. Join Risk Portfolio
    df_risk['Company name'] = df_risk['Company name'].str.strip()
    merged['Name'] = merged['Name'].str.strip()
    merged = pd.merge(merged, df_risk, left_on='Name', right_on='Company name', how='left')

    # 6. Process Ledger Entries
    df_ledger['Customer No.'] = df_ledger['Customer No.'].astype(str)
    today = datetime(2026, 4, 21)

    # Open invoices
    open_invoices = df_ledger[df_ledger['Open'] == 1].copy()
    open_invoices['Due Date'] = pd.to_datetime(open_invoices['Due Date'])
    open_invoices['Confirmed Payment Date'] = pd.to_datetime(open_invoices['Confirmed Payment Date'], errors='coerce')
    open_invoices['Days Overdue'] = (today - open_invoices['Due Date']).dt.days

    # Overdue: Due Date < today AND no confirmed payment date
    overdue_invoices = open_invoices[
        (open_invoices['Due Date'] < today) &
        (open_invoices['Confirmed Payment Date'].isna())
    ].copy()

    # Also collect invoices with confirmed payment (considered "collected")
    confirmed_invoices = open_invoices[
        (open_invoices['Due Date'] < today) &
        (open_invoices['Confirmed Payment Date'].notna())
    ].copy()

    # Add reminder tracking counter (from Last Reminder Date - 0 if null, else count)
    overdue_invoices['reminder_count'] = overdue_invoices['Last Reminder Date'].notna().astype(int)

    # Per-customer overdue summary for the frontend (grouped)
    overdue_by_customer = overdue_invoices.groupby('Customer No.').agg(
        real_overdue_amount=('Remaining Amt. (LCY)', 'sum'),
        overdue_invoice_count=('Document No.', 'count')
    ).reset_index()

    confirmed_by_customer = confirmed_invoices.groupby('Customer No.').agg(
        confirmed_amount=('Remaining Amt. (LCY)', 'sum')
    ).reset_index()

    # Billing count (for unused credits)
    has_billing = df_ledger.groupby('Customer No.').size().reset_index(name='billing_count')
    merged = pd.merge(merged, has_billing, left_on='No.', right_on='Customer No.', how='left')
    merged['billing_count'] = merged['billing_count'].fillna(0)

    # Merge real overdue/confirmed amounts
    merged = pd.merge(merged, overdue_by_customer, left_on='No.', right_on='Customer No.', how='left')
    merged['real_overdue_amount'] = merged['real_overdue_amount'].fillna(0)
    merged['overdue_invoice_count'] = merged['overdue_invoice_count'].fillna(0)

    merged = pd.merge(merged, confirmed_by_customer, left_on='No.', right_on='Customer No.', how='left')
    merged['confirmed_amount'] = merged['confirmed_amount'].fillna(0)

    # Convert dates to string for JSON
    if 'End date' in merged.columns:
        merged['End date'] = merged['End date'].astype(str).replace('NaT', None)

    # Prepare overdue invoices with enriched fields
    customer_sp_map = df_customers.set_index('No.')[['Salesperson Name', 'Responsibility Center']].to_dict('index')

    overdue_records = []
    for _, row in overdue_invoices.iterrows():
        cno = row['Customer No.']
        sp_info = customer_sp_map.get(cno, {})
        overdue_records.append({
            'Customer No.': cno,
            'Customer Name': row.get('Customer Name', ''),
            'Document No.': row.get('Document No.', ''),
            'Document Date': str(row.get('Document Date', ''))[:10],
            'Due Date': str(row.get('Due Date', ''))[:10],
            'Days Overdue': int(row.get('Days Overdue', 0)),
            'Remaining Amt. (LCY)': float(row.get('Remaining Amt. (LCY)', 0) or 0),
            'Payment Method Code': row.get('Payment Method Code', ''),
            'Confirmed Payment Date': str(row.get('Confirmed Payment Date', ''))[:10] if pd.notna(row.get('Confirmed Payment Date')) else None,
            'reminder_count': int(row.get('reminder_count', 0)),
            'Salesperson Name': sp_info.get('Salesperson Name', 'Unassigned'),
            'Responsibility Center': sp_info.get('Responsibility Center', ''),
        })

    # Prepare final JSON
    data = {
        'timestamp': today.strftime('%Y-%m-%d'),
        'customers': merged.to_dict(orient='records'),
        'overdue_invoices': overdue_records,
        'summary': {
            'total_balance': float(merged['Balance (LCY)'].sum()),
            'overdue_balance': float(merged['Overdue Balance (LCY)'].sum()),
            'real_overdue': float(merged['real_overdue_amount'].sum()),
            'secured_limit': float(merged['Amount agreed'].sum() if 'Amount agreed' in merged.columns else 0),
            'customer_count': len(merged)
        }
    }

    print("Saving processed data...")
    with open('data.js', 'w') as f:
        f.write("const DASHBOARD_DATA = " + json.dumps(data, indent=2, default=str) + ";")

    print(f"Success! {len(merged)} customers, {len(overdue_records)} overdue invoices saved to data.js")

if __name__ == "__main__":
    process()
