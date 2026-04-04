import React, { useState, useEffect } from 'react';
import { supabase } from '../../shared/supabase';
import '../../styles/Analytics.css';

/**
 * Compute date range for a given period (month, quarter, year, all)
 */
const getPeriodRange = (period) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  if (period === 'all') {
    return {
      from: '2000-01-01',
      to: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }
  if (period === 'month') {
    return {
      from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      to: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }
  if (period === 'quarter') {
    const q = Math.floor(month / 3);
    const quarterStartMonth = q * 3 + 1;
    return {
      from: `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`,
      to: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }
  if (period === 'year') {
    return {
      from: `${year}-01-01`,
      to: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }
};

/**
 * Format currency value as ₹ with proper formatting
 */
const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return '₹0';
  return `₹${Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

/**
 * Format date as locale string
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
};

const Analytics = () => {
  const [view, setView] = useState('pl');           // 'pl' | 'balance' | 'ledger'
  const [period, setPeriod] = useState('month');    // 'month' | 'quarter' | 'year' | 'all'
  const [loading, setLoading] = useState(true);
  const [plData, setPlData] = useState(null);
  const [balanceData, setBalanceData] = useState(null);
  const [ledgerData, setLedgerData] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('ALL');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [includePending, setIncludePending] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('accounts')
        .select('account_id, account_name')
        .eq('user_id', user.id)
        .eq('account_type', 'ASSET');
      if (data) setBankAccounts(data);
    };
    fetchAccounts();
  }, []);

  /**
   * Fetch data based on current view and period
   */
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const range = getPeriodRange(period);

      if (view === 'pl') {
        // Fetch P&L data
        let query = supabase
          .from('transactions')
          .select(`
            transaction_id,
            amount,
            transaction_type,
            transaction_date,
            details,
            base_account_id,
            offset_account:offset_account_id (
              account_id,
              account_name,
              account_type
            )
          `)
          .eq('user_id', user.id)
          .eq('review_status', 'APPROVED')
          .eq('posting_status', 'POSTED')
          .gte('transaction_date', range.from)
          .lte('transaction_date', range.to);

        if (selectedAccountId !== 'ALL') {
          query = query.eq('base_account_id', selectedAccountId);
        }

        const { data, error } = await query;

        console.log('P&L Query:', { user_id: user.id, range, data, error });
        if (error) throw error;

        // Compute P&L from official posted transactions
        let totalIncome = 0;
        let totalExpense = 0;
        const incomeBreakdown = {};
        const expenseBreakdown = {};

        (data || []).forEach(txn => {
          if (txn.offset_account && txn.offset_account.account_type === 'INCOME') {
            totalIncome += txn.amount || 0;
            const accountName = txn.offset_account.account_name;
            incomeBreakdown[accountName] = (incomeBreakdown[accountName] || 0) + (txn.amount || 0);
          } else if (txn.offset_account && txn.offset_account.account_type === 'EXPENSE') {
            totalExpense += txn.amount || 0;
            const accountName = txn.offset_account.account_name;
            expenseBreakdown[accountName] = (expenseBreakdown[accountName] || 0) + (txn.amount || 0);
          }
        });

        // If toggle is ON, also fetch raw uncategorized (pending) transactions
        if (includePending) {
          let pendingQuery = supabase
            .from('uncategorized_transactions')
            .select('debit, credit, details, txn_date, account_id, transactions!left(offset_account_id, accounts!transactions_offset_account_id_fkey(account_name, account_type))')
            .eq('user_id', user.id)
            .gte('txn_date', range.from)
            .lte('txn_date', range.to);

          if (selectedAccountId !== 'ALL') {
            pendingQuery = pendingQuery.eq('account_id', selectedAccountId);
          }

          const { data: pendingData } = await pendingQuery;

          (pendingData || []).forEach(txn => {
            const credit = parseFloat(txn.credit) || 0;
            const debit = parseFloat(txn.debit) || 0;
            // Try to get category name from joined transactions table
            const linkedTxn = txn.transactions && txn.transactions.length > 0 ? txn.transactions[0] : null;
            const offsetAcc = linkedTxn?.accounts;

            if (credit > 0) {
              const catName = (offsetAcc?.account_type === 'INCOME') ? offsetAcc.account_name : 'Pending Income';
              totalIncome += credit;
              incomeBreakdown[catName] = (incomeBreakdown[catName] || 0) + credit;
            }
            if (debit > 0) {
              const catName = (offsetAcc?.account_type === 'EXPENSE') ? offsetAcc.account_name : 'Pending Expense';
              totalExpense += debit;
              expenseBreakdown[catName] = (expenseBreakdown[catName] || 0) + debit;
            }
          });
        }

        const netPL = totalIncome - totalExpense;

        setPlData({
          totalIncome,
          totalExpense,
          netPL,
          isPending: includePending,
          incomeBreakdown: Object.entries(incomeBreakdown)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount),
          expenseBreakdown: Object.entries(expenseBreakdown)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount)
        });
      } else if (view === 'balance') {
        // Fetch Balance Sheet data
        const { data, error } = await supabase
          .from('ledger_entries')
          .select(`
            debit_amount,
            credit_amount,
            account:account_id (
              account_id,
              account_name,
              account_type,
              balance_nature,
              parent_account:parent_account_id (
                account_name
              )
            )
          `)
          .eq('user_id', user.id)
          .gte('entry_date', range.from)
          .lte('entry_date', range.to);

        console.log('Balance Sheet Query:', { user_id: user.id, range, data, error });
        if (error) throw error;

        // Compute balances from ledger entries
        const accountMap = {};
        (data || []).forEach(entry => {
          if (!entry.account) return;
          const { account_id, account_name, account_type, balance_nature } = entry.account;
          if (account_type !== 'ASSET' && account_type !== 'LIABILITY') return;

          if (!accountMap[account_id]) {
            accountMap[account_id] = {
              account_id,
              account_name,
              account_type,
              balance_nature,
              totalDebit: 0,
              totalCredit: 0
            };
          }
          accountMap[account_id].totalDebit += entry.debit_amount || 0;
          accountMap[account_id].totalCredit += entry.credit_amount || 0;
        });

        // Compute final balance per account
        const accounts = Object.values(accountMap).map(acc => ({
          ...acc,
          balance: acc.balance_nature === 'DEBIT'
            ? acc.totalDebit - acc.totalCredit
            : acc.totalCredit - acc.totalDebit
        })).filter(acc => acc.balance !== 0);

        const assets = accounts.filter(a => a.account_type === 'ASSET')
          .sort((a, b) => b.balance - a.balance);
        const liabilities = accounts.filter(a => a.account_type === 'LIABILITY')
          .sort((a, b) => b.balance - a.balance);

        const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
        const totalLiabilities = liabilities.reduce((sum, a) => sum + a.balance, 0);
        const netWorth = totalAssets - totalLiabilities;

        setBalanceData({ assets, liabilities, totalAssets, totalLiabilities, netWorth });
      } else {
        // Fetch Ledger data
        const { data, error } = await supabase
          .from('ledger_entries')
          .select(`
            ledger_entry_id,
            debit_amount,
            credit_amount,
            entry_date,
            account:account_id (
              account_name,
              account_type
            ),
            transaction:transaction_id (
              details,
              transaction_id
            )
          `)
          .eq('user_id', user.id)
          .gte('entry_date', range.from)
          .lte('entry_date', range.to)
          .order('entry_date', { ascending: false })
          .order('transaction_id', { ascending: false });

        console.log('Ledger Query:', { user_id: user.id, range, data, error });
        if (error) throw error;

        setLedgerData(data || []);
      }
    } catch (err) {
      console.error('Error fetching analytics data:', err);
      setPlData(null);
      setBalanceData(null);
      setLedgerData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period, view, selectedAccountId, includePending]);

  /**
   * Render P&L View
   */
  const renderPLView = () => {
    if (loading) {
      return (
        <div className="placeholder-rows" style={{ justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="spinner"></div>
            <p>Loading P&L data...</p>
          </div>
        </div>
      );
    }

    if (!plData) {
      return (
        <div className="placeholder-rows" style={{ justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <p>No data available</p>
          </div>
        </div>
      );
    }

    const { totalIncome, totalExpense, netPL, incomeBreakdown, expenseBreakdown, isPending } = plData;

    return (
      <div className="analytics-content">
        {isPending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '8px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', fontSize: '13px', color: '#d97706' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <span><strong>Projected View</strong> — includes pending/unposted transactions from raw statements. Numbers are estimates.</span>
          </div>
        )}
        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-label">Total Income {isPending && <span style={{ fontSize: '10px', background: '#f59e0b', color: '#fff', padding: '1px 5px', borderRadius: '4px', marginLeft: '4px', verticalAlign: 'middle' }}>PROJECTED</span>}</div>
            <div className="card-value income">{formatCurrency(totalIncome)}</div>
          </div>
          <div className="summary-card">
            <div className="card-label">Total Expenses {isPending && <span style={{ fontSize: '10px', background: '#f59e0b', color: '#fff', padding: '1px 5px', borderRadius: '4px', marginLeft: '4px', verticalAlign: 'middle' }}>PROJECTED</span>}</div>
            <div className="card-value expense">{formatCurrency(totalExpense)}</div>
          </div>
          <div className="summary-card">
            <div className="card-label">Net P&L {isPending && <span style={{ fontSize: '10px', background: '#f59e0b', color: '#fff', padding: '1px 5px', borderRadius: '4px', marginLeft: '4px', verticalAlign: 'middle' }}>PROJECTED</span>}</div>
            <div className={`card-value ${netPL >= 0 ? 'net-positive' : 'net-negative'}`}>
              {formatCurrency(netPL)}
            </div>
          </div>
        </div>

        {/* Breakdown Grid */}
        <div className="breakdown-grid">
          {/* Income Breakdown */}
          <div className="breakdown-card">
            <h3>Income Breakdown</h3>
            {incomeBreakdown.length === 0 ? (
              <div className="breakdown-empty">No income recorded for this period</div>
            ) : (
              incomeBreakdown.map((item, idx) => {
                const pct = totalIncome > 0 ? ((item.amount / totalIncome) * 100).toFixed(1) : 0;
                return (
                  <div key={idx} style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>{item.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{pct}%</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#10b981' }}>{formatCurrency(item.amount)}</span>
                      </div>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '999px',
                        background: 'linear-gradient(90deg, #10b981, #34d399)',
                        width: `${pct}%`,
                        transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)'
                      }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Expense Breakdown */}
          <div className="breakdown-card">
            <h3>Expense Breakdown</h3>
            {expenseBreakdown.length === 0 ? (
              <div className="breakdown-empty">No expenses recorded for this period</div>
            ) : (
              expenseBreakdown.map((item, idx) => {
                const pct = totalExpense > 0 ? ((item.amount / totalExpense) * 100).toFixed(1) : 0;
                return (
                  <div key={idx} style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>{item.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{pct}%</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#ef4444' }}>{formatCurrency(item.amount)}</span>
                      </div>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '999px',
                        background: 'linear-gradient(90deg, #ef4444, #f87171)',
                        width: `${pct}%`,
                        transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)'
                      }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render Balance Sheet View
   */
  const renderBalanceView = () => {
    if (loading) {
      return (
        <div className="placeholder-rows" style={{ justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="spinner"></div>
            <p>Loading balance sheet data...</p>
          </div>
        </div>
      );
    }

    if (!balanceData) {
      return (
        <div className="placeholder-rows" style={{ justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <p>No data available</p>
          </div>
        </div>
      );
    }

    const { assets, liabilities, totalAssets, totalLiabilities, netWorth } = balanceData;

    // Compute financial ratios
    const debtRatio     = totalAssets > 0 ? ((totalLiabilities / totalAssets) * 100).toFixed(1) : 0;
    const deRatio       = (totalAssets - totalLiabilities) > 0
      ? (totalLiabilities / (totalAssets - totalLiabilities)).toFixed(2)
      : '∞';
    const netWorthPositive = netWorth >= 0;
    const assetPct  = (totalAssets + totalLiabilities) > 0 ? (totalAssets / (totalAssets + totalLiabilities)) * 100 : 50;

    return (
      <div className="analytics-content">

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-label">Total Assets</div>
            <div className="card-value income">{formatCurrency(totalAssets)}</div>
          </div>
          <div className="summary-card">
            <div className="card-label">Total Liabilities</div>
            <div className="card-value expense">{formatCurrency(totalLiabilities)}</div>
          </div>
          <div className="summary-card">
            <div className="card-label">
              Net Worth
              <span style={{
                marginLeft: '8px', fontSize: '10px', fontWeight: '700',
                padding: '2px 7px', borderRadius: '999px',
                background: netWorthPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: netWorthPositive ? '#059669' : '#dc2626'
              }}>
                {netWorthPositive ? '▲ POSITIVE' : '▼ NEGATIVE'}
              </span>
            </div>
            <div className={`card-value ${netWorthPositive ? 'net-positive' : 'net-negative'}`}>
              {formatCurrency(netWorth)}
            </div>
          </div>
        </div>

        {/* Financial Ratios Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            {
              label: 'Debt Ratio',
              value: `${debtRatio}%`,
              sub: 'Liabilities ÷ Assets',
              good: Number(debtRatio) < 50,
              tip: Number(debtRatio) < 50 ? 'Healthy' : 'High Debt'
            },
            {
              label: 'Debt-to-Equity',
              value: deRatio,
              sub: 'Liabilities ÷ Equity',
              good: deRatio !== '∞' && Number(deRatio) < 1,
              tip: deRatio !== '∞' && Number(deRatio) < 1 ? 'Low Risk' : 'Leveraged'
            },
            {
              label: 'Equity',
              value: formatCurrency(totalAssets - totalLiabilities),
              sub: 'Assets − Liabilities',
              good: (totalAssets - totalLiabilities) >= 0,
              tip: (totalAssets - totalLiabilities) >= 0 ? 'Solvent' : 'Insolvent'
            }
          ].map((r, i) => (
            <div key={i} style={{
              padding: '14px 16px', borderRadius: '10px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)'
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{r.label}</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: r.good ? '#10b981' : '#ef4444', marginBottom: '4px' }}>{r.value}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.sub}</span>
                <span style={{
                  fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px',
                  background: r.good ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                  color: r.good ? '#059669' : '#dc2626'
                }}>{r.tip}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Assets vs Liabilities Visual Gauge */}
        <div style={{ padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', fontWeight: '600' }}>
            <span style={{ color: '#2563eb' }}>Assets — {formatCurrency(totalAssets)}</span>
            <span style={{ color: '#ef4444' }}>Liabilities — {formatCurrency(totalLiabilities)}</span>
          </div>
          <div style={{ height: '10px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(239,68,68,0.2)', display: 'flex' }}>
            <div style={{
              width: `${assetPct}%`, height: '100%',
              background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
              borderRadius: '999px', transition: 'width 1s cubic-bezier(0.4,0,0.2,1)'
            }} />
          </div>
        </div>

        {/* Breakdown Grid */}
        <div className="breakdown-grid">
          <div className="breakdown-card">
            <h3>Assets</h3>
            {assets.length === 0 ? (
              <div className="breakdown-empty">No asset activity for this period</div>
            ) : (
              assets.map((item, idx) => {
                const pct = totalAssets > 0 ? ((item.balance / totalAssets) * 100).toFixed(1) : 0;
                return (
                  <div key={idx} style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>{item.account_name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{pct}%</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#2563eb' }}>{formatCurrency(item.balance)}</span>
                      </div>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '999px',
                        background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
                        width: `${pct}%`, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)'
                      }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="breakdown-card">
            <h3>Liabilities</h3>
            {liabilities.length === 0 ? (
              <div className="breakdown-empty">No liabilities for this period</div>
            ) : (
              liabilities.map((item, idx) => {
                const pct = totalLiabilities > 0 ? ((item.balance / totalLiabilities) * 100).toFixed(1) : 0;
                return (
                  <div key={idx} style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>{item.account_name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{pct}%</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#ef4444' }}>{formatCurrency(item.balance)}</span>
                      </div>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '999px',
                        background: 'linear-gradient(90deg, #ef4444, #f87171)',
                        width: `${pct}%`, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)'
                      }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render Ledger View — Color-coded, grouped double-entry ledger
   */
  const renderLedgerView = () => {
    if (loading) {
      return (
        <div className="placeholder-rows" style={{ justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="spinner"></div>
            <p>Loading ledger data...</p>
          </div>
        </div>
      );
    }

    if (ledgerData.length === 0) {
      return (
        <div className="placeholder-rows" style={{ justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="empty-icon">📖</div>
            <p>No ledger entries for this period</p>
          </div>
        </div>
      );
    }

    // Group entries by transaction_id into transaction pairs
    const groups = [];
    let i = 0;
    while (i < ledgerData.length) {
      const current = ledgerData[i];
      const next = ledgerData[i + 1];
      const sameTransaction = next && next.transaction?.transaction_id === current.transaction?.transaction_id;
      if (sameTransaction) {
        groups.push([current, next]);
        i += 2;
      } else {
        groups.push([current]);
        i += 1;
      }
    }

    const acctTypeColor = (type) => {
      if (type === 'INCOME')    return { bg: 'rgba(16,185,129,0.12)', color: '#059669' };
      if (type === 'EXPENSE')   return { bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' };
      if (type === 'ASSET')     return { bg: 'rgba(59,130,246,0.12)', color: '#2563eb' };
      if (type === 'LIABILITY') return { bg: 'rgba(245,158,11,0.12)', color: '#d97706' };
      return { bg: 'rgba(156,163,175,0.12)', color: '#6b7280' };
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '110px 1fr 160px 120px 120px',
          padding: '8px 16px', borderRadius: '8px',
          background: 'var(--bg-secondary)',
          fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em',
          color: 'var(--text-secondary)', textTransform: 'uppercase'
        }}>
          <div>Date</div>
          <div>Description</div>
          <div>Account</div>
          <div style={{ textAlign: 'right' }}>Debit</div>
          <div style={{ textAlign: 'right' }}>Credit</div>
        </div>

        {groups.map((group, gIdx) => {
          const firstEntry = group[0];
          const txnDate = formatDate(firstEntry.entry_date);
          const txnDesc = firstEntry.transaction?.details || '—';
          const isEven = gIdx % 2 === 0;

          return (
            <div key={gIdx} style={{
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              background: isEven ? 'var(--bg-card)' : 'var(--bg-secondary)',
              overflow: 'hidden',
              borderLeft: `3px solid ${firstEntry.debit_amount > 0 ? '#ef4444' : '#10b981'}`
            }}>
              {group.map((entry, eIdx) => {
                const isDebit  = entry.debit_amount  > 0;
                const isCredit = entry.credit_amount > 0;
                const accType  = entry.account?.account_type;
                const badge    = acctTypeColor(accType);

                return (
                  <div key={entry.ledger_entry_id} style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr 160px 120px 120px',
                    padding: '11px 16px',
                    alignItems: 'center',
                    borderTop: eIdx > 0 ? '1px dashed var(--border-color)' : 'none',
                    fontSize: '13px',
                  }}>
                    {/* Date — only first row shows it */}
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {eIdx === 0 ? txnDate : ''}
                    </div>

                    {/* Description — only first row shows it */}
                    <div style={{
                      fontWeight: eIdx === 0 ? '500' : '400',
                      color: eIdx === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: '13px', paddingRight: '8px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {eIdx === 0 ? txnDesc : (
                        <span style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                          offset entry
                        </span>
                      )}
                    </div>

                    {/* Account name + type badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                        {entry.account?.account_name || '—'}
                      </span>
                      {accType && (
                        <span style={{
                          fontSize: '9px', fontWeight: '700', letterSpacing: '0.05em',
                          padding: '1px 5px', borderRadius: '4px',
                          background: badge.bg, color: badge.color
                        }}>
                          {accType}
                        </span>
                      )}
                    </div>

                    {/* Debit */}
                    <div style={{
                      textAlign: 'right', fontWeight: '600',
                      color: isDebit ? '#ef4444' : 'var(--text-secondary)',
                      fontSize: isDebit ? '13px' : '12px'
                    }}>
                      {isDebit ? formatCurrency(entry.debit_amount) : '—'}
                    </div>

                    {/* Credit */}
                    <div style={{
                      textAlign: 'right', fontWeight: '600',
                      color: isCredit ? '#10b981' : 'var(--text-secondary)',
                      fontSize: isCredit ? '13px' : '12px'
                    }}>
                      {isCredit ? formatCurrency(entry.credit_amount) : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="analytics-container">
      {/* Header with Toggle */}
      <div className="page-header">
        <div className="header-title">
          <h1>Analytics</h1>
          <p>Financial performance and transaction details</p>
        </div>
        <div className="view-tabs">
          <button
            className={`filter-tab ${view === 'pl' ? 'active' : ''}`}
            onClick={() => setView('pl')}
          >P&L</button>
          <button
            className={`filter-tab ${view === 'balance' ? 'active' : ''}`}
            onClick={() => setView('balance')}
          >Balance Sheet</button>
          <button
            className={`filter-tab ${view === 'ledger' ? 'active' : ''}`}
            onClick={() => setView('ledger')}
          >Ledger</button>
        </div>
      </div>

      {/* Period Filter Tabs & Bank Filter */}
      <div className="filter-tabs" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`filter-tab ${period === 'month' ? 'active' : ''}`}
            onClick={() => setPeriod('month')}
          >
            This Month
          </button>
          <button
            className={`filter-tab ${period === 'quarter' ? 'active' : ''}`}
            onClick={() => setPeriod('quarter')}
          >
            This Quarter
          </button>
          <button
            className={`filter-tab ${period === 'year' ? 'active' : ''}`}
            onClick={() => setPeriod('year')}
          >
            This Year
          </button>
          <button
            className={`filter-tab ${period === 'all' ? 'active' : ''}`}
            onClick={() => setPeriod('all')}
          >
            All Time
          </button>
        </div>
        
        {view === 'pl' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {bankAccounts.length > 0 && (
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                  cursor: 'pointer',
                  minWidth: '150px'
                }}
              >
                <option value="ALL">All Accounts</option>
                {bankAccounts.map(acc => (
                  <option key={acc.account_id} value={acc.account_id}>{acc.account_name}</option>
                ))}
              </select>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', userSelect: 'none', fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              <div
                onClick={() => setIncludePending(p => !p)}
                style={{
                  width: '36px', height: '20px', borderRadius: '10px', position: 'relative', cursor: 'pointer',
                  background: includePending ? '#f59e0b' : 'var(--border-color)',
                  transition: 'background 0.2s ease', flexShrink: 0
                }}
              >
                <div style={{
                  position: 'absolute', top: '2px',
                  left: includePending ? '18px' : '2px',
                  width: '16px', height: '16px', borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }} />
              </div>
              Include Pending
            </label>
          </div>
        )}
      </div>

      {/* Content */}
      {view === 'pl' && renderPLView()}
      {view === 'balance' && renderBalanceView()}
      {view === 'ledger' && renderLedgerView()}
    </div>
  );
};

export default Analytics;
