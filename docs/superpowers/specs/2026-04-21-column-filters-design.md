# Column Filters - Overview Module

## Overview
Add Excel-style dropdown column filters to the Overview (Critical Risk Alerts) table in the dashboard. Combines text search + checkbox multiselect for flexible filtering.

## Design

### Filter Trigger
- **Click on any column header** → opens dropdown filter below that header
- **Active filter icon** (funnel in red) appears when column has filters applied
- **Clear button** (X) to remove all filters on that column

### Dropdown Structure
```
┌─────────────────────────────────┐
│ 🔍 [search input──────────────]   │
├─────────────────────────────────┤
│ □ ☑ Select All   □ ☑ Deselect │
├─────────────────────────────────┤
│ ☐ Value 1                          │
│ ☑ Value 2                          │
│ ☐ Value 3                          │
│ ...                               │
└─────────────────────────────────┘
```

### Filter Types by Column

| Column | Behavior |
|--------|----------|
| CUSTOMER | Text search (contains), no checkboxes |
| BALANCE | Text search (contains), numeric |
| REAL OVERDUE | Text search (contains), numeric |
| PAYMENT METHOD | Text search + checkboxes |
| SALESPERSON | Text search + checkboxes |
| INVOICES | Checkboxes (1, 2, 3+ invoices) |

### Interaction Details
- Click outside dropdown → closes dropdown
- Escape key → closes dropdown
- Filters persist across module navigation
- URL does not need to update (no URL state needed)
- Table updates in real-time as filters change

### State Management
```javascript
let columnFilters = {
    customer: { search: '', active: false },
    balance: { search: '', active: false },
    real_overdue: { search: '', active: false },
    payment_method: { values: new Set(), search: '', active: false },
    salesperson: { values: new Set(), search: '', active: false },
    invoices: { values: new Set(), active: false }
};
```

### Styling
- Dropdown: `background: var(--bg-card)`, border, shadow, rounded
- Search input: dark background, placeholder text
- Checkboxes: custom styled to match app theme
- Active icon: red (#ef4444) funnel icon
- Hover states: subtle background highlight

## Implementation Notes

### Files to Modify
1. `style.css` - dropdown styles, checkbox styles, filter indicators
2. `app.js` - filter state, rendering logic, event handlers

### Key Functions
- `initColumnFilters()` - initialize filter state
- `renderFilterDropdown(column, data)` - render dropdown HTML
- `applyColumnFilters(data)` - filter data based on active filters
- `clearColumnFilter(column)` - clear filters for column
- `updateActiveFilterIndicators()` - show/hide filter icons

### Performance
- Debounce search input (150ms)
- Unique values computed once and cached
- Table re-renders only when filters change

## Acceptance Criteria
- [ ] Clicking column header opens filter dropdown
- [ ] Search input filters checkbox options in real-time
- [ ] Checkboxes select/deselect values
- [ ] Select All / Deselect All works
- [ ] Active filters show red funnel icon in header
- [ ] Table filters in real-time
- [ ] Clear button removes all column filters
- [ ] Click outside closes dropdown
- [ ] Filters don't break existing functionality