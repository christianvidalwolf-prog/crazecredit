// ─── State ────────────────────────────────────────────────────────────────────
let currentModule = 'general';
let selectedSalesperson = 'all';
// Persistent management notes: { customerId: { status, notes, reminders } }
let mgmtState = JSON.parse(localStorage.getItem('craze_mgmt') || '{}');
// Expanded rows for invoice detail dropdowns
let expandedRows = new Set();
let expandedManager = null;
// Column filters state
let columnFilters = {
    customer: { search: '', values: new Set() },
    balance: { search: '', values: new Set() },
    real_overdue: { search: '', values: new Set() },
    payment_method: { search: '', values: new Set() },
    salesperson: { search: '', values: new Set() },
    invoices: { values: new Set() }
};
let activeFilterDropdown = null;
let filterDebounceTimer = null;
let limitsFilters = {
    no_end_date: { customer: '', payment: new Set(), salesperson: new Set() },
    proposals: { customer: '', payment: new Set(), salesperson: new Set() }
};
let limitsSort = {
    no_end_date: { column: 'balance', desc: true },
    proposals: { column: 'usage', desc: true }
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    populateSalespersonFilter();
    updateKPIs();
    renderModule();
    document.addEventListener('click', closeFilterDropdowns);
});

// ─── Column Filters ─────────────────────────────────────────────────────────────
function closeFilterDropdowns(e) {
    if (activeFilterDropdown && !e.target.closest('.filter-dropdown') && !e.target.closest('.filter-header')) {
        const dd = document.querySelector('.filter-dropdown.open');
        if (dd) dd.classList.remove('open');
        document.querySelectorAll('.filter-header').forEach(h => h.classList.remove('active'));
        activeFilterDropdown = null;
    }
}

function toggleFilterDropdown(column, headerEl) {
    const dropdown = headerEl.querySelector('.filter-dropdown');
    if (activeFilterDropdown === column && dropdown.classList.contains('open')) {
        dropdown.classList.remove('open');
        headerEl.classList.remove('active');
        activeFilterDropdown = null;
    } else {
        document.querySelectorAll('.filter-dropdown.open').forEach(d => d.classList.remove('open'));
        document.querySelectorAll('.filter-header').forEach(h => h.classList.remove('active'));
        dropdown.classList.add('open');
        headerEl.classList.add('active');
        activeFilterDropdown = column;
        setTimeout(() => {
            const input = dropdown.querySelector('.filter-search input');
            if (input) input.focus();
        }, 50);
    }
}

function updateFilterSearch(column, value) {
    // Only update the in-memory search text; do NOT re-render yet.
    // The user confirms by pressing Enter or clicking Apply.
    columnFilters[column].search = value.toLowerCase();
    // Filter the visible checkbox options without closing the dropdown.
    const dd = document.getElementById('filter-dd-' + column);
    if (!dd) return;
    dd.querySelectorAll('.filter-option').forEach(label => {
        const text = label.textContent.trim().toLowerCase();
        label.style.display = !value || text.includes(value.toLowerCase()) ? '' : 'none';
    });
}

function applyFilterSearch(e) {
    if (e && e.key && e.key !== 'Enter') return;
    renderModule();
}

function updateFilterCheckbox(column, value, checked) {
    if (checked) {
        columnFilters[column].values.add(value);
    } else {
        columnFilters[column].values.delete(value);
    }
    renderModule();
}

function toggleSelectAll(column, allValues) {
    if (columnFilters[column].values.size === allValues.length) {
        columnFilters[column].values.clear();
    } else {
        allValues.forEach(v => columnFilters[column].values.add(v));
    }
    renderModule();
}

function clearColumnFilter(column) {
    columnFilters[column] = { search: '', values: new Set() };
    renderModule();
}

function hasActiveFilter(column) {
    if (columnFilters[column].search) return true;
    if (columnFilters[column].values.size > 0) return true;
    return false;
}

