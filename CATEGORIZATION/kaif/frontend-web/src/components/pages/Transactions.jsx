import React, { useState, useEffect, useRef } from 'react';
import UploadModal from '../UploadModal';
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

const Transactions = () => {
  const { toasts, showToast } = useToast();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [categoriseStatus, setCategoriseStatus] = useState('');
  const [isApprovingBulk, setIsApprovingBulk] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [recatTarget, setRecatTarget] = useState(null);
  const [manualTarget, setManualTarget] = useState(null);
  const [approvingIds, setApprovingIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [correctingId, setCorrectingId] = useState(null);
  const [cachedAccounts, setCachedAccounts] = useState([]);

  // ── Filter popup state ────────────────────────────────────────
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const [filterAccounts, setFilterAccounts] = useState([]); // { account_id, account_name }
  const [filterDocuments, setFilterDocuments] = useState([]); // { document_id, file_name }
  const [selectedAccountIds, setSelectedAccountIds] = useState(new Set());
  const [selectedDocIds, setSelectedDocIds] = useState(new Set());

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

  // Close filter popup on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setIsFilterOpen(false);
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

  const clearAllFilters = () => {
    setSelectedAccountIds(new Set());
    setSelectedDocIds(new Set());
  };

  const activeFilterCount = selectedAccountIds.size + selectedDocIds.size;

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
    setCategoriseStatus('Starting…');
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
            if (payload.message) setCategoriseStatus(payload.message);
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
      setCategoriseStatus('');
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
        review_status: 'PENDING',
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
        if (!response.ok) {
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
        if (!response.ok) {
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

  const filteredTransactions = transactions.filter((txn) => {
    const isCategorised = txn.transactions && txn.transactions.length > 0;
    if (activeFilter === 'PENDING_CAT' && isCategorised) return false;
    if (activeFilter === 'PENDING_APP' && !(isCategorised && txn.transactions[0].review_status === 'PENDING')) return false;
    // Apply account filter
    if (selectedAccountIds.size > 0 && !selectedAccountIds.has(txn.account_id)) return false;
    // Apply document filter
    if (selectedDocIds.size > 0 && !selectedDocIds.has(txn.document_id)) return false;
    return true;
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

  const allCount = transactions.length;
  const pendingCatCount = transactions.filter(t =>
    !(t.transactions && t.transactions.length > 0)
  ).length;
  const pendingAppCount = transactions.filter(t =>
    t.transactions?.[0]?.review_status === 'PENDING'
  ).length;

  return (
    <div className="transactions-container">
      <div className="page-header">
        <div className="header-title">
          <h1>Transactions</h1>
          <p>Manage and categorize your bank statements and ledger entries.</p>
        </div>
        <div class="header-actions">
          <button
            className="action-btn upload"
            onClick={() => setIsUploadOpen(true)}
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

      <div className="filter-tabs">
        <button
          className={`filter-tab ${activeFilter === 'ALL' ? 'active' : ''}`}
          onClick={() => handleFilterChange('ALL')}
        >All {allCount > 0 && <span className="filter-count-badge">{allCount}</span>}</button>
        <button
          className={`filter-tab ${activeFilter === 'PENDING_CAT' ? 'active' : ''}`}
          onClick={() => handleFilterChange('PENDING_CAT')}
        >Pending Categorisation {pendingCatCount > 0 && <span className="filter-count-badge">{pendingCatCount}</span>}</button>
        <button
          className={`filter-tab ${activeFilter === 'PENDING_APP' ? 'active' : ''}`}
          onClick={() => handleFilterChange('PENDING_APP')}
        >Pending Approval {pendingAppCount > 0 && <span className="filter-count-badge">{pendingAppCount}</span>}</button>

        {/* ── Filter popup ── pushed to the right */}
        <div className="filter-popup-wrapper" ref={filterRef} style={{ marginLeft: 'auto' }}>
          <button
            className={`filter-tab ${activeFilterCount > 0 ? 'filter-tab-active' : ''}`}
            onClick={() => setIsFilterOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
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

              {filterAccounts.length > 0 && (
                <div className="filter-group">
                  <div className="filter-group-label">Bank Account</div>
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

              {filterAccounts.length === 0 && filterDocuments.length === 0 && (
                <p className="filter-empty">No filter options available yet.</p>
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
                    <div>Date</div>
                    <div>Details</div>
                    <div>Amount</div>
                    <div>Account</div>
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
                    ? '110px 1fr 110px 150px 160px'
                    : '110px 1fr 110px 150px 140px 160px 40px'
                }}
              >
                <div>Date</div>
                <div>Details</div>
                <div>Amount</div>
                <div>Account</div>
                {activeFilter !== 'PENDING_CAT' && <div>Categorised By</div>}
                <div>Status</div>
                {activeFilter !== 'PENDING_CAT' && <div>Actions</div>}
              </div>
              <div className="placeholder-rows">
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
                            ? '110px 1fr 110px 150px 160px'
                            : '110px 1fr 110px 150px 140px 160px 40px'
                        }}
                      >
                        <div>{new Date(txn.txn_date).toLocaleDateString()}</div>
                        <div className="details-cell">{txn.details}</div>
                        {renderAmountCell(txn)}
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
                        <div>
                          <span className={`status-badge ${status.toLowerCase().replace(' ', '-')}`}>
                            {status === 'PENDING' ? 'Pending Approval' : status}
                          </span>
                        </div>
                        {activeFilter !== 'PENDING_CAT' && (
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

      {isUploadOpen && (
        <UploadModal
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={() => fetchTransactions(activeFilter)}
        />
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
      <Toast toasts={toasts} />
    </div>
  );
};

export default Transactions;
