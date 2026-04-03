import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Code, FileSearch, Building2, Cpu, Loader2, ChevronLeft, CheckCircle, Download, Link } from "lucide-react";
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
        setIsApproving(true);
        try {
            await API.post(`/documents/${documentId}/approve`);
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

    const handleDownloadJson = async () => {
        try {
            const res = await API.get(`/documents/${documentId}/download-json`);
            const raw = res.data;

            // Resolve identifier: use the linked account's number digits, fallback to document_id
            const linkedAccount = userAccounts.find(a => a.account_id === selectedAccountId);
            const accountNumber =
                linkedAccount?.account_number ||
                linkedAccount?.account_number_last4 ||
                linkedAccount?.card_last4 ||
                String(documentId);

            // API returns: { file_name, parser_type, transaction_count, transactions: [...] }
            // transactions[] items use "date" (current parser) or "txn_date" (legacy)
            const rawTxns = Array.isArray(raw)
                ? raw                        // bare array (unlikely but safe)
                : Array.isArray(raw.transactions)
                    ? raw.transactions       // ← normal path: { transactions: [...] }
                    : [];

            const normalizedTransactions = rawTxns.map(tx => ({
                txn_date:   tx.txn_date  ?? tx.date        ?? null,
                debit:      tx.debit     != null ? tx.debit  : 0,
                credit:     tx.credit    != null ? tx.credit : 0,
                balance:    tx.balance   != null ? tx.balance : 0,
                details:    tx.details   || tx.description  || "",
                confidence: tx.confidence ?? null,
            }));

            const output = {
                file_name:    raw.file_name || `${(data?.bank_name || "bank").replace(/\s+/g, "_").toLowerCase()}_primary_ml.pdf`,
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
            <div style={{ textAlign: 'center', marginTop: '4rem' }}>
                <h2 style={{ color: '#e74c3c' }}>{error || "Something went wrong"}</h2>
                <button onClick={() => navigate("/parsing")} style={{
                    marginTop: '1rem',
                    padding: '0.5rem 1.5rem',
                    background: 'none',
                    border: '2px solid var(--primary-action)',
                    color: 'var(--primary-action)',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}>
                    Back to Parsing
                </button>
            </div>
        );
    }

    const renderTransactionTable = (transactions, title, icon) => (
        <div style={{
            background: 'var(--card-bg)',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            marginBottom: '1.5rem'
        }}>
            <h3 style={{
                fontSize: '0.95rem',
                padding: '1.5rem',
                margin: 0,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                borderBottom: '1px solid var(--border-color)'
            }}>
                {icon} {title}
            </h3>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-secondary)' }}>
                            <th style={{ padding: '1rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Date</th>
                            <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Details</th>
                            <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Debit</th>
                            <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Credit</th>
                            <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Balance</th>
                            <th style={{ padding: '1rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Confidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions && transactions.length > 0 ? transactions.map((tx, i) => (
                            <tr key={i} style={{ borderTop: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '1rem 1.5rem', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{tx.date || '-'}</td>
                                <td style={{ padding: '1rem', maxWidth: '500px', wordWrap: 'break-word', whiteSpace: 'normal', color: 'var(--text-primary)' }}>{tx.details || '-'}</td>
                                <td style={{ padding: '1rem', textAlign: 'right', color: tx.debit ? '#F87171' : 'var(--text-secondary)', fontWeight: tx.debit ? 600 : 400 }}>
                                    {tx.debit ? tx.debit.toLocaleString() : '-'}
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right', color: tx.credit ? '#34D399' : 'var(--text-secondary)', fontWeight: tx.credit ? 600 : 400 }}>
                                    {tx.credit ? tx.credit.toLocaleString() : '-'}
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {tx.balance != null ? tx.balance.toLocaleString() : '-'}
                                </td>
                                <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                    <span style={{
                                        background: tx.confidence >= 0.9 ? '#def7ec' : tx.confidence >= 0.7 ? '#fef3c7' : '#fde8e8',
                                        color: tx.confidence >= 0.9 ? '#03543f' : tx.confidence >= 0.7 ? '#92400e' : '#9b1c1c',
                                        padding: '2px 8px',
                                        borderRadius: '50px',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                    }}>
                                        {tx.confidence != null ? (tx.confidence * 100).toFixed(0) + '%' : 'N/A'}
                                    </span>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No transactions extracted.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div style={{ marginBottom: '1.5rem' }}>
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
                    <ChevronLeft size={16} /> Back
                </button>

                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Review Transactions</h2>
            </div>

            {/* Metadata bar */}
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '16px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: '2rem',
                marginBottom: '1.5rem',
                padding: '1.5rem'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                        <Building2 size={12} /> Bank Name
                    </label>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{data.bank_name}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>Code Txns</label>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{data.code_transactions?.length || 0}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>LLM Txns</label>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{data.llm_transactions?.length || 0}</span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        onClick={handleDownloadJson}
                        style={{
                            padding: '0.5rem 1.5rem',
                            background: 'none',
                            color: 'var(--primary-action)',
                            border: '2px solid var(--primary-action)',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            fontFamily: 'inherit',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Download size={15} /> Download JSON
                    </button>

                    {isApproved ? (
                        <button
                            disabled
                            style={{
                                padding: '0.5rem 2rem',
                                background: 'transparent',
                                color: 'var(--accent-color)',
                                border: '2px solid var(--accent-color)',
                                borderRadius: '10px',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                fontFamily: 'inherit',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'default',
                                opacity: 0.85,
                            }}
                        >
                            <CheckCircle size={16} /> APPROVED
                        </button>
                    ) : (
                        <button
                            onClick={handleApprove}
                            disabled={isApproving}
                            style={{
                                padding: '0.5rem 2rem',
                                background: 'var(--primary-action)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                fontFamily: 'inherit',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: isApproving ? 'not-allowed' : 'pointer',
                                opacity: isApproving ? 0.65 : 1,
                                transition: 'all 0.2s'
                            }}
                        >
                            {isApproving ? (
                                <><Loader2 size={16} className="spin-icon" /> APPROVING...</>
                            ) : (
                                <><Check size={16} /> APPROVE</>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Account Selector */}
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '16px',
                border: '1px solid var(--border-color)',
                marginBottom: '1.5rem',
                padding: '1rem 1.5rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: accountLinked ? '#e8f5e9' : '#ede9ff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Link size={16} color={accountLinked ? 'var(--accent-color)' : 'var(--primary-action)'} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            Link this document to an account
                        </p>
                        {userAccounts.length > 0 ? (
                            <select
                                value={selectedAccountId || ""}
                                onChange={e => {
                                    setSelectedAccountId(Number(e.target.value) || null);
                                    setAccountLinked(false);
                                }}
                                disabled={isApproved}
                                style={{
                                    width: '100%',
                                    maxWidth: 360,
                                    padding: '0.4rem 0.6rem',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    border: '1.5px solid var(--border-color)',
                                    borderRadius: '8px',
                                    background: 'var(--input-bg)',
                                    fontFamily: 'inherit',
                                    cursor: isApproved ? 'not-allowed' : 'pointer',
                                    outline: 'none',
                                }}
                            >
                                <option value="">— Select account —</option>
                                {userAccounts.map(acct => {
                                    const last4 = acct.account_number_last4 || acct.card_last4;
                                    const institution = acct.institution_name || "Account";
                                    const label = last4
                                        ? `${institution}  ••••${last4}`
                                        : institution;
                                    return (
                                        <option key={acct.account_id} value={acct.account_id}>
                                            {label}
                                        </option>
                                    );
                                })}
                            </select>
                        ) : (
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                No accounts added yet. Add accounts from the Dashboard.
                            </p>
                        )}
                    </div>

                    {accountLinked ? (
                        <span style={{
                            fontSize: '0.7rem', fontWeight: 700,
                            color: 'var(--accent-color)', background: 'rgba(127, 175, 138, 0.1)',
                            padding: '3px 10px', borderRadius: '50px', flexShrink: 0,
                        }}>
                            ✓ Linked
                        </span>
                    ) : (
                        <button
                            onClick={handleLinkAccount}
                            disabled={!selectedAccountId || isLinkingAccount || isApproved}
                            style={{
                                padding: '0.4rem 1.1rem',
                                background: selectedAccountId ? 'var(--primary-action)' : '#e5e7eb',
                                color: selectedAccountId ? '#fff' : '#9ca3af',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                fontFamily: 'inherit',
                                cursor: selectedAccountId && !isApproved ? 'pointer' : 'not-allowed',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                flexShrink: 0,
                                transition: 'background 0.15s',
                            }}
                        >
                            {isLinkingAccount
                                ? <><Loader2 size={12} className="spin-icon" /> Linking…</>
                                : <><Link size={12} /> Link</>
                            }
                        </button>
                    )}
                </div>
            </div>

            {/* Main content: tables on left, JSON on right */}
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
                    {renderTransactionTable(
                        data.code_transactions,
                        "Extracted by Code",
                        <Code size={18} style={{ color: 'var(--accent-color)' }} />
                    )}
                    {renderTransactionTable(
                        data.llm_transactions,
                        "Extracted by LLM",
                        <Cpu size={18} style={{ color: 'var(--primary-action)' }} />
                    )}
                </div>

                {/* JSON Column */}
                <div style={{ flex: 1, position: 'sticky', top: '2rem', minWidth: 0 }}>
                    <div style={{
                        background: 'var(--card-bg)',
                        borderRadius: '16px',
                        border: '1px solid var(--border-color)',
                        padding: '1.5rem'
                    }}>
                        <h3 style={{ fontSize: '0.95rem', marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}>
                            <FileSearch size={18} style={{ color: 'var(--primary-action)' }} /> Identifier Config
                        </h3>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            Detected pattern configuration used for this statement format.
                        </p>
                        <pre style={{
                            background: 'var(--bg-secondary)',
                            padding: '1rem',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            color: 'var(--text-primary)',
                            overflow: 'auto',
                            maxHeight: '500px',
                            border: '1px solid var(--border-color)'
                        }}>
                            {JSON.stringify(data.identifier_json, null, 2)}
                        </pre>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}