function renderFilterDropdownHTML(column, allValues, _hasSearch) {
    const searchVal = columnFilters[column].search || '';
    const options = allValues.filter(v =>
        !searchVal || v.toLowerCase().includes(searchVal)
    );
    const allSelected = allValues.length > 0 && columnFilters[column].values.size === allValues.length;

    const selectAllBtn = options.length > 1 ? `
        <div class="filter-actions">
            <button onclick="toggleSelectAll('${column}', ${JSON.stringify(allValues)})">
                ${allSelected ? 'Deselect All' : 'Select All'}
            </button>
        </div>
    ` : '';

    return `
        <div class="filter-dropdown" id="filter-dd-${column}">
            <div class="filter-search">
                <input type="text" placeholder="Search... (Enter to apply)" value="${searchVal}"
                    oninput="updateFilterSearch('${column}', this.value)"
                    onkeydown="applyFilterSearch(event)"
                    onclick="event.stopPropagation()">
            </div>
            ${selectAllBtn}
            <div class="filter-options">
                ${options.map(v => `
                    <label class="filter-option">
                        <input type="checkbox"
                            ${columnFilters[column].values.has(v) ? 'checked' : ''}
                            onchange="updateFilterCheckbox('${column}', '${v.replace(/'/g, "\\'")}', this.checked)">
                        ${v}
                    </label>
                `).join('')}
            </div>
            <div class="filter-clear">
                <button onclick="clearColumnFilter('${column}')">Clear Filter</button>
            </div>
        </div>
    `;
}

function getUniqueValues(data, column, transform) {
    const vals = data.map(c => {
        if (column === 'customer') return c['Name'] || '';
        if (column === 'balance') return c['Balance (LCY)'] || 0;
        if (column === 'real_overdue') return c['real_overdue_amount'] || 0;
        if (column === 'payment_method') return c['Zahlungsformcode'] || '';
        if (column === 'salesperson') return c['Salesperson Name'] || '';
        if (column === 'invoices') return c['overdue_invoice_count'] || 0;
        return '';
    });
    if (transform === 'badge') {
        return [...new Set(vals.filter(Boolean))].sort();
    }
    return [...new Set(vals)];
}

function applyColumnFilters(data) {
    return data.filter(c => {
        if (columnFilters.customer.search) {
            const name = (c['Name'] || '').toLowerCase();
            if (!name.includes(columnFilters.customer.search)) return false;
        }
        if (columnFilters.customer.values.size > 0) {
            if (!columnFilters.customer.values.has(c['Name'])) return false;
        }
        if (columnFilters.balance.values.size > 0) {
            const val = c['Balance (LCY)'] || 0;
            if (!columnFilters.balance.values.has(val)) return false;
        }
        if (columnFilters.real_overdue.values.size > 0) {
            const val = c['real_overdue_amount'] || 0;
            if (!columnFilters.real_overdue.values.has(val)) return false;
        }
        if (columnFilters.payment_method.search) {
            const val = (c['Zahlungsformcode'] || '').toLowerCase();
            if (!val.includes(columnFilters.payment_method.search)) return false;
        }
        if (columnFilters.payment_method.values.size > 0) {
            if (!columnFilters.payment_method.values.has(c['Zahlungsformcode'])) return false;
        }
        if (columnFilters.salesperson.search) {
            const val = (c['Salesperson Name'] || '').toLowerCase();
            if (!val.includes(columnFilters.salesperson.search)) return false;
        }
        if (columnFilters.salesperson.values.size > 0) {
            if (!columnFilters.salesperson.values.has(c['Salesperson Name'])) return false;
        }
        if (columnFilters.invoices.values.size > 0) {
            const val = c['overdue_invoice_count'] || 0;
            if (!columnFilters.invoices.values.has(val)) return false;
        }
        return true;
    });
}

function toggleManager(name) {
    expandedManager = expandedManager === name ? null : name;
    renderModule();
}

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

