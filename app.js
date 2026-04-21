// State management
let currentModule = 'general';
let selectedCommercial = 'all';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    populateCommercialFilter();
    updateKPIs();
    renderModule();
});

function populateCommercialFilter() {
    const filter = document.getElementById('commercial-filter');
    const centers = [...new Set(DASHBOARD_DATA.customers.map(c => c['Responsibility Center']).filter(Boolean))];
    centers.sort().forEach(center => {
        const option = document.createElement('option');
        option.value = center;
        option.textContent = center;
        filter.appendChild(option);
    });
}

function updateKPIs(filteredData = DASHBOARD_DATA.customers) {
    const totalBalance = filteredData.reduce((sum, c) => sum + (c['Balance (LCY)'] || 0), 0);
    const overdueBalance = filteredData.reduce((sum, c) => sum + (c['Overdue Balance (LCY)'] || 0), 0);
    const securedCredit = filteredData.reduce((sum, c) => sum + (c['Amount agreed'] || 0), 0);
    
    // Near renewals (next 60 days or recently expired)
    const today = new Date('2026-04-21');
    const sixtyDaysLater = new Date(today);
    sixtyDaysLater.setDate(today.getDate() + 60);
    
    const renewals = filteredData.filter(c => {
        if (!c['End date']) return false;
        const endDate = new Date(c['End date']);
        return endDate <= sixtyDaysLater;
    }).length;

    document.getElementById('kpi-total-balance').textContent = formatCurrency(totalBalance);
    document.getElementById('kpi-overdue-balance').textContent = formatCurrency(overdueBalance);
    document.getElementById('kpi-secured-credit').textContent = formatCurrency(securedCredit);
    document.getElementById('kpi-upcoming-renewals').textContent = renewals;
}

function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(val);
}

function showModule(mod) {
    currentModule = mod;
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    event.currentTarget.classList.add('active');
    renderModule();
}

function applyFilters() {
    selectedCommercial = document.getElementById('commercial-filter').value;
    renderModule();
}

function getFilteredCustomers() {
    return DASHBOARD_DATA.customers.filter(c => 
        selectedCommercial === 'all' || c['Responsibility Center'] === selectedCommercial
    );
}

function renderModule() {
    const container = document.getElementById('dynamic-content');
    const filtered = getFilteredCustomers();
    updateKPIs(filtered);

    let html = '';

    switch(currentModule) {
        case 'general':
            html = renderGeneralModule(filtered);
            break;
        case 'limits':
            html = renderLimitsModule(filtered);
            break;
        case 'risk':
            html = renderRiskModule(filtered);
            break;
        case 'commercial':
            html = renderCommercialModule(filtered);
            break;
    }

    container.innerHTML = html;
    lucide.createIcons();
}

