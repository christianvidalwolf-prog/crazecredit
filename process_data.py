import pandas as pd
import json
import os
from datetime import datetime

# Files
CUSTOMERS_FILE = 'Customers (2).xlsx'
LEDGER_FILE = 'Customer Ledger Entries (21).xlsx'
RISK_FILE = 'RISK_PORTFOLIO_800000592007_20260421_0855010.xlsx'
DEBITOR_FILE = 'Default21_04_2026_9_47_15.xlsx'

def process():
    print("Loading datasets...")
    df_customers = pd.read_excel(CUSTOMERS_FILE)
    df_ledger = pd.read_excel(LEDGER_FILE)
    df_risk = pd.read_excel(RISK_FILE)
    # Debitor has a weird header structure
    df_debitor = pd.read_excel(DEBITOR_FILE, header=2)

    # 1. Clean Debitor
    df_debitor = df_debitor[['Nr.', 'Name', 'Kreditlimit (MW)', 'Zahlungsformcode']]
    df_debitor['Nr.'] = df_debitor['Nr.'].astype(str)

    # 2. Prepare Customers
    df_customers['No.'] = df_customers['No.'].astype(str)

    # 3. Join Customers and Debitor (1:1)
    # Use full join to ensure we don't miss anything, but usually they match.
    merged = pd.merge(df_customers, df_debitor, left_on='No.', right_on='Nr.', how='left', suffixes=('', '_deb'))

    # 4. Join Risk Portfolio (Left join by name)
    # Note: Name matching can be tricky, but it's our best bet given the data.
    df_risk['Company name'] = df_risk['Company name'].str.strip()
    merged['Name'] = merged['Name'].str.strip()
    
    merged = pd.merge(merged, df_risk, left_on='Name', right_on='Company name', how='left')

    # 5. Process Ledger Entries (Group by customer for summary stats)
    # For "Gestión de Cobros", we need individual open invoices
    # For "Créditos sin Uso", we need to know if they have any entries
    
    df_ledger['Customer No.'] = df_ledger['Customer No.'].astype(str)
    
    # Open invoices (> 0 remaining amount and Open == 1)
    open_invoices = df_ledger[df_ledger['Open'] == 1].copy()
    
    # Calculate days overdue
    today = datetime(2026, 4, 21)
    open_invoices['Due Date'] = pd.to_datetime(open_invoices['Due Date'])
    open_invoices['Days Overdue'] = (today - open_invoices['Due Date']).dt.days
    
    # Filter for actually overdue (Due Date < Today)
    overdue_invoices = open_invoices[open_invoices['Due Date'] < today]

    # Metrics for "Créditos sin Uso"
    has_billing = df_ledger.groupby('Customer No.').size().reset_index(name='billing_count')
    merged = pd.merge(merged, has_billing, left_on='No.', right_on='Customer No.', how='left')
    merged['billing_count'] = merged['billing_count'].fillna(0)

    # Convert dates to string for JSON
    if 'End date' in merged.columns:
        merged['End date'] = merged['End date'].astype(str).replace('NaT', None)
    
    # Prepare final JSON data
    data = {
        'timestamp': today.strftime('%Y-%m-%d'),
        'customers': merged.to_dict(orient='records'),
        'overdue_invoices': overdue_invoices.to_dict(orient='records'),
        'summary': {
            'total_balance': float(merged['Balance (LCY)'].sum()),
            'overdue_balance': float(merged['Overdue Balance (LCY)'].sum()),
            'secured_limit': float(merged['Amount agreed'].sum()),
            'customer_count': len(merged)
        }
    }

    print("Saving processed data...")
    with open('data.js', 'w') as f:
        f.write("const DASHBOARD_DATA = " + json.dumps(data, indent=2, default=str) + ";")
    
    print("Success! Data saved to data.js")

if __name__ == "__main__":
    process()