function managerDetailRow(managerName, colSpan) {
    const clientsOfManager = new Set(
        DASHBOARD_DATA.customers
            .filter(c => (c['Salesperson Name'] || 'Unassigned') === managerName)
            .map(c => String(c['No.']))
    );
    const invoices = DASHBOARD_DATA.overdue_invoices.filter(
        inv => clientsOfManager.has(String(inv['Customer No.']))
    );

    if (!invoices.length) return `<tr><td colspan="${colSpan}" class="text-muted" style="padding:1rem;text-align:center;">No overdue invoices for this manager</td></tr>`;

    const rows = invoices.map(inv => `
        <tr class="invoice-detail-row">
            <td>${inv['Customer Name']} <small>(${inv['Customer No.']})</small></td>
            <td>${inv['Document No.']}</td>
            <td class="text-danger">${inv['Days Overdue']}d</td>
            <td>${formatCurrency(inv['Remaining Amt. (LCY)'])}</td>
            <td>${paymentBadge(inv['Payment Method Code'])}</td>
        </tr>
    `).join('');

    return `
        <tr class="detail-row">
            <td colspan="${colSpan}" style="padding:0;">
                <div class="detail-container">
                    <h4 style="margin-bottom:1rem;font-size:0.875rem;color:var(--primary);">Grouped Invoice Detail: ${managerName}</h4>
                    <table class="detail-table">
                        <thead>
                            <tr>
                                <th>CUSTOMER</th><th>INVOICE</th><th>DAYS OVERDUE</th>
                                <th>AMOUNT</th><th>PAYMENT</th>
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
    const filteredData = applyColumnFilters(data);
    const critical = filteredData.filter(c => (c['real_overdue_amount'] || 0) > 0)
        .sort((a, b) => (b['real_overdue_amount'] || 0) - (a['real_overdue_amount'] || 0))
        .slice(0, 20);

    const allPaymentMethods = [...new Set(data.map(c => c['Zahlungsformcode'] || '').filter(Boolean))].sort();
    const allSalespersons = [...new Set(data.map(c => c['Salesperson Name'] || '').filter(Boolean))].sort();

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
                            <th class="filter-header" onclick="toggleFilterDropdown('customer', this)">
                                <div class="filter-header-cell">
                                    CUSTOMER
                                    <i data-lucide="filter" class="filter-icon" style="width:12px;height:12px;"></i>
                                </div>
                                ${renderFilterDropdownHTML('customer', [...new Set(data.map(c => c['Name'] || '').filter(Boolean))].sort(), true)}
                            </th>
                            <th>BALANCE</th>
                            <th>REAL OVERDUE ▼</th>
                            <th class="filter-header" onclick="toggleFilterDropdown('payment_method', this)">
                                <div class="filter-header-cell">
                                    PAYMENT METHOD
                                    <i data-lucide="filter" class="filter-icon" style="width:12px;height:12px;"></i>
                                </div>
                                ${renderFilterDropdownHTML('payment_method', allPaymentMethods, false)}
                            </th>
                            <th class="filter-header" onclick="toggleFilterDropdown('salesperson', this)">
                                <div class="filter-header-cell">
                                    SALESPERSON
                                    <i data-lucide="filter" class="filter-icon" style="width:12px;height:12px;"></i>
                                </div>
                                ${renderFilterDropdownHTML('salesperson', allSalespersons, false)}
                            </th>
                            <th>INVOICES</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ─── MODULE: Limits ───────────────────────────────────────────────────────────
function applyLimitsFilters(data, filterKey) {
    const f = limitsFilters[filterKey];
    return data.filter(c => {
        if (f.customer && !(c.Name || '').toLowerCase().includes(f.customer)) return false;
        if (f.payment.size > 0 && !f.payment.has(c['Zahlungsformcode'])) return false;
        if (f.salesperson.size > 0 && !f.salesperson.has(c['Salesperson Name'])) return false;
        return true;
    });
}

function sortLimitsData(data, filterKey) {
    const s = limitsSort[filterKey];
    return [...data].sort((a, b) => {
        let valA, valB;
        if (s.column === 'customer') {
            valA = (a.Name || '').toLowerCase();
            valB = (b.Name || '').toLowerCase();
            return s.desc ? valB.localeCompare(valA) : valA.localeCompare(valB);
        } else if (s.column === 'payment') {
            valA = a['Zahlungsformcode'] || '';
            valB = b['Zahlungsformcode'] || '';
            return s.desc ? valB.localeCompare(valA) : valA.localeCompare(valB);
        } else if (s.column === 'salesperson') {
            valA = a['Salesperson Name'] || '';
            valB = b['Salesperson Name'] || '';
            return s.desc ? valB.localeCompare(valA) : valA.localeCompare(valB);
        } else if (s.column === 'balance') {
            valA = a['Balance (LCY)'] || 0;
            valB = b['Balance (LCY)'] || 0;
            return s.desc ? valB - valA : valA - valB;
        } else if (s.column === 'limit') {
            valA = a['Amount agreed'] || 0;
            valB = b['Amount agreed'] || 0;
            return s.desc ? valB - valA : valA - valB;
        } else if (s.column === 'usage') {
            valA = a['Amount agreed'] ? (a['Balance (LCY)'] || 0) / a['Amount agreed'] : 0;
            valB = b['Amount agreed'] ? (b['Balance (LCY)'] || 0) / b['Amount agreed'] : 0;
            return s.desc ? valB - valA : valA - valB;
        }
        return 0;
    });
}

function setLimitsSort(filterKey, column) {
    if (limitsSort[filterKey].column === column) {
        limitsSort[filterKey].desc = !limitsSort[filterKey].desc;
    } else {
        limitsSort[filterKey] = { column, desc: true };
    }
    renderModule();
}

function toggleLimitsFilterDropdown(filterKey, column, headerEl) {
    const dropdown = headerEl.querySelector('.filter-dropdown');
    if (!dropdown) return;
    if (dropdown.classList.contains('open')) {
        dropdown.classList.remove('open');
        headerEl.classList.remove('active');
    } else {
        document.querySelectorAll('.filter-dropdown.open').forEach(d => d.classList.remove('open'));
        document.querySelectorAll('.filter-header').forEach(h => h.classList.remove('active'));
        dropdown.classList.add('open');
        headerEl.classList.add('active');
    }
}

function renderLimitsFilterDropdown(filterKey, column, allValues) {
    const f = limitsFilters[filterKey];
    const s = limitsSort[filterKey];
    const isActive = f[column] || (column === 'payment' && f.payment.size > 0) || (column === 'salesperson' && f.salesperson.size > 0);
    const sortedValues = [...allValues].sort();

    return `
        <div class="filter-dropdown">
            <div class="filter-search">
                <input type="text" placeholder="Search..." value="${f[column] || ''}"
                    oninput="limitsFilters['${filterKey}']['${column}'] = this.value.toLowerCase(); clearTimeout(filterDebounceTimer); filterDebounceTimer = setTimeout(renderModule, 150);">
            </div>
            <div class="filter-actions">
                <button onclick="limitsFilters['${filterKey}']['${column}'] = ''; limitsFilters['${filterKey}']['${column === 'payment' ? 'payment' : column === 'salesperson' ? 'salesperson' : column}'].clear(); renderModule();">Clear</button>
            </div>
            <div class="filter-options">
                ${sortedValues.map(v => `
                    <label class="filter-option">
                        <input type="checkbox"
                            ${(column === 'payment' ? f.payment : f.salesperson).has(v) ? 'checked' : ''}
                            onchange="this.checked ? limitsFilters['${filterKey}']['${column}'].add('${v}') : limitsFilters['${filterKey}']['${column}'].delete('${v}'); renderModule();">
                        ${v}
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

function renderLimitsModule(data) {
    const today = new Date('2026-04-21');

    const withEndDate = data.filter(c => c['End date'] && c['End date'] !== 'NaT')
        .sort((a, b) => new Date(a['End date']) - new Date(b['End date']));
    
    const withoutEndDateOriginal = data.filter(c => !c['End date'] || c['End date'] === 'NaT' || c['End date'] === null);
    const withoutEndDateFiltered = sortLimitsData(applyLimitsFilters(withoutEndDateOriginal, 'no_end_date'), 'no_end_date');

    const proposalsOriginal = data.filter(c => c['Amount agreed'] > 0 && (c['Balance (LCY)'] / c['Amount agreed']) > 0.8);
    const proposalsFiltered = sortLimitsData(applyLimitsFilters(proposalsOriginal, 'proposals'), 'proposals');

    const allPaymentMethods = [...new Set(data.map(c => c['Zahlungsformcode'] || '').filter(Boolean))].sort();
    const allSalespersons = [...new Set(data.map(c => c['Salesperson Name'] || '').filter(Boolean))].sort();

    const makeSortHeader = (label, filterKey, col, icon) => `
        <th class="filter-header" onclick="event.stopPropagation(); setLimitsSort('${filterKey}', '${col}');">
            <div class="filter-header-cell" style="cursor:pointer;">
                ${label} ${icon}
            </div>
        </th>
    `;

    return `
        <div class="module-grid">
            <div class="table-card" style="grid-column:span 1;">
                <div class="table-header"><h3>Renewal Alerts · With End Date</h3>
                    <span class="badge badge-warning">${withEndDate.length}</span>
                </div>
                <div class="table-container" style="padding:1rem;">
                    ${withEndDate.length > 0 ? withEndDate.slice(0, 15).map(c => `
                        <div class="alert-item ${new Date(c['End date']) < today ? 'critical' : 'warning'}">
                            <div>
                                <strong>${c.Name}</strong><br>
                                <small>Expiry: ${c['End date']} · ${paymentBadge(c['Zahlungsformcode'])} · ${c['Salesperson Name'] || '—'}</small>
                            </div>
                            <span class="badge ${new Date(c['End date']) < today ? 'badge-danger' : 'badge-warning'}">
                                ${new Date(c['End date']) < today ? 'Expired' : 'Upcoming'}
                            </span>
                        </div>
                    `).join('') : '<div class="alert-item"><div><em style="color:var(--text-muted)">No clients with renewal dates</em></div></div>'}
                </div>
            </div>
            <div class="table-card" style="grid-column:span 1;">
                <div class="table-header">
                    <h3>No End Date Set · Need Management</h3>
                    <span class="badge badge-danger">${withoutEndDateFiltered.length}</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th class="filter-header" onclick="toggleLimitsFilterDropdown('no_end_date', 'customer', this)">
                                    <div class="filter-header-cell">CUSTOMER <i data-lucide="filter" class="filter-icon" style="width:12px;height:12px;"></i></div>
                                    ${renderLimitsFilterDropdown('no_end_date', 'customer', [...new Set(withoutEndDateOriginal.map(c => c.Name || '').filter(Boolean))])}
                                </th>
                                <th class="filter-header" onclick="toggleLimitsFilterDropdown('no_end_date', 'payment', this)">
                                    <div class="filter-header-cell">PAYMENT <i data-lucide="filter" class="filter-icon" style="width:12px;height:12px;"></i></div>
                                    ${renderLimitsFilterDropdown('no_end_date', 'payment', allPaymentMethods)}
                                </th>
                                <th class="filter-header" onclick="toggleLimitsFilterDropdown('no_end_date', 'salesperson', this)">
                                    <div class="filter-header-cell">SALESPERSON <i data-lucide="filter" class="filter-icon" style="width:12px;height:12px;"></i></div>
                                    ${renderLimitsFilterDropdown('no_end_date', 'salesperson', allSalespersons)}
                                </th>
                                <th onclick="setLimitsSort('no_end_date', 'balance')" style="cursor:pointer;white-space:nowrap;">
                                    BALANCE <span style="color:var(--primary);font-size:0.7rem;">${limitsSort.no_end_date.column === 'balance' ? (limitsSort.no_end_date.desc ? '▼' : '▲') : '⇅'}</span>
                                </th>
                                <th onclick="setLimitsSort('no_end_date', 'limit')" style="cursor:pointer;white-space:nowrap;">
                                    LIMIT <span style="color:var(--primary);font-size:0.7rem;">${limitsSort.no_end_date.column === 'limit' ? (limitsSort.no_end_date.desc ? '▼' : '▲') : '⇅'}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            ${withoutEndDateFiltered.slice(0, 30).map(c => `
                                <tr>
                                    <td>${c.Name}</td>
                                    <td>${paymentBadge(c['Zahlungsformcode'])}</td>
                                    <td>${c['Salesperson Name'] || '—'}</td>
                                    <td>${formatCurrency(c['Balance (LCY)'] || 0)}</td>
                                    <td>${formatCurrency(c['Amount agreed'] || 0)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="table-card" style="grid-column:span 1;">
                <div class="table-header">
                    <h3>Expansion Proposals (&gt;80% usage)</h3>
                    <span class="badge badge-warning">${proposalsFiltered.length}</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th class="filter-header" onclick="toggleLimitsFilterDropdown('proposals', 'customer', this)">
                                    <div class="filter-header-cell">CUSTOMER <i data-lucide="filter" class="filter-icon" style="width:12px;height:12px;"></i></div>
                                    ${renderLimitsFilterDropdown('proposals', 'customer', [...new Set(proposalsOriginal.map(c => c.Name || '').filter(Boolean))])}
                                </th>
                                <th class="filter-header" onclick="toggleLimitsFilterDropdown('proposals', 'payment', this)">
                                    <div class="filter-header-cell">PAYMENT <i data-lucide="filter" class="filter-icon" style="width:12px;height:12px;"></i></div>
                                    ${renderLimitsFilterDropdown('proposals', 'payment', allPaymentMethods)}
                                </th>
                                <th class="filter-header" onclick="toggleLimitsFilterDropdown('proposals', 'salesperson', this)">
                                    <div class="filter-header-cell">SALESPERSON <i data-lucide="filter" class="filter-icon" style="width:12px;height:12px;"></i></div>
                                    ${renderLimitsFilterDropdown('proposals', 'salesperson', allSalespersons)}
                                </th>
                                <th onclick="setLimitsSort('proposals', 'usage')" style="cursor:pointer;white-space:nowrap;">
                                    USAGE % <span style="color:var(--primary);font-size:0.7rem;">${limitsSort.proposals.column === 'usage' ? (limitsSort.proposals.desc ? '▼' : '▲') : '⇅'}</span>
                                </th>
                                <th>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${proposalsFiltered.map(c => `
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
        .map(([name, s]) => {
            const isExp = expandedManager === name;
            return `
                <tr class="expandable-row" onclick="toggleManager('${name}')">
                    <td>
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                             <i data-lucide="${isExp ? 'chevron-down' : 'chevron-right'}" style="width:14px;height:14px;color:var(--text-muted);"></i>
                             <strong>${name}</strong>
                        </div>
                    </td>
                    <td>${s.count}</td>
                    <td>${formatCurrency(s.balance)}</td>
                    <td class="text-warning">${formatCurrency(s.overdue)}</td>
                    <td class="text-danger"><strong>${formatCurrency(s.real_overdue)}</strong></td>
                </tr>
                ${isExp ? managerDetailRow(name, 5) : ''}
            `;
        }).join('');

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
