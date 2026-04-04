import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Code, FileSearch, Building2, Cpu, Loader2, ChevronLeft, CheckCircle, Download, Link, ScrollText, Trash2 } from "lucide-react";
import API from "../api/api";

export default function ReviewPage() {
    const [searchParams] = useSearchParams();
    const documentId = searchParams.get("id");
    const navigate = useNavigate();

    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [isApproved, setIsApproved] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [userAccounts, setUserAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState(null);
    const [isLinkingAccount, setIsLinkingAccount] = useState(false);
    const [accountLinked, setAccountLinked] = useState(false);

    // Editing and Selection state
    const [editableCodeTxns, setEditableCodeTxns] = useState([]);
    const [editableLlmTxns, setEditableLlmTxns] = useState([]);
    const [selectedIndices, setSelectedIndices] = useState({ CODE: [], LLM: [] });
    const [activeParser, setActiveParser] = useState("CODE"); // Default selection

    useEffect(() => {
        if (!documentId) {
            setError("No document ID provided.");
            setIsLoading(false);
            return;
        }

        const fetchReviewData = async () => {
            try {
                const res = await API.get(`/documents/${documentId}/review`);
                setData(res.data);
                
                // Initialize editable transactions
                setEditableCodeTxns(res.data.code_transactions || []);
                setEditableLlmTxns(res.data.llm_transactions || []);
                
                // Set active parser based on backend recommendation
                const preferred = res.data.transaction_parsed_type || "CODE";
                setActiveParser(preferred);
                
                // Initialize selected indices (all by default)
                setSelectedIndices({
                    CODE: (res.data.code_transactions || []).map((_, i) => i),
                    LLM: (res.data.llm_transactions || []).map((_, i) => i)
                });

                if (res.data.user_accounts) {
                    setUserAccounts(res.data.user_accounts);
                }
                if (res.data.selected_account_id) {
                    setSelectedAccountId(res.data.selected_account_id);
                    setAccountLinked(true);
                }
                if (res.data.status === "APPROVE") {
                    setIsApproved(true);
                    setAccountLinked(true);
                }
            } catch (err) {
                console.error(err);
                setError("Failed to fetch review data. Ensure the document has been processed.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchReviewData();
    }, [documentId]);

    const handleApprove = async () => {
        if (!accountLinked) {
            alert("Please link an account before approving.");
            return;
        }

        const txnsToUse = activeParser === "CODE" ? editableCodeTxns : editableLlmTxns;
        const currentIndices = selectedIndices[activeParser];
        
        if (currentIndices.length === 0) {
            alert("Please select at least one transaction to approve.");
            return;
        }

        const selectedTxns = currentIndices.map(i => txnsToUse[i]);

        setIsApproving(true);
        try {
            await API.post(`/documents/${documentId}/approve`, {
                transactions: selectedTxns,
                parser_type: activeParser
            });
            setIsApproved(true);
        } catch (err) {
            console.error(err);
            alert("Approval failed: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsApproving(false);
        }
    };

    const handleLinkAccount = async () => {
        if (!selectedAccountId) return;
        setIsLinkingAccount(true);
        try {
            await API.post(`/documents/${documentId}/select-account`, {
                account_id: selectedAccountId,
            });
            setAccountLinked(true);
        } catch (err) {
            console.error(err);
            alert("Failed to link account: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsLinkingAccount(false);
        }
    };

    const handleUpdateTxn = (parserType, index, field, value) => {
        const updater = parserType === "CODE" ? setEditableCodeTxns : setEditableLlmTxns;
        updater(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const toggleSelection = (parserType, index) => {
        setSelectedIndices(prev => {
            const current = [...prev[parserType]];
            const foundIdx = current.indexOf(index);
            if (foundIdx > -1) {
                current.splice(foundIdx, 1);
            } else {
                current.push(index);
            }
            return { ...prev, [parserType]: current };
        });
    };

    const toggleSelectAll = (parserType) => {
        const txns = parserType === "CODE" ? editableCodeTxns : editableLlmTxns;
        setSelectedIndices(prev => {
            const isAllSelected = prev[parserType].length === txns.length;
            return {
                ...prev,
                [parserType]: isAllSelected ? [] : txns.map((_, i) => i)
            };
        });
    };

    const handleDownloadJson = async () => {
        try {
            const txnsToUse = activeParser === "CODE" ? editableCodeTxns : editableLlmTxns;
            const currentIndices = selectedIndices[activeParser];
            const selectedTxns = currentIndices.map(i => txnsToUse[i]);

            // Resolve identifier: use the linked account's number digits, fallback to document_id
            const linkedAccount = userAccounts.find(a => a.account_id === selectedAccountId);
            const accountNumber =
                linkedAccount?.account_number ||
                linkedAccount?.account_number_last4 ||
                linkedAccount?.card_last4 ||
                String(documentId);

            const normalizedTransactions = selectedTxns.map(tx => ({
                txn_date:   tx.txn_date  ?? tx.date        ?? null,
                debit:      tx.debit     != null ? tx.debit  : 0,
                credit:     tx.credit    != null ? tx.credit : 0,
                balance:    tx.balance   != null ? tx.balance : 0,
                details:    tx.details   || tx.description  || "",
                confidence: tx.confidence ?? null,
            }));

            const output = {
                file_name:    data?.file_name || `${(data?.bank_name || "bank").replace(/\s+/g, "_").toLowerCase()}_primary_ml.pdf`,
                identifiers:  [String(accountNumber)],
                transactions: normalizedTransactions,
            };

            const jsonStr = JSON.stringify(output, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const safeName = (data?.bank_name || "transactions").replace(/\s+/g, "_");
            a.download = `${safeName}_transactions.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert("Download failed: " + (err.response?.data?.detail || err.message));
        }
    };

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <Loader2 className="spin-icon" size={48} color="var(--primary-action)" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '70vh',
                textAlign: 'center',
                padding: '2rem'
            }}>
                <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '24px',
                    background: 'rgba(72, 62, 168, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1.5rem',
                    color: 'var(--primary-action)'
                }}>
                    <FileSearch size={40} />
                </div>
                
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                    No Document Selected
                </h2>
                
                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.6, marginBottom: '2rem' }}>
                    Transaction data will appear here once you've started processing a statement from the dashboard and it's ready for your review.
                </p>

                <button 
                    onClick={() => navigate("/parsing")} 
                    style={{
                        padding: '0.8rem 2.5rem',
                        background: 'var(--primary-action)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(72, 62, 168, 0.2)',
                        transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    Return to Dashboard
                </button>
            </div>
        );
    }

    const renderTransactionTable = (transactions, title, icon, parserType) => {
        const isActive = activeParser === parserType;
        const currentSelected = selectedIndices[parserType] || [];
        const isAllSelected = transactions.length > 0 && currentSelected.length === transactions.length;

        return (
            <div style={{
                background: isActive ? 'var(--bg-primary)' : 'var(--card-bg)',
                borderRadius: '16px',
                border: isActive ? '2px solid var(--primary-action)' : '1px solid var(--border-color)',
                overflow: 'hidden',
                marginBottom: '1.5rem',
                opacity: isActive ? 1 : 0.7,
                transition: 'all 0.3s ease',
                position: 'relative'
            }}>
                <div 
                    onClick={() => !isApproved && setActiveParser(parserType)}
                    style={{
                        padding: '1.25rem 1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: isApproved ? 'default' : 'pointer',
                        borderBottom: '1px solid var(--border-color)',
                        background: isActive ? 'rgba(72, 62, 168, 0.05)' : 'transparent'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            border: `2px solid ${isActive ? 'var(--primary-action)' : 'var(--border-color)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isActive ? 'var(--primary-action)' : 'transparent'
                        }}>
                            {isActive && <Check size={12} color="white" />}
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {icon} {title}
                        </h3>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: '10px' }}>
                            {transactions.length} rows
                        </span>
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-secondary)' }}>
                                <th style={{ width: '40px', padding: '1rem', textAlign: 'center' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={isAllSelected} 
                                        onChange={() => !isApproved && toggleSelectAll(parserType)}
                                        disabled={isApproved}
                                    />
                                </th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', width: '130px' }}>Date</th>
                                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Details</th>
                                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Debit</th>
                                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Credit</th>
                                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Balance</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', width: '100px' }}>Confidence</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions && transactions.length > 0 ? transactions.map((tx, i) => {
                                const isSelected = currentSelected.includes(i);
                                return (
                                    <tr key={i} style={{ 
                                        borderTop: '1px solid var(--border-color)',
                                        background: isSelected ? 'rgba(72, 62, 168, 0.02)' : 'transparent'
                                    }}>
                                        <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected} 
                                                onChange={() => !isApproved && toggleSelection(parserType, i)}
                                                disabled={isApproved}
                                            />
                                        </td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <input 
                                                className="table-input"
                                                value={tx.date || tx.txn_date || ''} 
                                                onChange={(e) => handleUpdateTxn(parserType, i, 'date', e.target.value)}
                                                disabled={isApproved}
                                                style={{ width: '120px' }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <textarea 
                                                className="table-input"
                                                value={tx.details || tx.description || ''} 
                                                onChange={(e) => handleUpdateTxn(parserType, i, 'details', e.target.value)}
                                                disabled={isApproved}
                                                style={{ width: '100%', minHeight: '32px', resize: 'vertical' }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                            <input 
                                                className="table-input text-right"
                                                type="number"
                                                step="0.01"
                                                value={tx.debit || ''} 
                                                onChange={(e) => handleUpdateTxn(parserType, i, 'debit', parseFloat(e.target.value) || 0)}
                                                disabled={isApproved}
                                                style={{ width: '80px', color: tx.debit ? '#F87171' : 'inherit' }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                            <input 
                                                className="table-input text-right"
                                                type="number"
                                                step="0.01"
                                                value={tx.credit || ''} 
                                                onChange={(e) => handleUpdateTxn(parserType, i, 'credit', parseFloat(e.target.value) || 0)}
                                                disabled={isApproved}
                                                style={{ width: '80px', color: tx.credit ? '#34D399' : 'inherit' }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                            <input 
                                                className="table-input text-right"
                                                type="number"
                                                step="0.01"
                                                value={tx.balance || ''} 
                                                onChange={(e) => handleUpdateTxn(parserType, i, 'balance', parseFloat(e.target.value) || 0)}
                                                disabled={isApproved}
                                                style={{ width: '90px', fontWeight: 600 }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                            <span style={{
                                                background: tx.confidence >= 0.9 ? '#def7ec' : tx.confidence >= 0.7 ? '#fef3c7' : '#fde8e8',
                                                color: tx.confidence >= 0.9 ? '#03543f' : tx.confidence >= 0.7 ? '#92400e' : '#9b1c1c',
                                                padding: '2px 6px',
                                                borderRadius: '50px',
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                            }}>
                                                {tx.confidence != null ? (tx.confidence * 100).toFixed(0) + '%' : 'N/A'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No transactions extracted.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <style dangerouslySetInnerHTML={{ __html: `
                    .table-input {
                        background: transparent;
                        border: 1px solid transparent;
                        border-radius: 4px;
                        padding: 4px 8px;
                        font-family: inherit;
                        font-size: 0.85rem;
                        color: var(--text-primary);
                        transition: all 0.2s;
                    }
                    .table-input:hover:not(:disabled) {
                        border-color: var(--border-color);
                        background: var(--bg-secondary);
                    }
                    .table-input:focus:not(:disabled) {
                        border-color: var(--primary-action);
                        background: var(--bg-primary);
                        outline: none;
                        box-shadow: 0 0 0 2px rgba(72, 62, 168, 0.1);
                    }
                    .table-input:disabled {
                        cursor: default;
                    }
                    .text-right { text-align: right; }
                `}} />
            </div>
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ maxWidth: '1400px', margin: '0 auto' }}
        >
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <button
                        onClick={() => navigate(-1)}
                        style={{
                            background: 'none',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.875rem',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            marginBottom: '0.75rem',
                            padding: 0,
                        }}
                    >
                        <ChevronLeft size={16} /> Back to Dashboard
                    </button>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Review & Approve</h2>
                </div>
                
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={handleDownloadJson}
                        style={{
                            padding: '0.6rem 1.5rem',
                            background: 'none',
                            color: 'var(--primary-action)',
                            border: '2px solid var(--primary-action)',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Download size={15} /> Export Selected
                    </button>

                    {isApproved ? (
                        <div style={{
                            padding: '0.6rem 2rem',
                            background: 'var(--accent-color)',
                            color: 'white',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(127, 175, 138, 0.2)'
                        }}>
                            <CheckCircle size={16} /> APPROVED
                        </div>
                    ) : (
                        <button
                            onClick={handleApprove}
                            disabled={isApproving || !accountLinked}
                            style={{
                                padding: '0.6rem 2.5rem',
                                background: (!accountLinked || isApproving) ? '#e5e7eb' : 'var(--primary-action)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                fontWeight: 800,
                                fontSize: '0.9rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: (isApproving || !accountLinked) ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: (!accountLinked || isApproving) ? 'none' : '0 4px 12px rgba(72, 62, 168, 0.3)'
                            }}
                        >
                            {isApproving ? (
                                <><Loader2 size={16} className="spin-icon" /> PROCESSING...</>
                            ) : (
                                <><Check size={18} /> APPROVE SELECTED ({selectedIndices[activeParser]?.length || 0})</>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Metadata bar */}
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '16px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '2.5rem',
                marginBottom: '1.5rem',
                padding: '1.5rem 2rem'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', textTransform: 'uppercase' }}>
                        <Building2 size={12} /> Institution
                    </label>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{data.bank_name}</span>
                </div>

                <div style={{ flex: 1, minWidth: '300px' }}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', textTransform: 'uppercase' }}>
                        <Link size={12} /> Target Account for Transactions
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <select
                            value={selectedAccountId || ""}
                            onChange={e => {
                                setSelectedAccountId(Number(e.target.value) || null);
                                setAccountLinked(false);
                            }}
                            disabled={isApproved}
                            style={{
                                flex: 1,
                                padding: '0.6rem',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                border: '1.5px solid var(--border-color)',
                                borderRadius: '10px',
                                background: 'var(--input-bg)',
                                cursor: isApproved ? 'not-allowed' : 'pointer',
                            }}
                        >
                            <option value="">— Select destination account —</option>
                            {userAccounts.map(acct => (
                                <option key={acct.account_id} value={acct.account_id}>
                                    {acct.institution_name} ••••{acct.account_number_last4 || acct.card_last4}
                                </option>
                            ))}
                        </select>
                        {!accountLinked && (
                            <button
                                onClick={handleLinkAccount}
                                disabled={!selectedAccountId || isLinkingAccount || isApproved}
                                style={{
                                    padding: '0 1.5rem',
                                    background: selectedAccountId ? 'var(--primary-action)' : '#e5e7eb',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    cursor: selectedAccountId && !isApproved ? 'pointer' : 'not-allowed',
                                }}
                            >
                                Link
                            </button>
                        )}
                        {accountLinked && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-color)', fontWeight: 700, fontSize: '0.85rem', padding: '0 1rem' }}>
                                <CheckCircle size={16} /> Linked
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Step 1: Choose extraction source & Edit if needed</div>
                    </div>
                    
                    {renderTransactionTable(
                        editableCodeTxns,
                        "Code-Based Extraction",
                        <Code size={20} style={{ color: 'var(--accent-color)' }} />,
                        "CODE"
                    )}
                    
                    {renderTransactionTable(
                        editableLlmTxns,
                        "AI-Powered Extraction",
                        <Cpu size={20} style={{ color: 'var(--primary-action)' }} />,
                        "LLM"
                    )}
                </div>

                <div style={{ flex: 1, position: 'sticky', top: '2rem', minWidth: 0 }}>
                    <div style={{
                        background: 'var(--card-bg)',
                        borderRadius: '20px',
                        border: '1px solid var(--border-color)',
                        padding: '1.5rem',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)'
                    }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ScrollText size={18} style={{ color: 'var(--primary-action)' }} /> Analysis Meta
                        </h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Active Selection</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {activeParser === "CODE" ? <Code size={16} color="var(--accent-color)" /> : <Cpu size={16} color="var(--primary-action)" />}
                                    <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{activeParser} Results</span>
                                </div>
                                <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-secondary)' }}>
                                    Selected {selectedIndices[activeParser].length} of {activeParser === "CODE" ? editableCodeTxns.length : editableLlmTxns.length} transactions.
                                </div>
                            </div>

                            <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Format Identifiers</div>
                                <pre style={{
                                    background: 'var(--bg-secondary)',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    fontSize: '0.7rem',
                                    color: 'var(--text-primary)',
                                    overflow: 'auto',
                                    maxHeight: '300px',
                                    border: '1px solid var(--border-color)',
                                    margin: 0
                                }}>
                                    {JSON.stringify(data.identifier_json, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}