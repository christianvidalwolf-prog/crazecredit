// ─── State ────────────────────────────────────────────────────────────────────
let currentModule = 'general';
let selectedSalesperson = 'all';
// Persistent management notes: { customerId: { status, notes, reminders } }
let mgmtState = JSON.parse(localStorage.getItem('craze_mgmt') || '{}');
// Expanded rows for invoice detail dropdowns
let expandedRows = new Set();

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    populateSalespersonFilter();
    updateKPIs();
    renderModule();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(val) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val || 0);
}

function paymentBadge(code) {
    if (!code) return '<span class="badge badge-neutral">—</span>';
    const cls = code === 'MARKANT' ? 'badge-markant' : code === 'EDEKA' ? 'badge-edeka' : 'badge-transfer';
    return `<span class="badge ${cls}">${code}</span>`;
}

function saveMgmt() {
    localStorage.setItem('craze_mgmt', JSON.stringify(mgmtState));
}

function getMgmt(id) {
    if (!mgmtState[id]) mgmtState[id] = { status: '', notes: '', reminders: 0, responses: '' };
    return mgmtState[id];
}

// ─── Filter ───────────────────────────────────────────────────────────────────
function populateSalespersonFilter() {
    const filter = document.getElementById('commercial-filter');
    const names = [...new Set(DASHBOARD_DATA.customers.map(c => c['Salesperson Name']).filter(Boolean))];
    names.sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        filter.appendChild(opt);
    });
}

function applyFilters() {
    selectedSalesperson = document.getElementById('commercial-filter').value;
    expandedRows.clear();
    renderModule();
}

function getFilteredCustomers() {
    return DASHBOARD_DATA.customers.filter(c =>
        selectedSalesperson === 'all' || c['Salesperson Name'] === selectedSalesperson
    );
}

