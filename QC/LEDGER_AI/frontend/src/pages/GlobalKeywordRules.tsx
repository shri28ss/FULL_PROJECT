import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
    Tag, Plus, Upload, X, Loader2,
    ChevronLeft, ChevronRight, Search,
    CheckCircle, AlertCircle, ToggleLeft, ToggleRight,
} from 'lucide-react';

const BASE_URL = 'https://qc-panel-uv-supabase-1.onrender.com';
const PAGE_SIZE = 50;

type MatchType = 'CONTAINS' | 'EXACT' | 'STARTS_WITH' | 'ENDS_WITH';
const MATCH_TYPES: MatchType[] = ['CONTAINS', 'EXACT', 'STARTS_WITH', 'ENDS_WITH'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface KeywordRuleRow {
    keyword_id: number;
    keyword: string;
    target_template_id: number | null;
    match_type: MatchType;
    priority: number;
    hit_count: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface ModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.78rem', fontWeight: 600,
    color: '#475569', marginBottom: '0.4rem',
    textTransform: 'uppercase', letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px',
    border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#0f172a',
    outline: 'none', boxSizing: 'border-box', background: '#f8fafc',
    transition: 'border-color 0.15s',
};

function paginationBtnStyle(active: boolean, disabled: boolean): React.CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        padding: '0.45rem 0.8rem', borderRadius: '8px',
        border: active ? '2px solid #0ea5e9' : '1px solid #e2e8f0',
        background: active ? '#0ea5e9' : '#fff',
        color: active ? '#fff' : disabled ? '#cbd5e1' : '#475569',
        fontWeight: active ? 700 : 500, fontSize: '0.82rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
        boxShadow: active ? '0 2px 8px rgba(14,165,233,0.25)' : 'none',
    };
}

function MatchTypeBadge({ type }: { type: MatchType }) {
    const colors: Record<MatchType, { bg: string; color: string }> = {
        CONTAINS:    { bg: '#dbeafe', color: '#1d4ed8' },
        EXACT:       { bg: '#fef9c3', color: '#a16207' },
        STARTS_WITH: { bg: '#dcfce7', color: '#166534' },
        ENDS_WITH:   { bg: '#fce7f3', color: '#be185d' },
    };
    const c = colors[type] ?? { bg: '#f1f5f9', color: '#64748b' };
    return (
        <span style={{ display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: '6px', background: c.bg, color: c.color, fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.04em' }}>
            {type}
        </span>
    );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
    currentPage, totalPages, onPageChange,
}: {
    currentPage: number; totalPages: number; onPageChange: (p: number) => void;
}) {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (currentPage > 3) pages.push('...');
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
            pages.push(i);
        }
        if (currentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', padding: '1.5rem 0' }}>
            <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} style={paginationBtnStyle(false, currentPage === 1)}>
                <ChevronLeft size={14} /><span>Previous</span>
            </button>
            {pages.map((p, i) =>
                p === '...'
                    ? <span key={`dots-${i}`} style={{ padding: '0 0.3rem', color: '#94a3b8', fontSize: '0.85rem' }}>···</span>
                    : <button key={p} onClick={() => onPageChange(p as number)} style={paginationBtnStyle(p === currentPage, false)}>{p}</button>
            )}
            <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} style={paginationBtnStyle(false, currentPage === totalPages)}>
                <span>Next</span><ChevronRight size={14} />
            </button>
        </div>
    );
}

// ─── Add / Bulk-import modal ──────────────────────────────────────────────────