function renderGeneralModule(data) {
    return `
        <div class="module-grid">
            <div class="table-card">
                <div class="table-header">
                    <h3>Critical Risk Alerts</h3>
                    <span class="badge badge-danger">${data.filter(c => c['Overdue Balance (LCY)'] > 10000).length} Cases</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>CUSTOMER</th>
                                <th>BALANCE</th>
                                <th>OVERDUE</th>
                                <th>MANAGER</th>
                                <th>STATUS</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.filter(c => c['Overdue Balance (LCY)'] > 0).slice(0, 10).map(c => `
                                <tr>
                                    <td><strong>${c.Name}</strong><br><small>${c['No.']}</small></td>
                                    <td>${formatCurrency(c['Balance (LCY)'])}</td>
                                    <td class="text-danger">${formatCurrency(c['Overdue Balance (LCY)'])}</td>
                                    <td>${c['Responsibility Center'] || '-'}</td>
                                    <td><span class="badge ${c['Overdue Balance (LCY)'] > 5000 ? 'badge-danger' : 'badge-warning'}">Risk</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderLimitsModule(data) {
    const today = new Date('2026-04-21');
    const renewals = data.filter(c => c['End date']).sort((a,b) => new Date(a['End date']) - new Date(b['End date']));
    
    // Proposals: Balance > 80% Agreed
    const proposals = data.filter(c => c['Amount agreed'] > 0 && (c['Balance (LCY)'] / c['Amount agreed']) > 0.8);

    return `
        <div class="module-grid">
            <div class="table-card" style="grid-column: span 1;">
                <div class="table-header"><h3>Renewal Alerts</h3></div>
                <div class="table-container" style="padding: 1rem;">
                    ${renewals.slice(0, 8).map(c => `
                        <div class="alert-item ${new Date(c['End date']) < today ? 'critical' : 'warning'}">
                            <div>
                                <strong>${c.Name}</strong><br>
                                <small>Expiry: ${c['End date']}</small>
                            </div>
                            <span class="badge ${new Date(c['End date']) < today ? 'badge-danger' : 'badge-warning'}">
                                ${new Date(c['End date']) < today ? 'Expired' : 'Upcoming'}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="table-card" style="grid-column: span 1;">
                <div class="table-header"><h3>Expansion Proposals (>80% usage)</h3></div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>CUSTOMER</th><th>USAGE %</th><th>ACTION</th></tr>
                        </thead>
                        <tbody>
                            ${proposals.map(c => `
                                <tr>
                                    <td>${c.Name}</td>
                                    <td class="text-warning">${Math.round((c['Balance (LCY)'] / c['Amount agreed']) * 100)}%</td>
                                    <td><button style="background:var(--primary); border:none; color:white; padding:4px 8px; border-radius:4px; font-size:10px;">REVIEW</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderRiskModule(data) {
    // Audit: Kreditlimit (MW) != Amount agreed
    const discrepancies = data.filter(c => c['Kreditlimit (MW)'] !== undefined && c['Amount agreed'] !== undefined && Math.abs(c['Kreditlimit (MW)'] - c['Amount agreed']) > 1);

    // Direct Risk: Limit 0, Balance > 0, No MARKANT
    const directRisk = data.filter(c => (c['Kreditlimit (MW)'] || 0) === 0 && c['Balance (LCY)'] > 0 && c['Zahlungsformcode'] !== 'MARKANT');

    return `
        <div class="module-grid">
            <div class="table-card">
                <div class="table-header"><h3>Internal Limit vs Risk Portfolio Audit</h3></div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>CUSTOMER</th><th>BC LIMIT</th><th>SECURED</th><th>DIFFERENCE</th></tr>
                        </thead>
                        <tbody>
                            ${discrepancies.slice(0, 10).map(c => `
                                <tr>
                                    <td>${c.Name}</td>
                                    <td>${formatCurrency(c['Kreditlimit (MW)'] || 0)}</td>
                                    <td>${formatCurrency(c['Amount agreed'] || 0)}</td>
                                    <td class="text-danger">${formatCurrency((c['Kreditlimit (MW)'] || 0) - (c['Amount agreed'] || 0))}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="table-card">
                <div class="table-header"><h3>Direct Risk (Unsecured / Non-Markant)</h3></div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>CUSTOMER</th><th>BALANCE</th><th>PAYMENT</th><th>RISK</th></tr>
                        </thead>
                        <tbody>
                            ${directRisk.slice(0, 10).map(c => `
                                <tr>
                                    <td>${c.Name}</td>
                                    <td>${formatCurrency(c['Balance (LCY)'])}</td>
                                    <td>${c.Zahlungsformcode}</td>
                                    <td><span class="badge badge-danger">Critical</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="table-card">
                <div class="table-header"><h3>Unused Credits (New Customers)</h3></div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>CUSTOMER</th><th>AGREED LIMIT</th><th>BILLING</th><th>STATUS</th></tr>
                        </thead>
                        <tbody>
                            ${data.filter(c => c['Amount agreed'] > 0 && c['billing_count'] === 0).slice(0, 10).map(c => `
                                <tr>
                                    <td>${c.Name}</td>
                                    <td>${formatCurrency(c['Amount agreed'])}</td>
                                    <td>No records</td>
                                    <td><span class="badge badge-warning">Unused</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderCommercialModule(data) {
    // Group by Commercial
    const stats = {};
    data.forEach(c => {
        const rc = c['Responsibility Center'] || 'Unassigned';
        if (!stats[rc]) stats[rc] = { balance: 0, overdue: 0, count: 0 };
        stats[rc].balance += (c['Balance (LCY)'] || 0);
        stats[rc].overdue += (c['Overdue Balance (LCY)'] || 0);
        stats[rc].count++;
    });

    // Overdue Invoices
    const overdueBills = DASHBOARD_DATA.overdue_invoices.filter(inv => 
        selectedCommercial === 'all' || data.some(c => c['No.'] === inv['Customer No.'])
    );

    return `
        <div class="module-grid">
            <div class="table-card">
                <div class="table-header"><h3>Risk by Sales Manager</h3></div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>MANAGER</th><th>CUSTOMERS</th><th>TOTAL BALANCE</th><th>OVERDUE DEBT</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(stats).map(([name, s]) => `
                                <tr>
                                    <td>${name}</td>
                                    <td>${s.count}</td>
                                    <td>${formatCurrency(s.balance)}</td>
                                    <td class="text-danger">${formatCurrency(s.overdue)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="table-card">
                <div class="table-header"><h3>Debt Collection (Overdue Invoices)</h3></div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>CUSTOMER</th><th>INVOICE</th><th>DUE DATE</th><th>DAYS</th><th>AMOUNT</th></tr>
                        </thead>
                        <tbody>
                            ${overdueBills.slice(0, 15).map(inv => `
                                <tr>
                                    <td>${inv['Customer Name'] || inv['Customer No.']}</td>
                                    <td>${inv['Document No.']}</td>
                                    <td>${new Date(inv['Due Date']).toLocaleDateString()}</td>
                                    <td class="text-danger">${inv['Days Overdue']} d</td>
                                    <td>${formatCurrency(inv['Remaining Amt. (LCY)'])}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}