function getFilteredOverdueInvoices(filtered) {
    const ids = new Set(filtered.map(c => String(c['No.'])));
    return DASHBOARD_DATA.overdue_invoices.filter(inv => ids.has(String(inv['Customer No.'])));
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function updateKPIs(filteredData = DASHBOARD_DATA.customers) {
    const totalBalance = filteredData.reduce((s, c) => s + (c['Balance (LCY)'] || 0), 0);
    const overdueBalance = filteredData.reduce((s, c) => s + (c['real_overdue_amount'] || 0), 0);
    const securedCredit = filteredData.reduce((s, c) => s + (c['Amount agreed'] || 0), 0);

    const today = new Date('2026-04-21');
    const in60 = new Date(today);
    in60.setDate(today.getDate() + 60);
    const renewals = filteredData.filter(c => {
        if (!c['End date'] || c['End date'] === 'NaT') return false;
        const d = new Date(c['End date']);
        return d <= in60;
    }).length;

    document.getElementById('kpi-total-balance').textContent = formatCurrency(totalBalance);
    document.getElementById('kpi-overdue-balance').textContent = formatCurrency(overdueBalance);
    document.getElementById('kpi-secured-credit').textContent = formatCurrency(securedCredit);
    document.getElementById('kpi-upcoming-renewals').textContent = renewals;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function showModule(mod, el) {
    currentModule = mod;
    expandedRows.clear();
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    el.classList.add('active');
    renderModule();
}

function renderModule() {
    const container = document.getElementById('dynamic-content');
    const filtered = getFilteredCustomers();
    updateKPIs(filtered);

    const titles = {
        general: 'Overview · Critical Risks',
        limits: 'Limits · Renewals & Capacity',
        risk: 'Risk · Unsecured Exposure',
        commercial: 'Analytics · By Salesperson',
        cobros: 'Collections · Overdue Management',
        creditscan: 'Credit Scanner · Transfer Clients',
    };
    document.getElementById('module-title-display').textContent = titles[currentModule] || 'Dashboard';

    switch (currentModule) {
        case 'general':    container.innerHTML = renderGeneralModule(filtered); break;
        case 'limits':     container.innerHTML = renderLimitsModule(filtered); break;
        case 'risk':       container.innerHTML = renderRiskModule(filtered); break;
        case 'commercial': container.innerHTML = renderCommercialModule(filtered); break;
        case 'cobros':     container.innerHTML = renderCobrosModule(filtered); break;
        case 'creditscan': container.innerHTML = renderCreditScanModule(filtered); break;
    }
    lucide.createIcons();
}

// ─── Toggle invoice detail row ────────────────────────────────────────────────
function toggleInvoiceDetail(customerId) {
    if (expandedRows.has(customerId)) {
        expandedRows.delete(customerId);
    } else {
        expandedRows.add(customerId);
    }
    renderModule();
}

function invoiceDetailRow(customerId, colSpan) {
    const invoices = DASHBOARD_DATA.overdue_invoices.filter(
        inv => String(inv['Customer No.']) === String(customerId)
    );
    if (!invoices.length) return '';
    const rows = invoices.map(inv => `
        <tr class="invoice-detail-row">
            <td>${inv['Document No.']}</td>
            <td>${inv['Document Date'] || '—'}</td>
            <td>${inv['Due Date'] || '—'}</td>
            <td class="text-danger">${inv['Days Overdue']}d</td>
            <td>${formatCurrency(inv['Remaining Amt. (LCY)'])}</td>
            <td>${paymentBadge(inv['Payment Method Code'])}</td>
        </tr>
    `).join('');
    return `
        <tr>
            <td colspan="${colSpan}" style="padding:0; background:var(--bg-deep);">
                <div class="invoice-detail-panel">
                    <table class="invoice-detail-table">
                        <thead>
                            <tr>
                                <th>INVOICE NO.</th><th>ISSUE DATE</th><th>DUE DATE</th>
                                <th>DAYS OVERDUE</th><th>AMOUNT</th><th>PAYMENT</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </td>
        </tr>
    `;
}

// ─── Management state controls ────────────────────────────────────────────────
function updateMgmtStatus(id, val) {
    getMgmt(id).status = val;
    saveMgmt();
}
function updateMgmtNotes(id, val) {
    getMgmt(id).notes = val;
    saveMgmt();
}
function incrementReminder(id) {
    getMgmt(id).reminders = (getMgmt(id).reminders || 0) + 1;
    saveMgmt();
    renderModule();
}
function updateResponse(id, val) {
    getMgmt(id).responses = val;
    saveMgmt();
}

// ─── MODULE: General ─────────────────────────────────────────────────────────
function renderGeneralModule(data) {
    const critical = data.filter(c => (c['real_overdue_amount'] || 0) > 0)
        .sort((a, b) => (b['real_overdue_amount'] || 0) - (a['real_overdue_amount'] || 0))
        .slice(0, 20);

    const rows = critical.map(c => {
        const id = c['No.'];
        const expanded = expandedRows.has(id);
        return `
            <tr class="clickable-row" onclick="toggleInvoiceDetail('${id}')">
                <td>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <i data-lucide="${expanded ? 'chevron-down' : 'chevron-right'}" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0;"></i>
                        <div><strong>${c.Name}</strong><br><small style="color:var(--text-muted)">${id}</small></div>
                    </div>
                </td>
                <td>${formatCurrency(c['Balance (LCY)'])}</td>
                <td class="text-danger" style="cursor:pointer;font-weight:600;">${formatCurrency(c['real_overdue_amount'])}</td>
                <td>${paymentBadge(c['Zahlungsformcode'])}</td>
                <td>${c['Salesperson Name'] || '—'}</td>
                <td><span class="badge ${(c['real_overdue_amount'] || 0) > 5000 ? 'badge-danger' : 'badge-warning'}">
                    ${(c['overdue_invoice_count'] || 0)} invoices
                </span></td>
            </tr>
            ${expanded ? invoiceDetailRow(id, 6) : ''}
        `;
    }).join('');

    return `
        <div class="module-grid">
            <div class="table-card">
                <div class="table-header">
                    <h3>Critical Risk Alerts · Real Overdue (excl. confirmed payments)</h3>
                    <span class="badge badge-danger">${critical.length} Clients</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr>
                            <th>CUSTOMER</th><th>BALANCE</th><th>REAL OVERDUE ▼</th>
                            <th>PAYMENT METHOD</th><th>SALESPERSON</th><th>INVOICES</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ─── MODULE: Limits ───────────────────────────────────────────────────────────
function renderLimitsModule(data) {
    const today = new Date('2026-04-21');
    const renewals = data.filter(c => c['End date'] && c['End date'] !== 'NaT')
        .sort((a, b) => new Date(a['End date']) - new Date(b['End date']));
    const proposals = data.filter(c => c['Amount agreed'] > 0 && (c['Balance (LCY)'] / c['Amount agreed']) > 0.8);

    return `
        <div class="module-grid">
            <div class="table-card" style="grid-column:span 1;">
                <div class="table-header"><h3>Renewal Alerts</h3>
                    <span class="badge badge-warning">${renewals.length}</span>
                </div>
                <div class="table-container" style="padding:1rem;">
                    ${renewals.slice(0, 12).map(c => `
                        <div class="alert-item ${new Date(c['End date']) < today ? 'critical' : 'warning'}">
                            <div>
                                <strong>${c.Name}</strong><br>
                                <small>Expiry: ${c['End date']} · ${paymentBadge(c['Zahlungsformcode'])} · ${c['Salesperson Name'] || '—'}</small>
                            </div>
                            <span class="badge ${new Date(c['End date']) < today ? 'badge-danger' : 'badge-warning'}">
                                ${new Date(c['End date']) < today ? 'Expired' : 'Upcoming'}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="table-card" style="grid-column:span 1;">
                <div class="table-header"><h3>Expansion Proposals (&gt;80% usage)</h3></div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>CUSTOMER</th><th>PAYMENT</th><th>SALESPERSON</th><th>USAGE %</th><th>ACTION</th></tr></thead>
                        <tbody>
                            ${proposals.map(c => `
                                <tr>
                                    <td>${c.Name}</td>
                                    <td>${paymentBadge(c['Zahlungsformcode'])}</td>
                                    <td>${c['Salesperson Name'] || '—'}</td>
                                    <td class="text-warning">${Math.round((c['Balance (LCY)'] / c['Amount agreed']) * 100)}%</td>
                                    <td><button class="btn-action">REVIEW</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ─── MODULE: Risk ─────────────────────────────────────────────────────────────
function renderRiskModule(data) {
    const discrepancies = data.filter(c =>
        c['Kreditlimit (MW)'] != null && c['Amount agreed'] != null &&
        Math.abs((c['Kreditlimit (MW)'] || 0) - (c['Amount agreed'] || 0)) > 1
    );

    // Direct risk: no credit limit, has balance, NOT MARKANT/EDEKA (confirming/secure)
    const directRisk = data.filter(c =>
        (c['Kreditlimit (MW)'] || 0) === 0 &&
        c['Balance (LCY)'] > 0 &&
        c['Zahlungsformcode'] !== 'MARKANT' &&
        c['Zahlungsformcode'] !== 'EDEKA'
    );

    // Clients with active sales (Balance > 0), payment = TRANSFER, no credit insurance
    const transferNoInsurance = data.filter(c =>
        c['Zahlungsformcode'] === 'TRANSFER' &&
        c['Balance (LCY)'] > 0 &&
        !(c['Amount agreed'] > 0)
    );

    // Expired credits: End date exists and > 2 years ago
    const twoYearsAgo = new Date('2024-04-21');
    const expiredCredits = data.filter(c => {
        if (!c['End date'] || c['End date'] === 'NaT') return false;
        return new Date(c['End date']) < twoYearsAgo;
    });

    return `
        <div class="module-grid">
            <div class="table-card">
                <div class="table-header">
                    <h3>Internal Limit vs Risk Portfolio Audit</h3>
                    <span class="badge badge-warning">${discrepancies.length}</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>CUSTOMER</th><th>PAYMENT</th><th>SALESPERSON</th><th>BC LIMIT</th><th>SECURED</th><th>DIFFERENCE</th></tr></thead>
                        <tbody>
                            ${discrepancies.slice(0, 15).map(c => `
                                <tr>
                                    <td>${c.Name}</td>
                                    <td>${paymentBadge(c['Zahlungsformcode'])}</td>
                                    <td>${c['Salesperson Name'] || '—'}</td>
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
                <div class="table-header">
                    <h3>Direct Risk · Unsecured Non-Confirming Clients</h3>
                    <span class="badge badge-danger">${directRisk.length}</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>CUSTOMER</th><th>PAYMENT</th><th>SALESPERSON</th><th>BALANCE</th><th>RISK</th></tr></thead>
                        <tbody>
                            ${directRisk.slice(0, 15).map(c => `
                                <tr>
                                    <td>${c.Name}</td>
                                    <td>${paymentBadge(c['Zahlungsformcode'])}</td>
                                    <td>${c['Salesperson Name'] || '—'}</td>
                                    <td>${formatCurrency(c['Balance (LCY)'])}</td>
                                    <td><span class="badge badge-danger">Critical</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="table-card">
                <div class="table-header">
                    <h3>Transfer Clients with Active Sales · No Credit Insurance</h3>
                    <span class="badge badge-warning">${transferNoInsurance.length}</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>CUSTOMER</th><th>SALESPERSON</th><th>BALANCE</th><th>INSURANCE STATUS</th><th>ACTION</th></tr></thead>
                        <tbody>
                            ${transferNoInsurance.slice(0, 20).map(c => {
                                const m = getMgmt(c['No.']);
                                return `
                                <tr>
                                    <td>${c.Name}<br><small style="color:var(--text-muted)">${c['No.']}</small></td>
                                    <td>${c['Salesperson Name'] || '—'}</td>
                                    <td>${formatCurrency(c['Balance (LCY)'])}</td>
                                    <td><span class="badge badge-danger">Not requested</span></td>
                                    <td>
                                        <select class="mgmt-select" onchange="updateMgmtStatus('${c['No.']}', this.value)">
                                            <option value="" ${!m.status ? 'selected' : ''}>— Action —</option>
                                            <option value="request_insurance" ${m.status === 'request_insurance' ? 'selected' : ''}>Request Insurance</option>
                                            <option value="contact_commercial" ${m.status === 'contact_commercial' ? 'selected' : ''}>Contact Commercial</option>
                                            <option value="no_action" ${m.status === 'no_action' ? 'selected' : ''}>No Action</option>
                                        </select>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="table-card">
                <div class="table-header">
                    <h3>Expired Credits · &gt;2 Years Without Update</h3>
                    <span class="badge badge-danger">${expiredCredits.length}</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>CUSTOMER</th><th>PAYMENT</th><th>SALESPERSON</th><th>EXPIRED ON</th><th>SECURED LIMIT</th><th>ACTION</th></tr></thead>
                        <tbody>
                            ${expiredCredits.slice(0, 15).map(c => {
                                const m = getMgmt('exp_' + c['No.']);
                                return `
                                <tr>
                                    <td>${c.Name}</td>
                                    <td>${paymentBadge(c['Zahlungsformcode'])}</td>
                                    <td>${c['Salesperson Name'] || '—'}</td>
                                    <td class="text-danger">${c['End date']}</td>
                                    <td>${formatCurrency(c['Amount agreed'] || 0)}</td>
                                    <td>
                                        <select class="mgmt-select" onchange="updateMgmtStatus('exp_${c['No.']}', this.value)">
                                            <option value="" ${!m.status ? 'selected' : ''}>— Decide —</option>
                                            <option value="renew" ${m.status === 'renew' ? 'selected' : ''}>Request Renewal</option>
                                            <option value="contact_commercial" ${m.status === 'contact_commercial' ? 'selected' : ''}>Reactivate via Commercial</option>
                                            <option value="close" ${m.status === 'close' ? 'selected' : ''}>Do Not Renew</option>
                                        </select>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="table-card">
                <div class="table-header"><h3>Unused Credits · No Billing Activity</h3></div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>CUSTOMER</th><th>PAYMENT</th><th>SALESPERSON</th><th>AGREED LIMIT</th><th>STATUS</th></tr></thead>
                        <tbody>
                            ${data.filter(c => c['Amount agreed'] > 0 && c['billing_count'] === 0).slice(0, 10).map(c => `
                                <tr>
                                    <td>${c.Name}</td>
                                    <td>${paymentBadge(c['Zahlungsformcode'])}</td>
                                    <td>${c['Salesperson Name'] || '—'}</td>
                                    <td>${formatCurrency(c['Amount agreed'])}</td>
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

// ─── MODULE: Commercial / Analytics ──────────────────────────────────────────
function renderCommercialModule(data) {
    const stats = {};
    data.forEach(c => {
        const sp = c['Salesperson Name'] || 'Unassigned';
        if (!stats[sp]) stats[sp] = { balance: 0, overdue: 0, real_overdue: 0, count: 0 };
        stats[sp].balance += (c['Balance (LCY)'] || 0);
        stats[sp].overdue += (c['Overdue Balance (LCY)'] || 0);
        stats[sp].real_overdue += (c['real_overdue_amount'] || 0);
        stats[sp].count++;
    });

    const spRows = Object.entries(stats)
        .sort((a, b) => b[1].real_overdue - a[1].real_overdue)
        .map(([name, s]) => `
            <tr>
                <td><strong>${name}</strong></td>
                <td>${s.count}</td>
                <td>${formatCurrency(s.balance)}</td>
                <td class="text-warning">${formatCurrency(s.overdue)}</td>
                <td class="text-danger"><strong>${formatCurrency(s.real_overdue)}</strong></td>
            </tr>
        `).join('');

    // Top overdue clients per salesperson (drill-down)
    const topClients = data
        .filter(c => (c['real_overdue_amount'] || 0) > 0)
        .sort((a, b) => (b['real_overdue_amount'] || 0) - (a['real_overdue_amount'] || 0))
        .slice(0, 20);

    const clientRows = topClients.map(c => {
        const id = c['No.'];
        const expanded = expandedRows.has(id);
        return `
            <tr class="clickable-row" onclick="toggleInvoiceDetail('${id}')">
                <td>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <i data-lucide="${expanded ? 'chevron-down' : 'chevron-right'}" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0;"></i>
                        <div><strong>${c.Name}</strong><br><small style="color:var(--text-muted)">${id}</small></div>
                    </div>
                </td>
                <td>${paymentBadge(c['Zahlungsformcode'])}</td>
                <td>${c['Salesperson Name'] || '—'}</td>
                <td class="text-danger">${formatCurrency(c['real_overdue_amount'])}</td>
                <td>${c['overdue_invoice_count'] || 0}</td>
            </tr>
            ${expanded ? invoiceDetailRow(id, 5) : ''}
        `;
    }).join('');

    return `
        <div class="module-grid">
            <div class="table-card">
                <div class="table-header"><h3>Risk by Salesperson</h3></div>
                <div class="table-container">
                    <table>
                        <thead><tr>
                            <th>SALESPERSON</th><th>CLIENTS</th><th>TOTAL BALANCE</th>
                            <th>GROSS OVERDUE</th><th>REAL OVERDUE</th>
                        </tr></thead>
                        <tbody>${spRows}</tbody>
                    </table>
                </div>
            </div>
            <div class="table-card">
                <div class="table-header">
                    <h3>Top Overdue Clients · Click to expand invoices</h3>
                    <span class="badge badge-danger">${topClients.length} clients</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr>
                            <th>CUSTOMER</th><th>PAYMENT METHOD</th><th>SALESPERSON</th>
                            <th>REAL OVERDUE</th><th>INVOICES</th>
                        </tr></thead>
                        <tbody>${clientRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ─── MODULE: Collections / Cobros ────────────────────────────────────────────
function renderCobrosModule(filtered) {
    const invoices = getFilteredOverdueInvoices(filtered);

    // Group by customer
    const byCustomer = {};
    invoices.forEach(inv => {
        const key = inv['Customer No.'];
        if (!byCustomer[key]) byCustomer[key] = {
            name: inv['Customer Name'] || key,
            salesperson: inv['Salesperson Name'] || '—',
            payment: inv['Payment Method Code'] || '',
            total: 0,
            invoices: []
        };
        byCustomer[key].total += inv['Remaining Amt. (LCY)'] || 0;
        byCustomer[key].invoices.push(inv);
    });

    const customers = Object.entries(byCustomer)
        .sort((a, b) => b[1].total - a[1].total);

    const rows = customers.map(([cid, info]) => {
        const expanded = expandedRows.has(cid);
        const m = getMgmt(cid);

        const invRows = info.invoices.map(inv => `
            <tr class="invoice-detail-row">
                <td>${inv['Document No.']}</td>
                <td>${inv['Document Date'] || '—'}</td>
                <td>${inv['Due Date'] || '—'}</td>
                <td class="text-danger">${inv['Days Overdue']}d</td>
                <td>${formatCurrency(inv['Remaining Amt. (LCY)'])}</td>
                <td>${paymentBadge(inv['Payment Method Code'])}</td>
            </tr>
        `).join('');

        const detailPanel = expanded ? `
            <tr>
                <td colspan="7" style="padding:0; background:var(--bg-deep);">
                    <div class="invoice-detail-panel">
                        <table class="invoice-detail-table">
                            <thead><tr>
                                <th>INVOICE NO.</th><th>ISSUE DATE</th><th>DUE DATE</th>
                                <th>DAYS OVERDUE</th><th>AMOUNT</th><th>PAYMENT</th>
                            </tr></thead>
                            <tbody>${invRows}</tbody>
                        </table>
                        <div class="mgmt-controls">
                            <div class="mgmt-row">
                                <label>Status:</label>
                                <select class="mgmt-select" onchange="updateMgmtStatus('${cid}', this.value)">
                                    <option value="" ${!m.status ? 'selected' : ''}>— Select status —</option>
                                    <option value="managed" ${m.status === 'managed' ? 'selected' : ''}>Managed</option>
                                    <option value="no_work" ${m.status === 'no_work' ? 'selected' : ''}>Not going to work</option>
                                    <option value="renewal_requested" ${m.status === 'renewal_requested' ? 'selected' : ''}>Renewal requested</option>
                                    <option value="payment_promised" ${m.status === 'payment_promised' ? 'selected' : ''}>Payment promised</option>
                                    <option value="dispute" ${m.status === 'dispute' ? 'selected' : ''}>In dispute</option>
                                </select>
                                <label style="margin-left:1rem;">Reminders sent:</label>
                                <span class="reminder-counter">${m.reminders || 0}</span>
                                <button class="btn-action" onclick="incrementReminder('${cid}')">+1 Reminder</button>
                            </div>
                            <div class="mgmt-row">
                                <label>Response received:</label>
                                <input type="text" class="mgmt-input" placeholder="e.g. Will pay on 15/05..."
                                    value="${m.responses || ''}"
                                    onchange="updateResponse('${cid}', this.value)" />
                            </div>
                            <div class="mgmt-row">
                                <label>Notes:</label>
                                <input type="text" class="mgmt-input" placeholder="Internal notes..."
                                    value="${m.notes || ''}"
                                    onchange="updateMgmtNotes('${cid}', this.value)" />
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        ` : '';

        const statusBadge = m.status ? `<span class="badge badge-status-${m.status}">${m.status.replace('_', ' ')}</span>` : '';
        const reminderBadge = m.reminders > 0 ? `<span class="badge badge-neutral" style="margin-left:4px;">${m.reminders} 📨</span>` : '';

        return `
            <tr class="clickable-row" onclick="toggleInvoiceDetail('${cid}')">
                <td>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <i data-lucide="${expanded ? 'chevron-down' : 'chevron-right'}" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0;"></i>
                        <div>
                            <strong>${info.name}</strong><br>
                            <small style="color:var(--text-muted)">${cid}</small>
                        </div>
                    </div>
                </td>
                <td>${paymentBadge(info.payment)}</td>
                <td>${info.salesperson}</td>
                <td class="text-danger"><strong>${formatCurrency(info.total)}</strong></td>
                <td>${info.invoices.length}</td>
                <td>${statusBadge}${reminderBadge}</td>
                <td>${info.invoices[0] ? `${Math.max(...info.invoices.map(i => i['Days Overdue']))}d` : '—'}</td>
            </tr>
            ${detailPanel}
        `;
    }).join('');

    return `
        <div class="module-grid">
            <div class="table-card">
                <div class="table-header">
                    <h3>Collections · Overdue by Client (excl. confirmed payments)</h3>
                    <span class="badge badge-danger">${customers.length} clients · ${invoices.length} invoices</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr>
                            <th>CUSTOMER</th><th>PAYMENT METHOD</th><th>SALESPERSON</th>
                            <th>TOTAL OVERDUE</th><th>INVOICES</th><th>STATUS</th><th>MAX DAYS</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ─── MODULE: Credit Scanner ───────────────────────────────────────────────────
function renderCreditScanModule(data) {
    // Transfer clients with active sales and no insurance
    const transferNoIns = data.filter(c =>
        c['Zahlungsformcode'] === 'TRANSFER' &&
        c['Balance (LCY)'] > 0 &&
        !(c['Amount agreed'] > 0)
    ).sort((a, b) => (b['Balance (LCY)'] || 0) - (a['Balance (LCY)'] || 0));

    // Expired credits
    const twoYearsAgo = new Date('2024-04-21');
    const expired = data.filter(c => {
        if (!c['End date'] || c['End date'] === 'NaT') return false;
        return new Date(c['End date']) < twoYearsAgo;
    }).sort((a, b) => new Date(a['End date']) - new Date(b['End date']));

    const transferRows = transferNoIns.map(c => {
        const m = getMgmt('scan_' + c['No.']);
        return `
            <tr>
                <td><strong>${c.Name}</strong><br><small style="color:var(--text-muted)">${c['No.']}</small></td>
                <td>${c['Salesperson Name'] || '—'}</td>
                <td>${formatCurrency(c['Balance (LCY)'])}</td>
                <td>${formatCurrency(c['real_overdue_amount'] || 0)}</td>
                <td>
                    <select class="mgmt-select" onchange="updateMgmtStatus('scan_${c['No.']}', this.value)">
                        <option value="" ${!m.status ? 'selected' : ''}>— Action —</option>
                        <option value="request_insurance" ${m.status === 'request_insurance' ? 'selected' : ''}>Request Insurance</option>
                        <option value="contact_commercial" ${m.status === 'contact_commercial' ? 'selected' : ''}>Contact Commercial</option>
                        <option value="no_action" ${m.status === 'no_action' ? 'selected' : ''}>No Action Needed</option>
                    </select>
                </td>
                <td>
                    <input type="text" class="mgmt-input" placeholder="Notes..."
                        value="${m.notes || ''}"
                        onchange="updateMgmtNotes('scan_${c['No.']}', this.value)" />
                </td>
            </tr>
        `;
    }).join('');

    const expiredRows = expired.map(c => {
        const m = getMgmt('exp2_' + c['No.']);
        const yearsAgo = Math.floor((new Date('2026-04-21') - new Date(c['End date'])) / (1000 * 60 * 60 * 24 * 365));
        return `
            <tr>
                <td><strong>${c.Name}</strong></td>
                <td>${paymentBadge(c['Zahlungsformcode'])}</td>
                <td>${c['Salesperson Name'] || '—'}</td>
                <td class="text-danger">${c['End date']}</td>
                <td><span class="badge badge-danger">${yearsAgo}y ago</span></td>
                <td>${formatCurrency(c['Amount agreed'] || 0)}</td>
                <td>
                    <select class="mgmt-select" onchange="updateMgmtStatus('exp2_${c['No.']}', this.value)">
                        <option value="" ${!m.status ? 'selected' : ''}>— Decide —</option>
                        <option value="renew" ${m.status === 'renew' ? 'selected' : ''}>Request Renewal</option>
                        <option value="contact_commercial" ${m.status === 'contact_commercial' ? 'selected' : ''}>Reactivate via Commercial</option>
                        <option value="close" ${m.status === 'close' ? 'selected' : ''}>Do Not Renew</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="module-grid">
            <div class="table-card">
                <div class="table-header">
                    <h3>Transfer Clients · Active Sales · No Credit Insurance</h3>
                    <span class="badge badge-danger">${transferNoIns.length} clients</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr>
                            <th>CUSTOMER</th><th>SALESPERSON</th><th>BALANCE</th>
                            <th>OVERDUE</th><th>ACTION</th><th>NOTES</th>
                        </tr></thead>
                        <tbody>${transferRows}</tbody>
                    </table>
                </div>
            </div>
            <div class="table-card">
                <div class="table-header">
                    <h3>Expired Credits · &gt;2 Years Without Update</h3>
                    <span class="badge badge-warning">${expired.length} contracts</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr>
                            <th>CUSTOMER</th><th>PAYMENT</th><th>SALESPERSON</th>
                            <th>EXPIRED ON</th><th>AGE</th><th>LIMIT</th><th>DECISION</th>
                        </tr></thead>
                        <tbody>${expiredRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}