function AddKeywordModal({ onClose, onSuccess }: ModalProps) {
    const [tab, setTab] = useState<'manual' | 'csv'>('manual');
    const [keyword, setKeyword] = useState('');
    const [templateId, setTemplateId] = useState('');
    const [matchType, setMatchType] = useState<MatchType>('CONTAINS');
    const [priority, setPriority] = useState('90');
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const handleManualSubmit = async () => {
        if (!keyword.trim()) { setStatus('error'); setMessage('Keyword is required.'); return; }
        setLoading(true); setStatus('idle');
        try {
            await axios.post(`${BASE_URL}/api/global-keyword-rules`, {
                keyword: keyword.trim().toUpperCase(),
                target_template_id: templateId ? Number(templateId) : null,
                match_type: matchType,
                priority: priority ? Number(priority) : 90,
                is_active: true,
            });
            setStatus('success');
            setMessage(`"${keyword.toUpperCase()}" keyword rule added successfully.`);
            setTimeout(() => { onSuccess(); onClose(); }, 1500);
        } catch (e: any) {
            setStatus('error');
            setMessage(e?.response?.data?.error || 'Failed to add keyword rule.');
        } finally { setLoading(false); }
    };

    const handleCsvSubmit = async () => {
        if (!file) { setStatus('error'); setMessage('Please select a CSV file.'); return; }
        setLoading(true); setStatus('idle');
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post(`${BASE_URL}/api/global-keyword-rules/bulk`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setStatus('success');
            setMessage(`Bulk import complete: ${res.data?.inserted ?? 0} added, ${res.data?.skipped ?? 0} skipped.`);
            setTimeout(() => { onSuccess(); onClose(); }, 1800);
        } catch (e: any) {
            setStatus('error');
            setMessage(e?.response?.data?.error || 'Failed to import CSV.');
        } finally { setLoading(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', borderRadius: '16px', width: '520px', maxWidth: '95vw', boxShadow: '0 24px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg,#0ea5e9,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Tag size={18} color="#fff" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Add Keyword Rule</div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>No embedding — stored as-is</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    {(['manual', 'csv'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '0.75rem', border: 'none', background: tab === t ? '#fff' : 'transparent', borderBottom: tab === t ? '2px solid #0ea5e9' : '2px solid transparent', color: tab === t ? '#0ea5e9' : '#94a3b8', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.15s' }}>
                            {t === 'manual' ? '✏️ Manual Entry' : '📄 CSV Import'}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ padding: '1.5rem' }}>
                    {tab === 'manual' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={labelStyle}>Keyword *</label>
                                <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. AMAZON PRIME" style={inputStyle} onKeyDown={e => e.key === 'Enter' && handleManualSubmit()} />
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.3rem' }}>Stored in UPPERCASE. No embedding generated.</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={labelStyle}>Target Template ID</label>
                                    <input value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="e.g. 36" type="number" style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Priority (0–100)</label>
                                    <input value={priority} onChange={e => setPriority(e.target.value)} placeholder="90" type="number" min={0} max={100} style={inputStyle} />
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Match Type</label>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {MATCH_TYPES.map(mt => (
                                        <button key={mt} onClick={() => setMatchType(mt)} style={{ padding: '0.35rem 0.8rem', borderRadius: '8px', border: matchType === mt ? '2px solid #0ea5e9' : '1px solid #e2e8f0', background: matchType === mt ? '#e0f2fe' : '#f8fafc', color: matchType === mt ? '#0284c7' : '#64748b', fontWeight: matchType === mt ? 700 : 500, fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s' }}>
                                            {mt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.6 }}>
                                <strong style={{ color: '#334155' }}>CSV Format:</strong><br />
                                Required: <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 3 }}>keyword</code>
                                &nbsp;· Optional: <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 3 }}>target_template_id, match_type, priority</code><br />
                                No embedding generation — rows stored as-is.
                            </div>
                            <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #bae6fd', borderRadius: '12px', padding: '2rem', textAlign: 'center', cursor: 'pointer', background: file ? '#f0fdf4' : '#f0f9ff', transition: 'all 0.15s' }}>
                                <Upload size={28} color={file ? '#10b981' : '#0ea5e9'} style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                                <div style={{ fontWeight: 600, color: file ? '#10b981' : '#0ea5e9', fontSize: '0.85rem' }}>{file ? file.name : 'Click to upload CSV'}</div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem' }}>Only .csv files accepted</div>
                                <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
                            </div>
                        </div>
                    )}

                    {status !== 'idle' && (
                        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', background: status === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${status === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
                            {status === 'success'
                                ? <CheckCircle size={16} color="#10b981" style={{ flexShrink: 0, marginTop: 1 }} />
                                : <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />}
                            <span style={{ fontSize: '0.8rem', color: status === 'success' ? '#166534' : '#991b1b' }}>{message}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={tab === 'manual' ? handleManualSubmit : handleCsvSubmit} disabled={loading} style={{ padding: '0.6rem 1.4rem', borderRadius: '8px', border: 'none', background: loading ? '#bae6fd' : 'linear-gradient(135deg,#0ea5e9,#06b6d4)', color: '#fff', fontWeight: 700, fontSize: '0.83rem', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {loading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Plus size={14} /> Add Rule</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GlobalKeywordRules() {
    const [data, setData] = useState<KeywordRuleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [search, setSearch] = useState('');
    const [filterMatchType, setFilterMatchType] = useState<MatchType | 'ALL'>('ALL');
    const [showModal, setShowModal] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${BASE_URL}/api/global-keyword-rules`);
            setData(res.data);
            setError(null);
        } catch {
            setError('Failed to load keyword rules. Please ensure the backend is running.');
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const filtered = data.filter(row => {
        const matchesSearch =
            row.keyword.toLowerCase().includes(search.toLowerCase()) ||
            String(row.target_template_id ?? '').includes(search);
        const matchesType = filterMatchType === 'ALL' || row.match_type === filterMatchType;
        return matchesSearch && matchesType;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const handleSearch = (val: string) => { setSearch(val); setCurrentPage(1); };
    const handleFilter = (val: MatchType | 'ALL') => { setFilterMatchType(val); setCurrentPage(1); };

    const activeCount = data.filter(r => r.is_active).length;

    return (
        <div style={{ padding: '1.5rem', maxWidth: '100%' }}>
            {showModal && <AddKeywordModal onClose={() => setShowModal(false)} onSuccess={fetchData} />}

            {/* Page header */}
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '14px', background: 'linear-gradient(135deg,#0ea5e9 0%,#06b6d4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(14,165,233,0.35)' }}>
                        <Tag size={24} color="#fff" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#0f172a' }}>Global Keyword Rules</div>
                        <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '0.1rem' }}>
                            <span style={{ color: '#0ea5e9', fontWeight: 600 }}>{data.length.toLocaleString()}</span> rules ·{' '}
                            <span style={{ color: '#10b981', fontWeight: 600 }}>{activeCount}</span> active
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search keyword or template ID…" style={{ ...inputStyle, paddingLeft: '2rem', width: '230px', fontSize: '0.82rem' }} />
                    </div>
                    <select value={filterMatchType} onChange={e => handleFilter(e.target.value as MatchType | 'ALL')} style={{ ...inputStyle, width: 'auto', paddingRight: '2rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                        <option value="ALL">All Match Types</option>
                        {MATCH_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button onClick={() => setShowModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.2rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#06b6d4)', color: '#fff', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(14,165,233,0.3)', whiteSpace: 'nowrap' }}>
                        <Plus size={15} /> Add Rule
                    </button>
                </div>
            </div>

            {/* Table card */}
            <div className="glass-card" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.75rem', color: '#0ea5e9' }}>
                        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontWeight: 600 }}>Loading keyword rules…</span>
                    </div>
                ) : error ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.75rem', color: '#ef4444' }}>
                        <AlertCircle size={20} /><span>{error}</span>
                    </div>
                ) : (
                    <>
                        {/* Info bar */}
                        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0f9ff' }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                Showing <strong style={{ color: '#1e293b' }}>{filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}</strong> of <strong style={{ color: '#1e293b' }}>{filtered.length}</strong> results
                                {(search || filterMatchType !== 'ALL') && <span style={{ color: '#0ea5e9' }}> (filtered)</span>}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Page {currentPage} of {totalPages}</span>
                        </div>

                        {/* Table */}
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a' }}>
                                        {['ID', 'Keyword', 'Template ID', 'Match Type', 'Priority', 'Hit Count', 'Status', 'Created At'].map(h => (
                                            <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#cbd5e1', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageData.length === 0 ? (
                                        <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>No rules found{search && ` matching "${search}"`}.</td></tr>
                                    ) : pageData.map((row, i) => (
                                        <tr key={row.keyword_id} style={{ background: i % 2 === 0 ? '#fff' : '#f0f9ff', borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.78rem' }}>#{row.keyword_id}</td>
                                            <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>{row.keyword}</td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                {row.target_template_id != null
                                                    ? <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#e0f2fe', color: '#0369a1', fontWeight: 700, fontSize: '0.75rem' }}>{row.target_template_id}</span>
                                                    : <span style={{ color: '#cbd5e1' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}><MatchTypeBadge type={row.match_type} /></td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '6px', background: row.priority >= 95 ? '#fef9c3' : '#f1f5f9', color: row.priority >= 95 ? '#a16207' : '#64748b', fontWeight: 700, fontSize: '0.75rem' }}>{row.priority}</span>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '6px', background: row.hit_count > 0 ? '#dcfce7' : '#f1f5f9', color: row.hit_count > 0 ? '#16a34a' : '#94a3b8', fontWeight: 700, fontSize: '0.75rem' }}>{row.hit_count}</span>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                {row.is_active
                                                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: '0.72rem' }}><ToggleRight size={12} /> Active</span>
                                                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#f1f5f9', color: '#94a3b8', fontWeight: 600, fontSize: '0.72rem' }}><ToggleLeft size={12} /> Inactive</span>}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                                                {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div style={{ borderTop: '1px solid #f1f5f9' }}>
                                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                            </div>
                        )}
                    </>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}