import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import AccountPickerModal from '../AccountPickerModal';
import { Toast, useToast } from '../Toast';
import { supabase } from '../../shared/supabase';
import { ICONS } from '../Icons';
import '../../styles/Transactions.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const ATTENTION_ORDER = ['HIGH', 'MEDIUM', 'LOW'];

// Small inline editor that appears when the amount cell is clicked
const AmountEditor = ({ txn, onSave, onCancel }) => {
  const isDebit = txn.debit > 0;
  const [editAmount, setEditAmount] = useState(isDebit ? txn.debit : txn.credit);
  const [editType, setEditType] = useState(isDebit ? 'DEBIT' : 'CREDIT');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const handleSave = async () => {
    const parsed = parseFloat(editAmount);
    if (isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    await onSave(txn.uncategorized_transaction_id, parsed, editType);
    setSaving(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="amount-editor" onClick={(e) => e.stopPropagation()}>
      <div className="amount-editor-type-toggle">
        <button
          className={`type-btn ${editType === 'DEBIT' ? 'active debit' : ''}`}
          onClick={() => setEditType('DEBIT')}
        >− Dr</button>
        <button
          className={`type-btn ${editType === 'CREDIT' ? 'active credit' : ''}`}
          onClick={() => setEditType('CREDIT')}
        >+ Cr</button>
      </div>
      <input
        ref={inputRef}
        className="amount-editor-input"
        type="number"
        step="0.01"
        min="0.01"
        value={editAmount}
        onChange={(e) => setEditAmount(e.target.value)}
        onKeyDown={handleKey}
      />
      <div className="amount-editor-actions">
        <button className="amount-editor-save" onClick={handleSave} disabled={saving}>
          {saving ? '...' : '✓'}
        </button>
        <button className="amount-editor-cancel" onClick={onCancel}>✕</button>
      </div>
    </div>
  );
};

// Recursive tree view for choosing a destination (offset) account filter
const OffsetAccountTree = ({ accounts, selectedIds, onToggle, searchQuery = '' }) => {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const q = searchQuery.trim().toLowerCase();

  const toggle = (id) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Build tree from flat list — roots are accounts with no parent in list
  const accountMap = {};
  accounts.forEach(a => { accountMap[a.account_id] = { ...a, children: [] }; });
  const roots = [];
  accounts.forEach(a => {
    if (a.parent_account_id && accountMap[a.parent_account_id]) {
      accountMap[a.parent_account_id].children.push(accountMap[a.account_id]);
    } else {
      roots.push(accountMap[a.account_id]);
    }
  });

  // Auto-expand ancestors of any pre-selected account so the checkbox is visible
  useEffect(() => {
    if (accounts.length === 0 || selectedIds.size === 0) return;
    const toExpand = new Set();
    selectedIds.forEach(id => {
      let current = accounts.find(a => a.account_id === id);
      while (current?.parent_account_id) {
        toExpand.add(current.parent_account_id);
        current = accounts.find(a => a.account_id === current.parent_account_id);
      }
    });
    if (toExpand.size > 0) {
      setExpandedIds(prev => new Set([...prev, ...toExpand]));
    }
  }, [accounts, selectedIds]);

  // Returns true if node or any descendant matches search
  const nodeMatches = (node) => {
    if (!q) return true;
    if (node.account_name.toLowerCase().includes(q)) return true;
    return (node.children || []).some(child => nodeMatches(child));
  };

  const renderNode = (node, depth = 0) => {
    if (!nodeMatches(node)) return null;

    const hasChildren = node.children && node.children.length > 0;
    // Auto-expand when searching
    const isExpanded = q ? true : expandedIds.has(node.account_id);
    const isSelected = selectedIds.has(node.account_id);
    const nameLC = node.account_name.toLowerCase();
    const matchIdx = q ? nameLC.indexOf(q) : -1;

    // Highlight matched portion of account name
    const nameEl = matchIdx >= 0 ? (
      <span>
        {node.account_name.slice(0, matchIdx)}
        <mark style={{ background: 'rgba(167,139,250,0.35)', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}>
          {node.account_name.slice(matchIdx, matchIdx + q.length)}
        </mark>
        {node.account_name.slice(matchIdx + q.length)}
      </span>
    ) : node.account_name;

    return (
      <div key={node.account_id}>
        <label
          className="filter-option"
          style={{ paddingLeft: `${12 + depth * 14}px`, gap: '6px', alignItems: 'center' }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.preventDefault(); if (!q) toggle(node.account_id); }}
              style={{
                background: 'none', border: 'none', cursor: q ? 'default' : 'pointer',
                padding: '0 2px', color: 'var(--text-secondary)',
                fontSize: '10px', lineHeight: 1, flexShrink: 0
              }}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          ) : (
            <span style={{ width: '14px', flexShrink: 0 }} />
          )}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(node.account_id)}
            style={{ flexShrink: 0 }}
          />
          <span style={{ fontSize: '12.5px', color: depth === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: depth === 0 ? 600 : 400 }}>
            {nameEl}
          </span>
        </label>
        {hasChildren && isExpanded && node.children
          .filter(child => nodeMatches(child))
          .sort((a, b) => a.account_name.localeCompare(b.account_name))
          .map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  const visibleRoots = roots
    .filter(root => nodeMatches(root))
    .sort((a, b) => a.account_name.localeCompare(b.account_name));

  return (
    <div style={{ maxHeight: '220px', overflowY: 'auto', paddingBottom: '4px' }}>
      {visibleRoots.length === 0
        ? <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>No matching accounts</div>
        : visibleRoots.map(root => renderNode(root))}
    </div>
  );
};

const Transactions = () => {
  const navigate = useNavigate();
  const location = useLocation();  // read nav state BEFORE lazy useState inits below
  const [searchParams, setSearchParams] = useSearchParams();
  const { toasts, showToast } = useToast();
  const [isCategorizing, setIsCategorizing] = useState(() => {
    return localStorage.getItem('isCategorizing') === 'true';
  });
  const [categoriseStatus, setCategoriseStatus] = useState(() => {
    return localStorage.getItem('categoriseStatus') || '';
  });
  const [isApprovingBulk, setIsApprovingBulk] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [recatTarget, setRecatTarget] = useState(null);
  const [manualTarget, setManualTarget] = useState(null);
  const [srcAccTarget, setSrcAccTarget] = useState(null);
  const [approvingIds, setApprovingIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [correctingId, setCorrectingId] = useState(null);
  const [cachedAccounts, setCachedAccounts] = useState([]);

  // ── Similar transactions popup state ────────────────────────────
  const [similarTxns, setSimilarTxns] = useState([]);
  const [similarSuggestedAccount, setSimilarSuggestedAccount] = useState(null);
  const [similarAccountOverrides, setSimilarAccountOverrides] = useState({});
  const [similarPickerTarget, setSimilarPickerTarget] = useState(null);
  const [isApprovingSimilar, setIsApprovingSimilar] = useState(false);

  // ── Filter popup state ────────────────────────────────────────
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const [filterAccounts, setFilterAccounts] = useState([]); // { account_id, account_name }
  const [filterDocuments, setFilterDocuments] = useState([]); // { document_id, file_name }
  const [selectedAccountIds, setSelectedAccountIds] = useState(() => {
    // Seeded from Accounts page navigation state (srcAccId = bank/CC account)
    const id = location.state?.srcAccId;
    return id ? new Set([id]) : new Set();
  });
  const [selectedDocIds, setSelectedDocIds] = useState(new Set());
  const [selectedOffsetAccountIds, setSelectedOffsetAccountIds] = useState(() => {
    // Seeded from Accounts page navigation state (destAccId = COA account)
    const id = location.state?.destAccId;
    return id ? new Set([id]) : new Set();
  }); // dest-account filter
  const [offsetAccountSearch, setOffsetAccountSearch] = useState(''); // search within dest-account tree
  const [txnTypeFilter, setTxnTypeFilter] = useState('ALL'); // 'ALL' | 'DEBIT' | 'CREDIT'
  const [searchQuery, setSearchQuery] = useState('');
  const [dateSortOrder, setDateSortOrder] = useState('desc'); // 'asc' | 'desc'
  
  // ── Date Range popup state ────────────────────────────────────
  const [isDatePopupOpen, setIsDatePopupOpen] = useState(false);
  const datePopupRef = useRef(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const toLocalISO = (d) => {
    const tzoffset = d.getTimezoneOffset() * 60000; // offset in milliseconds
    return new Date(d - tzoffset).toISOString().split('T')[0];
  };

  const setQuickDate = (option) => {
    const today = new Date();
    let start = '';
    let end = toLocalISO(today);

    if (option === '7D') {
      const d = new Date(today);
      d.setDate(today.getDate() - 7);
      start = toLocalISO(d);
    } else if (option === '30D') {
      const d = new Date(today);
      d.setDate(today.getDate() - 30);
      start = toLocalISO(d);
    } else if (option === 'THIS_MONTH') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      start = toLocalISO(d);
    } else if (option === 'LAST_MONTH') {
      const dStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const dEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      start = toLocalISO(dStart);
      end = toLocalISO(dEnd);
    } else if (option === 'THIS_YEAR') {
      const d = new Date(today.getFullYear(), 0, 1);
      start = toLocalISO(d);
    } else if (option === 'LAST_FY') {
      const currentYear = today.getFullYear();
      let startYear = currentYear - 1;
      let endYear = currentYear;
      if (today.getMonth() < 3) { // Jan-Mar (0-2)
          startYear = currentYear - 2;
          endYear = currentYear - 1;
      }
      const dStart = new Date(startYear, 3, 1); // April 1st
      const dEnd = new Date(endYear, 2, 31); // March 31st
      start = toLocalISO(dStart);
      end = toLocalISO(dEnd);
    }
    setDateRange({ start, end });
  };

  const fetchTransactions = async (currentFilter = activeFilter, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('uncategorized_transactions')
        .select(`
          uncategorized_transaction_id,
          txn_date,
          details,
          debit,
          credit,
          document_id,
          account_id,
          source_account:account_id ( account_id, account_name ),
          source_document:document_id ( document_id, file_name ),
          transactions!uncategorized_transaction_id (
            transaction_id,
            review_status,
            attention_level,
            offset_account_id,
            categorised_by,
            is_uncategorised,
            accounts:offset_account_id (
              account_name
            )
          )
        `)
        .eq('user_id', user.id)
        .order('txn_date', { ascending: false });

      if (error) throw error;

      setTransactions(data || []);

      // Auto-select LOW attention when filtering to PENDING_APP
      if (currentFilter === 'PENDING_APP') {
        const lowAttentionIds = new Set();
        (data || []).forEach((txn) => {
          const isCategorised = txn.transactions && txn.transactions.length > 0;
          if (isCategorised && txn.transactions[0].review_status === 'PENDING') {
            const isUncategorised = txn.transactions[0].is_uncategorised;
            if (txn.transactions[0].attention_level === 'LOW' && !isUncategorised) {
              lowAttentionIds.add(txn.transactions[0].transaction_id);
            }
          }
        });
        setSelectedIds(lowAttentionIds);
      }
    } catch (err) {
      console.error('Fetch transactions failed:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Populate filter options once on mount
  useEffect(() => {
    fetchTransactions('ALL');

    // Check if categorization was running when user left - show notification
    if (localStorage.getItem('isCategorizing') === 'true') {
      showToast('Categorization is still running in the background. You can continue using the app.', 'info');
    }

    const loadFilterOptions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Distinct accounts that appear in uncategorized_transactions
      const { data: accData } = await supabase
        .from('uncategorized_transactions')
        .select('source_account:account_id ( account_id, account_name )')
        .eq('user_id', user.id);

      const { data: docData } = await supabase
        .from('uncategorized_transactions')
        .select('source_document:document_id ( document_id, file_name )')
        .eq('user_id', user.id);

      // De-duplicate
      const accMap = {};
      (accData || []).forEach(r => {
        if (r.source_account) accMap[r.source_account.account_id] = r.source_account;
      });
      const docMap = {};
      (docData || []).forEach(r => {
        if (r.source_document) docMap[r.source_document.document_id] = r.source_document;
      });

      setFilterAccounts(Object.values(accMap));
      setFilterDocuments(Object.values(docMap));
    };

    const loadAllAccounts = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: acctData } = await supabase
        .from('accounts')
        .select('account_id, account_name, account_type, balance_nature, parent_account_id, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('account_type', { ascending: true })
        .order('account_name', { ascending: true });

      setCachedAccounts(acctData || []);
    };

    loadFilterOptions();
    loadAllAccounts();
  }, []);

  // Clear the navigation state from history so the filter isn't re-applied
  // on back/forward navigation (the filter is already in React state).
  useEffect(() => {
    if (location.state?.srcAccId || location.state?.destAccId) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, []);

  // Close popups on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setIsFilterOpen(false);
      }
      if (datePopupRef.current && !datePopupRef.current.contains(e.target)) {
        setIsDatePopupOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleAccountFilter = (id) => {
    setSelectedAccountIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDocFilter = (id) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleOffsetAccountFilter = (id) => {
    setSelectedOffsetAccountIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Returns the set of account_ids that are the given root OR any descendant of it
  const getDescendantIds = (rootId, allAccounts) => {
    const result = new Set([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift();
      allAccounts.forEach(acc => {
        if (acc.parent_account_id === current && !result.has(acc.account_id)) {
          result.add(acc.account_id);
          queue.push(acc.account_id);
        }
      });
    }
    return result;
  };

  // Expanded set of all offset account ids that should pass the filter
  // (i.e. any selected account + all its descendants)
  const expandedOffsetIds = React.useMemo(() => {
    if (selectedOffsetAccountIds.size === 0) return new Set();
    const expanded = new Set();
    selectedOffsetAccountIds.forEach(id => {
      getDescendantIds(id, cachedAccounts).forEach(d => expanded.add(d));
    });
    return expanded;
  }, [selectedOffsetAccountIds, cachedAccounts]);

  // Same expansion for the source (bank/CC) account filter
  const expandedSrcIds = React.useMemo(() => {
    if (selectedAccountIds.size === 0) return new Set();
    const expanded = new Set();
    selectedAccountIds.forEach(id => {
      getDescendantIds(id, cachedAccounts).forEach(d => expanded.add(d));
    });
    return expanded;
  }, [selectedAccountIds, cachedAccounts]);

  const clearAllFilters = () => {
    setSelectedAccountIds(new Set());
    setSelectedDocIds(new Set());
    setSelectedOffsetAccountIds(new Set());
    setTxnTypeFilter('ALL');
  };

  const activeFilterCount = selectedAccountIds.size + selectedDocIds.size + selectedOffsetAccountIds.size + (txnTypeFilter !== 'ALL' ? 1 : 0);

  const handleAccountCreated = (newAccount) => {
    setCachedAccounts(prev => [...prev, newAccount]);
  };

  // ── Shared helper: patch one row in local state by uncategorized_transaction_id ──
  const updateTxnInState = (uncatId, patchFn) => {
    setTransactions(prev => prev.map(txn =>
      txn.uncategorized_transaction_id === uncatId ? patchFn(txn) : txn
    ));
  };

  const handleCategorize = async () => {
    const uncategorizedItems = transactions.filter(
      txn => !(txn.transactions && txn.transactions.length > 0)
    );
    if (uncategorizedItems.length === 0) {
      showToast('All transactions are already categorised!', 'success');
      return;
    }
    setIsCategorizing(true);
    localStorage.setItem('isCategorizing', 'true');
    setCategoriseStatus('Starting…');
    localStorage.setItem('categoriseStatus', 'Starting…');
    showToast('Categorization started. You can continue using other parts of the app.', 'info');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/transactions/categorize-bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ transactions: uncategorizedItems })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.message) {
              setCategoriseStatus(payload.message);
              localStorage.setItem('categoriseStatus', payload.message);
            }
            if (payload.flush) {
              fetchTransactions(activeFilter, true);
            }
            if (payload.done) {
              showToast('✅ Bulk categorise success!', 'success');
              fetchTransactions(activeFilter, true);
            }
            if (payload.error) {
              showToast('Bulk categorisation failed', 'error');
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('Categorise failed:', err);
      showToast('Failed to categorise transactions', 'error');
    } finally {
      setIsCategorizing(false);
      localStorage.removeItem('isCategorizing');
      setCategoriseStatus('');
      localStorage.removeItem('categoriseStatus');
    }
  };

  const handleApprove = (transactionId, isUncategorised, uncatId) => {
    if (isUncategorised) {
      showToast('Cannot approve: transaction uses uncategorised account. Please assign a category first.', 'error');
      return;
    }
    // Snapshot for rollback
    const prev = transactions.find(t => t.uncategorized_transaction_id === uncatId);
    // Update immediately — zero perceived latency
    updateTxnInState(uncatId, txn => ({
      ...txn,
      transactions: [{ ...txn.transactions[0], review_status: 'APPROVED' }]
    }));
    // Fire API in background
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${API_BASE_URL}/api/transactions/${transactionId}/approve`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`
          }
        });
        if (!response.ok) {
          const errorData = await response.json();
          showToast(errorData.error || 'Failed to approve — reverted', 'error');
          // Roll back
          if (prev) setTransactions(p => p.map(t =>
            t.uncategorized_transaction_id === uncatId ? prev : t
          ));
        }
      } catch {
        showToast('Failed to approve — reverted', 'error');
        if (prev) setTransactions(p => p.map(t =>
          t.uncategorized_transaction_id === uncatId ? prev : t
        ));
      }
    })();
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setIsApprovingBulk(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/transactions/approve-bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ transaction_ids: Array.from(selectedIds) })
      });

      const data = await response.json();

      if (response.ok) {
        if (data.blocked_count && data.blocked_count > 0) {
          showToast(`${data.approved_count} transactions approved. ${data.blocked_count} transactions require categorisation.`, 'warning');
        } else {
          showToast(`${data.approved_count} transactions approved`, 'success');
        }
        // Optimistic: mark approved IDs as APPROVED in local state
        const blockedSet = new Set(data.blocked_transaction_ids || []);
        setTransactions(prev => prev.map(txn => {
          if (!txn.transactions?.[0]) return txn;
          const tid = txn.transactions[0].transaction_id;
          if (selectedIds.has(tid) && !blockedSet.has(tid)) {
            return { ...txn, transactions: [{ ...txn.transactions[0], review_status: 'APPROVED' }] };
          }
          return txn;
        }));
        setSelectedIds(new Set());
      } else {
        if (data.blocked_transaction_ids && data.blocked_transaction_ids.length > 0) {
          const blockedCount = data.blocked_transaction_ids.length;
          showToast(`Cannot approve: ${blockedCount} transactions are uncategorised.`, 'error');
        } else {
          showToast(data.error || 'Bulk approval failed', 'error');
        }
      }
    } catch (err) {
      console.error('Bulk approve failed:', err);
      showToast('Bulk approval failed', 'error');
    } finally {
      setIsApprovingBulk(false);
    }
  };

  const handleRecategorize = (selectedAccount) => {
    const uncatId = recatTarget.uncategorized_transaction_id;
    const transactionId = recatTarget.transactions[0].transaction_id;
    const prevTxn = transactions.find(t => t.uncategorized_transaction_id === uncatId);
    // Close modal & update UI immediately
    setRecatTarget(null);
    updateTxnInState(uncatId, txn => ({
      ...txn,
      transactions: [{
        ...txn.transactions[0],
        offset_account_id: selectedAccount.account_id,
        accounts: { account_name: selectedAccount.account_name },
        categorised_by: 'MANUAL',
        review_status: 'APPROVED',
        is_uncategorised: false,
      }]
    }));
    // Fire API in background
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(
          `${API_BASE_URL}/api/transactions/${transactionId}/recategorize`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token || ''}`
            },
            body: JSON.stringify({ offset_account_id: selectedAccount.account_id })
          }
        );
        const result = await response.json();
        if (response.ok) {
          // Trigger auto-approve in the background
          fetch(`${API_BASE_URL}/api/transactions/${transactionId}/approve`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token || ''}`
            }
          }).catch(console.error);

          if (result.similarTransactions && result.similarTransactions.length > 0) {
            setSimilarTxns(result.similarTransactions);
            setSimilarSuggestedAccount(result.suggestedAccount);
            setSimilarAccountOverrides({});
          }
        } else {
          showToast('Failed to update category — reverted', 'error');
          if (prevTxn) setTransactions(p => p.map(t =>
            t.uncategorized_transaction_id === uncatId ? prevTxn : t
          ));
        }
      } catch {
        showToast('Failed to update category — reverted', 'error');
        if (prevTxn) setTransactions(p => p.map(t =>
          t.uncategorized_transaction_id === uncatId ? prevTxn : t
        ));
      }
    })();
  };

  const handleManualCategorize = (selectedAccount) => {
    const uncatId = manualTarget.uncategorized_transaction_id;
    const prevTxn = transactions.find(t => t.uncategorized_transaction_id === uncatId);
    // Close modal & update UI immediately
    setManualTarget(null);
    updateTxnInState(uncatId, txn => ({
      ...txn,
      transactions: [{
        transaction_id: null, // will be filled by server, not needed for display
        review_status: 'APPROVED',
        attention_level: 'LOW',
        offset_account_id: selectedAccount.account_id,
        categorised_by: 'MANUAL',
        is_uncategorised: false,
        accounts: { account_name: selectedAccount.account_name },
      }]
    }));
    // Fire API in background
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${API_BASE_URL}/api/transactions/manual-categorize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`
          },
          body: JSON.stringify({
            uncategorized_transaction_id: uncatId,
            offset_account_id: selectedAccount.account_id
          })
        });
        const result = await response.json();
        if (response.ok) {
          if (result.similarTransactions && result.similarTransactions.length > 0) {
            setSimilarTxns(result.similarTransactions);
            setSimilarSuggestedAccount(result.suggestedAccount);
            setSimilarAccountOverrides({});
          }
        } else {
          showToast('Failed to save categorization — reverted', 'error');
          if (prevTxn) setTransactions(p => p.map(t =>
            t.uncategorized_transaction_id === uncatId ? prevTxn : t
          ));
        }
      } catch {
        showToast('Failed to save categorization — reverted', 'error');
        if (prevTxn) setTransactions(p => p.map(t =>
          t.uncategorized_transaction_id === uncatId ? prevTxn : t
        ));
      }
    })();
  };

  const handleChangeSourceAccount = (selectedAccount) => {
    const uncatId = srcAccTarget.uncategorized_transaction_id;
    const prevTxn = transactions.find(t => t.uncategorized_transaction_id === uncatId);
    setSrcAccTarget(null);
    updateTxnInState(uncatId, txn => ({
      ...txn,
      account_id: selectedAccount.account_id,
      source_account: { account_id: selectedAccount.account_id, account_name: selectedAccount.account_name },
      transactions: txn.transactions?.length > 0 ? [{
        ...txn.transactions[0],
        base_account_id: selectedAccount.account_id
      }] : txn.transactions
    }));
    
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${API_BASE_URL}/api/transactions/${uncatId}/source-account`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`
          },
          body: JSON.stringify({ account_id: selectedAccount.account_id })
        });
        if (!response.ok) {
          const data = await response.json();
          showToast(data.error || 'Failed to update source account — reverted', 'error');
          if (prevTxn) setTransactions(p => p.map(t =>
            t.uncategorized_transaction_id === uncatId ? prevTxn : t
          ));
        }
      } catch {
        showToast('Failed to update source account — reverted', 'error');
        if (prevTxn) setTransactions(p => p.map(t =>
          t.uncategorized_transaction_id === uncatId ? prevTxn : t
        ));
      }
    })();
  };

  const handleSimilarBulkConfirm = async () => {
    setIsApprovingSimilar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Recategorise each transaction (use override if set, else suggestedAccount)
      await Promise.all(similarTxns.map(txn => {
        const account = similarAccountOverrides[txn.transaction_id] || similarSuggestedAccount;
        return fetch(`${API_BASE_URL}/api/transactions/${txn.transaction_id}/recategorize`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`
          },
          body: JSON.stringify({ offset_account_id: account.account_id })
        });
      }));

      // Bulk approve all of them
      await fetch(`${API_BASE_URL}/api/transactions/approve-bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ transaction_ids: similarTxns.map(t => t.transaction_id) })
      });

      showToast(`${similarTxns.length} similar transactions confirmed`, 'success');
      setSimilarTxns([]);
      setSimilarSuggestedAccount(null);
      fetchTransactions(activeFilter, true);
    } catch (err) {
      showToast('Failed to confirm similar transactions', 'error');
    } finally {
      setIsApprovingSimilar(false);
    }
  };

  const handleSimilarIndividualApprove = async (txn) => {
    try {
      const account = similarAccountOverrides[txn.transaction_id] || similarSuggestedAccount;
      const { data: { session } } = await supabase.auth.getSession();

      await fetch(`${API_BASE_URL}/api/transactions/${txn.transaction_id}/recategorize`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ offset_account_id: account.account_id })
      });

      await fetch(`${API_BASE_URL}/api/transactions/${txn.transaction_id}/approve`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
      });

      setSimilarTxns(prev => {
        const remaining = prev.filter(t => t.transaction_id !== txn.transaction_id);
        if (remaining.length === 0) fetchTransactions(activeFilter, true);
        return remaining;
      });
    } catch (err) {
      showToast('Failed to approve transaction', 'error');
    }
  };

  // Correct amount/type — clicking on the amount cell triggers this
  const handleCorrect = (uncategorizedTransactionId, amount, transaction_type) => {
    const prevTxn = transactions.find(t => t.uncategorized_transaction_id === uncategorizedTransactionId);
    // Update immediately
    setCorrectingId(null);
    updateTxnInState(uncategorizedTransactionId, txn => {
      const updatedTxn = {
        ...txn,
        debit: transaction_type === 'DEBIT' ? amount : 0,
        credit: transaction_type === 'CREDIT' ? amount : 0,
      };
      if (txn.transactions && txn.transactions.length > 0) {
        updatedTxn.transactions = [{ ...txn.transactions[0], review_status: 'PENDING' }];
      } else {
        updatedTxn.transactions = [];
      }
      return updatedTxn;
    });
    // Fire API in background
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(
          `${API_BASE_URL}/api/transactions/${uncategorizedTransactionId}/correct`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token || ''}`
            },
            body: JSON.stringify({ amount, transaction_type })
          }
        );
        const data = await response.json();
        if (response.status === 403) {
          showToast(data.error, 'error');
          if (prevTxn) setTransactions(p => p.map(t =>
            t.uncategorized_transaction_id === uncategorizedTransactionId ? prevTxn : t
          ));
        } else if (!response.ok) {
          showToast(data.error || 'Failed to correct — reverted', 'error');
          if (prevTxn) setTransactions(p => p.map(t =>
            t.uncategorized_transaction_id === uncategorizedTransactionId ? prevTxn : t
          ));
        }
      } catch {
        showToast('Failed to correct — reverted', 'error');
        if (prevTxn) setTransactions(p => p.map(t =>
          t.uncategorized_transaction_id === uncategorizedTransactionId ? prevTxn : t
        ));
      }
    })();
  };

  const secondaryFiltered = transactions.filter((txn) => {
    const isCategorised = txn.transactions && txn.transactions.length > 0;
    
    // Date Range Filter
    if (dateRange.start || dateRange.end) {
      const tDate = txn.txn_date.split('T')[0];
      if (dateRange.start && tDate < dateRange.start) return false;
      if (dateRange.end && tDate > dateRange.end) return false;
    }

    // Wait for cachedAccounts to be loaded before applying account-expansion filters
    // (descendant expansion is meaningless until the account tree is available)
    const accountsReady = cachedAccounts.length > 0;
    if (accountsReady && expandedSrcIds.size > 0 && !expandedSrcIds.has(txn.account_id)) return false;
    if (selectedDocIds.size > 0 && !selectedDocIds.has(txn.document_id)) return false;
    if (txnTypeFilter === 'DEBIT' && !(txn.debit > 0)) return false;
    if (txnTypeFilter === 'CREDIT' && !(txn.credit > 0)) return false;
    // Destination (offset) account filter — includes sub-accounts
    if (accountsReady && expandedOffsetIds.size > 0) {
      const offsetId = isCategorised ? txn.transactions[0]?.offset_account_id : null;
      if (!offsetId || !expandedOffsetIds.has(offsetId)) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (txn.details && txn.details.toLowerCase().includes(q)) return true;
      if (txn.debit && txn.debit.toString().includes(q)) return true;
      if (txn.credit && txn.credit.toString().includes(q)) return true;
      if (isCategorised && txn.transactions[0].accounts?.account_name?.toLowerCase().includes(q)) return true;
      return false;
    }
    return true;
  });

  const filteredTransactions = secondaryFiltered.filter((txn) => {
    const isCategorised = txn.transactions && txn.transactions.length > 0;
    if (activeFilter === 'PENDING_CAT' && isCategorised) return false;
    if (activeFilter === 'PENDING_APP' && !(isCategorised && txn.transactions[0].review_status === 'PENDING')) return false;
    if (activeFilter === 'APPROVED' && !(isCategorised && txn.transactions[0].review_status === 'APPROVED')) return false;
    return true;
  }).sort((a, b) => {
    const tA = new Date(a.txn_date).getTime();
    const tB = new Date(b.txn_date).getTime();
    return dateSortOrder === 'asc' ? tA - tB : tB - tA;
  });

  const handleFilterChange = (newFilter) => {
    setActiveFilter(newFilter);
    if (newFilter !== 'PENDING_APP') {
      setSelectedIds(new Set());
    }
  };

  const getGroupedTransactions = () => {
    if (activeFilter !== 'PENDING_APP') return null;
    const grouped = {};
    ATTENTION_ORDER.forEach((level) => { grouped[level] = []; });
    filteredTransactions.forEach((txn) => {
      const level = txn.transactions[0].attention_level || 'LOW';
      if (grouped[level]) grouped[level].push(txn);
    });
    return ATTENTION_ORDER.map((level) => ({
      level,
      transactions: grouped[level]
    })).filter((group) => group.transactions.length > 0);
  };

  const toggleSelectAll = (level) => {
    const txnsInLevel = filteredTransactions.filter(
      (txn) => txn.transactions[0].attention_level === level
    );
    const selectableTxns = txnsInLevel.filter((txn) => !txn.transactions[0].is_uncategorised);
    const idsInLevel = new Set(selectableTxns.map((txn) => txn.transactions[0].transaction_id));
    const allSelected = selectableTxns.every((txn) =>
      selectedIds.has(txn.transactions[0].transaction_id)
    );
    if (allSelected) {
      const newSelected = new Set(selectedIds);
      idsInLevel.forEach((id) => newSelected.delete(id));
      setSelectedIds(newSelected);
    } else {
      setSelectedIds(new Set([...selectedIds, ...idsInLevel]));
    }
  };

  const isGroupSelected = (level) => {
    const txnsInLevel = filteredTransactions.filter(
      (txn) => txn.transactions[0].attention_level === level
    );
    const selectableTxns = txnsInLevel.filter((txn) => !txn.transactions[0].is_uncategorised);
    return selectableTxns.length > 0 && selectableTxns.every((txn) =>
      selectedIds.has(txn.transactions[0].transaction_id)
    );
  };

  // Renders the amount cell. Clicking opens the inline AmountEditor.
  const renderAmountCell = (txn) => {
    const isDebit = txn.debit > 0;
    const amount = isDebit ? txn.debit : txn.credit;

    if (correctingId === txn.uncategorized_transaction_id) {
      return (
        <AmountEditor
          txn={txn}
          onSave={handleCorrect}
          onCancel={() => setCorrectingId(null)}
        />
      );
    }

    return (
      <div
        className={`amount-cell-clickable ${isDebit ? 'debit-cell' : 'credit-cell'}`}
        title="Click to correct amount or type"
        onClick={() => setCorrectingId(txn.uncategorized_transaction_id)}
      >
        {isDebit ? `- ₹${amount}` : `+ ₹${amount}`}
        <span className="amount-edit-hint">✎</span>
      </div>
    );
  };

  const allCount = secondaryFiltered.length;
  const pendingCatCount = secondaryFiltered.filter(t =>
    !(t.transactions && t.transactions.length > 0)
  ).length;
  const pendingAppCount = secondaryFiltered.filter(t =>
    t.transactions?.[0]?.review_status === 'PENDING'
  ).length;
  const approvedCount = secondaryFiltered.filter(t =>
    t.transactions?.[0]?.review_status === 'APPROVED'
  ).length;

  return (
    <div className="transactions-container">
      <div className="page-header">
        <div id="transactions-header-title" className="header-title">
          <h1 id="transactions-title">Transactions</h1>
          <p>Manage and categorize your bank statements and ledger entries.</p>
        </div>
        <div className="header-actions">
          <button
            id="transactions-upload-btn"
            className="action-btn upload"
            onClick={() => navigate('/parsing')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ICONS.Upload /> Upload
          </button>
          {activeFilter === 'PENDING_APP' ? (
            <button
              className={`action-btn approve-selected ${selectedIds.size > 0 ? 'has-selection' : ''}`}
              onClick={handleBulkApprove}
              disabled={selectedIds.size === 0 || isApprovingBulk}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isApprovingBulk ? <span className="spinner-small"></span> : <ICONS.Check />}
              {isApprovingBulk ? `Approving ${selectedIds.size}...` : `Approve Selected (${selectedIds.size})`}
            </button>
          ) : (
            <button
              id="transactions-categorize-btn"
              className={`action-btn ${isCategorizing ? 'categorising' : ''}`}
              onClick={handleCategorize}
              disabled={isCategorizing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isCategorizing
                ? <><span className="spinner-small"></span> {categoriseStatus || 'Categorising…'}</>
                : <><ICONS.Robot /> Categorise</>
              }
            </button>
          )}
        </div>
      </div>

      <div id="transactions-tabs" className="filter-tabs">
        <button
          id="transactions-tab-all"
          className={`filter-tab ${activeFilter === 'ALL' ? 'active' : ''}`}
          onClick={() => handleFilterChange('ALL')}
        >All ({allCount})</button>
        <button
          id="transactions-tab-pending-cat"
          className={`filter-tab ${activeFilter === 'PENDING_CAT' ? 'active' : ''}`}
          onClick={() => handleFilterChange('PENDING_CAT')}
        >Pending Categorisation ({pendingCatCount})</button>
        <button
          id="transactions-tab-pending-app"
          className={`filter-tab ${activeFilter === 'PENDING_APP' ? 'active' : ''}`}
          onClick={() => handleFilterChange('PENDING_APP')}
        >Pending Approval ({pendingAppCount})</button>
        <button
          id="transactions-tab-approved"
          className={`filter-tab ${activeFilter === 'APPROVED' ? 'active' : ''}`}
          onClick={() => handleFilterChange('APPROVED')}
        >Approved ({approvedCount})</button>

        {/* ── Search Input ── fills remaining space */}
        <div className="search-input-wrapper" style={{ flex: 1, marginLeft: 'auto', display: 'flex', alignItems: 'stretch' }}>
          <input
            type="text"
            placeholder="Search details, amounts, categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0 12px',
              borderRadius: '8px',
              border: '1px solid var(--glass-border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              outline: 'none',
              width: '100%',
              height: '100%',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* ── Date Range Popup ── */}
        <div className="filter-popup-wrapper" ref={datePopupRef} style={{ marginLeft: '4px' }}>
          <button
            className={`filter-tab ${(dateRange.start || dateRange.end) ? 'filter-tab-active' : ''}`}
            onClick={() => setIsDatePopupOpen(v => !v)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Date
            {(dateRange.start || dateRange.end) && (
              <span className="filter-count-badge">1</span>
            )}
          </button>

          {isDatePopupOpen && (
            <div className="filter-popup" style={{ width: '280px' }}>
              <div className="filter-popup-header">
                <span>Date Range</span>
                {(dateRange.start || dateRange.end) && (
                  <button className="filter-clear-btn" onClick={() => { setDateRange({start: '', end: ''}); setIsDatePopupOpen(false); }}>Clear</button>
                )}
              </div>
              
              <div className="filter-group">
                <div className="filter-group-label" style={{ marginBottom: '8px' }}>Quick Select</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '0 12px 8px' }}>
                  <button className="filter-tab" style={{ justifyContent: 'center' }} onClick={() => setQuickDate('7D')}>Last 7 Days</button>
                  <button className="filter-tab" style={{ justifyContent: 'center' }} onClick={() => setQuickDate('30D')}>Last 30 Days</button>
                  <button className="filter-tab" style={{ justifyContent: 'center' }} onClick={() => setQuickDate('THIS_MONTH')}>This Month</button>
                  <button className="filter-tab" style={{ justifyContent: 'center' }} onClick={() => setQuickDate('LAST_MONTH')}>Last Month</button>
                  <button className="filter-tab" style={{ justifyContent: 'center' }} onClick={() => setQuickDate('THIS_YEAR')}>This Year</button>
                  <button className="filter-tab" style={{ justifyContent: 'center' }} onClick={() => setQuickDate('LAST_FY')}>Last FY</button>
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-group-label" style={{ marginBottom: '8px' }}>Custom Range</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 12px 6px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 'bold' }}>Start Date</label>
                    <input 
                      type="date" 
                      className="amount-editor-input" 
                      style={{ height: '36px' }}
                      value={dateRange.start}
                      onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 'bold' }}>End Date</label>
                    <input 
                      type="date" 
                      className="amount-editor-input" 
                      style={{ height: '36px' }}
                      value={dateRange.end}
                      onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Filter popup ── */}
        <div className="filter-popup-wrapper" ref={filterRef} style={{ marginLeft: '4px' }}>
          <button
            className={`filter-tab ${activeFilterCount > 0 ? 'filter-tab-active' : ''}`}
            onClick={() => setIsFilterOpen(v => !v)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
            Filter
            {activeFilterCount > 0 && (
              <span className="filter-count-badge">{activeFilterCount}</span>
            )}
          </button>

          {isFilterOpen && (
            <div className="filter-popup">
              <div className="filter-popup-header">
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <button className="filter-clear-btn" onClick={clearAllFilters}>Clear all</button>
                )}
              </div>

              {/* ── Debit / Credit ── */}
              <div className="filter-group">
                <div className="filter-group-label">Transaction Type</div>
                {['ALL', 'DEBIT', 'CREDIT'].map(type => (
                  <label key={type} className="filter-option">
                    <input
                      type="radio"
                      name="txn-type-filter"
                      value={type}
                      checked={txnTypeFilter === type}
                      onChange={() => setTxnTypeFilter(type)}
                    />
                    <span>
                      {type === 'ALL' ? 'All' : type === 'DEBIT' ? '− Debit' : '+ Credit'}
                    </span>
                  </label>
                ))}
              </div>

              {filterAccounts.length > 0 && (
                <div className="filter-group">
                  <div className="filter-group-label">Bank Account / Credit Card</div>
                  {filterAccounts.map(acc => (
                    <label key={acc.account_id} className="filter-option">
                      <input
                        type="checkbox"
                        checked={selectedAccountIds.has(acc.account_id)}
                        onChange={() => toggleAccountFilter(acc.account_id)}
                      />
                      <span>{acc.account_name}</span>
                    </label>
                  ))}
                </div>
              )}

              {filterDocuments.length > 0 && (
                <div className="filter-group">
                  <div className="filter-group-label">Uploaded Document</div>
                  {filterDocuments.map(doc => (
                    <label key={doc.document_id} className="filter-option">
                      <input
                        type="checkbox"
                        checked={selectedDocIds.has(doc.document_id)}
                        onChange={() => toggleDocFilter(doc.document_id)}
                      />
                      <span title={doc.file_name}>
                        {doc.file_name.length > 30 ? doc.file_name.slice(0, 28) + '…' : doc.file_name}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* ── Destination (Offset) Account ── */}
              {cachedAccounts.length > 0 && (
                <div className="filter-group">
                  <div className="filter-group-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Destination Account</span>
                    {selectedOffsetAccountIds.size > 0 && (
                      <button
                        className="filter-clear-btn"
                        style={{ fontSize: '10px', padding: '1px 6px' }}
                        onClick={() => setSelectedOffsetAccountIds(new Set())}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {/* Inline search for the account tree */}
                  <div style={{ padding: '0 12px 6px' }}>
                    <input
                      type="text"
                      placeholder="Search accounts…"
                      value={offsetAccountSearch}
                      onChange={e => setOffsetAccountSearch(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: '100%',
                        padding: '5px 9px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--glass-border)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <OffsetAccountTree
                    accounts={cachedAccounts}
                    selectedIds={selectedOffsetAccountIds}
                    onToggle={toggleOffsetAccountFilter}
                    searchQuery={offsetAccountSearch}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="transactions-content">
        <div className="placeholder-table">
          {activeFilter === 'PENDING_APP' ? (
            <>
              {loading ? (
                <div className="empty-state" style={{ padding: '40px' }}>
                  <span className="spinner"></span>
                  <p>Loading transactions...</p>
                </div>
              ) : getGroupedTransactions() && getGroupedTransactions().length > 0 ? (
                <>
                  <div className="table-header grouped">
                    <div></div>
                    <div
                      style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => setDateSortOrder(p => p === 'desc' ? 'asc' : 'desc')}
                    >
                      Date {dateSortOrder === 'desc' ? '↓' : '↑'}
                    </div>
                    <div>Details</div>
                    <div>Amount</div>
                    <div>Src Acc</div>
                    <div>Dest Acc</div>
                    <div>Categorised By</div>
                  </div>
                  <div className="placeholder-rows">
                    {getGroupedTransactions().map((group) => (
                      <div key={group.level}>
                        <div className="attention-group-header">
                          <button
                            className={`select-all-btn ${isGroupSelected(group.level) ? 'active' : ''}`}
                            onClick={() => toggleSelectAll(group.level)}
                          >
                            {isGroupSelected(group.level) ? '✓ Deselect' : '☐ Select'}
                          </button>
                          <span className={`attention-label ${group.level.toLowerCase()}`}>
                            {group.level} ATTENTION
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            ({group.transactions.length})
                          </span>
                        </div>
                        {group.transactions.map((txn) => {
                          const isChecked = selectedIds.has(txn.transactions[0].transaction_id);
                          const accountName = txn.transactions[0].accounts
                            ? txn.transactions[0].accounts.account_name
                            : '-';
                          const isUncategorised = txn.transactions[0].is_uncategorised;
                          const categorisedBy = txn.transactions[0].categorised_by || '-';

                          return (
                            <div
                              key={txn.uncategorized_transaction_id}
                              className={`table-row grouped ${isApprovingBulk && selectedIds.has(txn.transactions[0].transaction_id) ? 'row-approving' : ''}`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <input
                                  type="checkbox"
                                  className="row-checkbox"
                                  checked={isChecked}
                                  disabled={isUncategorised}
                                  onChange={() => {
                                    const newSelected = new Set(selectedIds);
                                    if (isChecked) {
                                      newSelected.delete(txn.transactions[0].transaction_id);
                                    } else {
                                      newSelected.add(txn.transactions[0].transaction_id);
                                    }
                                    setSelectedIds(newSelected);
                                  }}
                                />
                              </div>
                              <div>{new Date(txn.txn_date).toLocaleDateString()}</div>
                              <div className="details-cell">{txn.details}</div>
                              {renderAmountCell(txn)}
                              <div
                                className="account-cell-clickable"
                                onClick={() => setSrcAccTarget(txn)}
                                style={{ cursor: 'pointer' }}
                                title="Click to change base account"
                              >
                                {txn.source_account?.account_name || '-'}
                              </div>
                              <div
                                className={txn.transactions[0].accounts ? 'account-cell-clickable' : ''}
                                onClick={() => { if (txn.transactions[0].accounts) setRecatTarget(txn); }}
                                style={{ cursor: txn.transactions[0].accounts ? 'pointer' : 'default' }}
                              >
                                {accountName}
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                {categorisedBy}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-state" style={{ padding: '40px' }}>
                  <span className="empty-icon" style={{ opacity: 0.15 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  </span>
                  <p>No pending approvals</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div
                className="table-header"
                style={{
                  gridTemplateColumns: activeFilter === 'PENDING_CAT'
                    ? '110px 1fr 110px 130px 150px 160px'
                    : activeFilter === 'APPROVED'
                    ? '110px 1fr 110px 130px 150px 140px'
                    : '110px 1fr 110px 130px 150px 140px 160px 40px'
                }}
              >
                <div
                  style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setDateSortOrder(p => p === 'desc' ? 'asc' : 'desc')}
                >
                  Date {dateSortOrder === 'desc' ? '↓' : '↑'}
                </div>
                <div>Details</div>
                <div>Amount</div>
                <div>Src Acc</div>
                <div>Dest Acc</div>
                {activeFilter !== 'PENDING_CAT' && <div>Categorised By</div>}
                {activeFilter !== 'APPROVED' && <div>Status</div>}
                {activeFilter !== 'PENDING_CAT' && activeFilter !== 'APPROVED' && <div>Actions</div>}
              </div>
              <div id="transactions-table" className="placeholder-rows">
                {loading ? (
                  <div className="empty-state">
                    <span className="spinner"></span>
                    <p>Loading transactions...</p>
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon" style={{ opacity: 0.15 }}>
                      {activeFilter === 'ALL' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      )}
                    </span>
                    <p>
                      {activeFilter === 'ALL' && 'No transactions'}
                      {activeFilter === 'PENDING_CAT' && 'All transactions categorised'}
                    </p>
                  </div>
                ) : (
                  filteredTransactions.map((txn) => {
                    const isCategorised = txn.transactions && txn.transactions.length > 0;
                    const transactionId = isCategorised ? txn.transactions[0].transaction_id : null;
                    const status = isCategorised
                      ? txn.transactions[0].review_status
                      : 'Pending Categorisation';
                    const isApproving = approvingIds.has(transactionId);
                    const accountName = isCategorised && txn.transactions[0].accounts
                      ? txn.transactions[0].accounts.account_name
                      : '-';
                    const categorisedBy = isCategorised ? txn.transactions[0].categorised_by : '-';
                    const isUncategorised = isCategorised ? txn.transactions[0].is_uncategorised : false;

                    return (
                      <div
                        key={txn.uncategorized_transaction_id}
                        className={`table-row ${isApprovingBulk && selectedIds.has(transactionId) ? 'row-approving' : ''}`}
                        style={{
                          gridTemplateColumns: activeFilter === 'PENDING_CAT'
                            ? '110px 1fr 110px 130px 150px 160px'
                            : activeFilter === 'APPROVED'
                            ? '110px 1fr 110px 130px 150px 140px'
                            : '110px 1fr 110px 130px 150px 140px 160px 40px'
                        }}
                      >
                        <div>{new Date(txn.txn_date).toLocaleDateString()}</div>
                        <div className="details-cell">{txn.details}</div>
                        {renderAmountCell(txn)}
                        <div
                          className="account-cell-clickable"
                          onClick={() => setSrcAccTarget(txn)}
                          style={{ cursor: 'pointer' }}
                          title="Click to change base account"
                        >
                          {txn.source_account?.account_name || '-'}
                        </div>
                        <div
                          className={
                            isCategorised && txn.transactions[0].accounts
                              ? 'account-cell-clickable'
                              : isCategorised === false
                              ? 'account-cell-clickable uncategorised'
                              : ''
                          }
                          onClick={() => {
                            if (isCategorised && txn.transactions[0].accounts) {
                              setRecatTarget(txn);
                            } else if (!isCategorised) {
                              setManualTarget(txn);
                            }
                          }}
                          style={{
                            cursor:
                              (isCategorised && txn.transactions[0].accounts) || !isCategorised
                                ? 'pointer'
                                : 'default'
                          }}
                        >
                          {isCategorised ? accountName : '+ Assign'}
                        </div>
                        {activeFilter !== 'PENDING_CAT' && (
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {categorisedBy}
                          </div>
                        )}
                        {activeFilter !== 'APPROVED' && (
                          <div>
                            <span className={`status-badge ${status.toLowerCase().replace(' ', '-')}`}>
                              {status === 'PENDING' ? 'Pending Approval' : status}
                            </span>
                          </div>
                        )}
                        {activeFilter !== 'PENDING_CAT' && activeFilter !== 'APPROVED' && (
                          <div className="actions-cell">
                            {status === 'PENDING' && isCategorised ? (
                              <button
                                className="action-icon-btn approve"
                                onClick={() => handleApprove(transactionId, isUncategorised, txn.uncategorized_transaction_id)}
                                title="Approve"
                                disabled={isApproving}
                              >
                                {isApproving ? (
                                  <span className="spinner-small"></span>
                                ) : (
                                  <ICONS.Check />
                                )}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>—</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {similarTxns.length > 0 && (
        <div className="modal-overlay" onClick={() => setSimilarTxns([])}>
          <div className="similar-txns-modal" onClick={e => e.stopPropagation()}>

            <div className="modal-header">
              <div>
                <h2>Similar Transactions Found</h2>
                <p className="similar-subtitle">
                  {similarTxns.length} similar pending transaction{similarTxns.length > 1 ? 's' : ''} —
                  suggested account: <strong>{similarSuggestedAccount?.account_name}</strong>
                </p>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSimilarTxns([])}
                style={{ background: 'none', border: 'none', fontSize: '20px',
                         cursor: 'pointer', color: 'var(--text-secondary)' }}
              >✕</button>
            </div>

            <div className="similar-txns-list">
              {similarTxns.map(txn => {
                const assignedAccount = similarAccountOverrides[txn.transaction_id] || similarSuggestedAccount;
                return (
                  <div key={txn.transaction_id} className="similar-txn-row">
                    <div className="similar-txn-date">
                      {new Date(txn.transaction_date).toLocaleDateString('en-IN',
                        { year: 'numeric', month: 'short', day: '2-digit' })}
                    </div>
                    <div className="similar-txn-details" title={txn.details}>
                      {txn.details}
                    </div>
                    <div className="similar-txn-amount">
                      {txn.transaction_type === 'DEBIT' ? '−' : '+'}
                      ₹{(txn.amount || 0).toLocaleString('en-IN')}
                    </div>
                    <div className="similar-txn-from">
                      <span className="similar-from-label" title={txn.current_account?.account_name}>
                        {txn.current_account?.account_name || '—'}
                      </span>
                      <span className="similar-arrow">→</span>
                      <button
                        className="similar-account-btn"
                        onClick={() => setSimilarPickerTarget(txn.transaction_id)}
                      >
                        {assignedAccount?.account_name}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2.5">
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>
                    </div>
                    <button
                      className="action-icon-btn approve"
                      title="Approve this one"
                      onClick={() => handleSimilarIndividualApprove(txn)}
                    >
                      <ICONS.Check />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="similar-txns-footer">
              <button className="action-btn" onClick={() => setSimilarTxns([])}>
                Dismiss
              </button>
              <button
                className="action-btn approve-selected has-selection"
                onClick={handleSimilarBulkConfirm}
                disabled={isApprovingSimilar}
              >
                {isApprovingSimilar
                  ? <><span className="spinner-small"></span> Confirming...</>
                  : <><ICONS.Check /> Confirm All ({similarTxns.length})</>
                }
              </button>
            </div>

          </div>

          {similarPickerTarget && (
            <AccountPickerModal
              onClose={() => setSimilarPickerTarget(null)}
              currentAccountId={
                (similarAccountOverrides[similarPickerTarget] || similarSuggestedAccount)?.account_id
              }
              preloadedAccounts={cachedAccounts}
              onAccountCreated={handleAccountCreated}
              onSelect={(account) => {
                setSimilarAccountOverrides(prev => ({
                  ...prev,
                  [similarPickerTarget]: account
                }));
                setSimilarPickerTarget(null);
              }}
            />
          )}
        </div>
      )}


      {recatTarget && (
        <AccountPickerModal
          onClose={() => setRecatTarget(null)}
          onSelect={handleRecategorize}
          currentAccountId={recatTarget.transactions[0].offset_account_id}
          transactionDirection={recatTarget.debit > 0 ? 'DEBIT' : 'CREDIT'}
          preloadedAccounts={cachedAccounts}
          onAccountCreated={handleAccountCreated}
        />
      )}
      {manualTarget && (
        <AccountPickerModal
          onClose={() => setManualTarget(null)}
          onSelect={handleManualCategorize}
          transactionDirection={manualTarget.debit > 0 ? 'DEBIT' : 'CREDIT'}
          preloadedAccounts={cachedAccounts}
          onAccountCreated={handleAccountCreated}
        />
      )}
      {srcAccTarget && (
        <AccountPickerModal
          onClose={() => setSrcAccTarget(null)}
          onSelect={handleChangeSourceAccount}
          currentAccountId={srcAccTarget.account_id}
          preloadedAccounts={cachedAccounts}
          allowedParentAccountNames={['Bank Accounts', 'Credit Cards']}
          onAccountCreated={handleAccountCreated}
        />
      )}
      <Toast toasts={toasts} />
    </div>
  );
};

export default Transactions;