import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { supabase } from '../shared/supabase';
import { 
  Plus, Search, Tag, X, Loader2, 
  Trash2, Edit2, AlertCircle, CheckCircle, Upload
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const PAGE_SIZE = 50;

/**
 * KeywordRulesTab Component
 * Ported from LEDGER_AI with glass aesthetics and full CRUD for Categorization backend.
 */
const KeywordRulesTab = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [showModal, setShowModal] = useState(false);
    const [error, setError] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await axios.get(`${API_BASE_URL}/api/qc/keyword-rules`, {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            setData(res.data || []);
            setError(null);
        } catch (e) {
            console.error('Failed to load rules:', e);
            setError('Failed to fetch keyword rules. Please check backend connection.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this rule?')) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            await axios.delete(`${API_BASE_URL}/api/qc/keyword-rules/${id}`, {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            fetchData();
        } catch (e) {
            alert('Failed to delete rule: ' + (e.response?.data?.error || e.message));
        }
    };

    const filtered = data.filter(row => row.keyword.toUpperCase().includes(search.toUpperCase()));
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    return (
        <div style={styles.container}>
            {showModal && <AddRuleModal onClose={() => setShowModal(false)} onSuccess={fetchData} />}
            
            <header style={styles.header}>
                <div style={styles.headerTitleGroup}>
                   <div style={styles.iconBox}><Tag size={18} color="#fff"/></div>
                   <div>
                      <h2 style={styles.title}>Global Keyword Rules</h2>
                      <p style={styles.subtitle}>Manage deterministic text-matching categorization rules</p>
                   </div>
                </div>
                <div style={styles.headerActions}>
                   <div style={styles.searchBox}>
                      <Search size={14} style={styles.searchIcon}/>
                      <input 
                        type="text" 
                        placeholder="Search rules..." 
                        style={styles.searchInput} 
                        value={search} 
                        onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} 
                      />
                   </div>
                   <button style={styles.btnPrimary} onClick={() => setShowModal(true)}>
                      <Plus size={16}/> Add Rule
                   </button>
                </div>
            </header>

            <div style={styles.tableCard}>
                <div style={styles.tableHeader}>
                    <div style={{ flex: 2 }}>KEYWORD</div>
                    <div style={{ flex: 1 }}>TEMPLATE ID</div>
                    <div style={{ flex: 1 }}>MATCH TYPE</div>
                    <div style={{ flex: 1 }}>PRIORITY</div>
                    <div style={{ flex: 1 }}>HITS</div>
                    <div style={{ flex: 1 }}>STATUS</div>
                    <div style={{ width: '80px', textAlign: 'center' }}>ACTIONS</div>
                </div>
                <div style={styles.tableBody}>
                    {loading ? (
                        <div style={styles.loaderArea}>
                            <Loader2 size={32} style={{ animation: 'spin 2s linear infinite', color: '#6366f1' }}/>
                            <p>Loading rules database...</p>
                        </div>
                    ) : error ? (
                        <div style={styles.errorArea}><AlertCircle size={24}/> {error}</div>
                    ) : pageData.length === 0 ? (
                        <div style={styles.emptyArea}>No rules found matching "{search}"</div>
                    ) : (
                        pageData.map(row => (
                            <div key={row.keyword_id} style={styles.tableRow}>
                                <div style={{ flex: 2, fontWeight: 700, color: '#fff' }}>{row.keyword}</div>
                                <div style={{ flex: 1 }}><span style={styles.idBadge}>{row.target_template_id}</span></div>
                                <div style={{ flex: 1 }}><span style={styles.typeBadge}>{row.match_type}</span></div>
                                <div style={{ flex: 1 }}>{row.priority}</div>
                                <div style={{ flex: 1 }}>{row.hit_count}</div>
                                <div style={{ flex: 1 }}>
                                    <span style={row.is_active ? styles.statusActive : styles.statusInactive}>
                                        {row.is_active ? 'ACTIVE' : 'DISABLED'}
                                    </span>
                                </div>
                                <div style={{ width: '80px', display: 'flex', justifyContent: 'center' }}>
                                    <button style={styles.iconBtn} onClick={() => handleDelete(row.keyword_id)}><Trash2 size={14}/></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                {totalPages > 1 && (
                    <div style={styles.pagination}>
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} style={styles.pageBtn}><ChevronLeft size={16}/></button>
                        <span style={{ fontSize: '12px' }}>Page {currentPage} of {totalPages}</span>
                        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} style={styles.pageBtn}><ChevronRight size={16}/></button>
                    </div>
                )}
            </div>
        </div>
    );
};

const AddRuleModal = ({ onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        keyword: '',
        target_template_id: '',
        match_type: 'CONTAINS',
        priority: 90,
        is_active: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.keyword) return setError('Keyword is required');
        
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            await axios.post(`${API_BASE_URL}/api/qc/keyword-rules`, {
                ...formData,
                target_template_id: formData.target_template_id ? Number(formData.target_template_id) : null,
                priority: Number(formData.priority)
            }, {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create rule');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
                <header style={styles.modalHeader}>
                    <h3>Create New Keyword Rule</h3>
                    <button onClick={onClose} style={styles.closeBtn}><X size={18}/></button>
                </header>
                <form onSubmit={handleSubmit} style={styles.modalBody}>
                    <div style={styles.formGroup}>
                        <label>Keyword / Text to Match</label>
                        <input 
                          type="text" 
                          placeholder="e.g. STARBUCKS"
                          value={formData.keyword}
                          onChange={e => setFormData({...formData, keyword: e.target.value})}
                          style={styles.formInput}
                        />
                    </div>
                    <div style={styles.formRow}>
                        <div style={styles.formGroup}>
                            <label>Target Template ID</label>
                            <input 
                              type="number" 
                              value={formData.target_template_id}
                              onChange={e => setFormData({...formData, target_template_id: e.target.value})}
                              style={styles.formInput}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label>Priority (1-100)</label>
                            <input 
                              type="number" 
                              value={formData.priority}
                              onChange={e => setFormData({...formData, priority: e.target.value})}
                              style={styles.formInput}
                            />
                        </div>
                    </div>
                    <div style={styles.formGroup}>
                        <label>Match Type</label>
                        <select 
                          value={formData.match_type}
                          onChange={e => setFormData({...formData, match_type: e.target.value})}
                          style={styles.formSelect}
                        >
                            <option value="CONTAINS">CONTAINS (Partial)</option>
                            <option value="EXACT">EXACT MATCH</option>
                            <option value="STARTS_WITH">STARTS WITH</option>
                            <option value="ENDS_WITH">ENDS WITH</option>
                        </select>
                    </div>
                    {error && <div style={styles.errorMsg}><AlertCircle size={14}/> {error}</div>}
                    <button type="submit" disabled={loading} style={styles.submitBtn}>
                        {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite'}}/> : 'Create Rule'}
                    </button>
                </form>
            </div>
        </div>
    );
}

const styles = {
    container: { display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' },
    headerTitleGroup: { display: 'flex', alignItems: 'center', gap: '1rem' },
    iconBox: { width: '42px', height: '42px', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: 0 },
    subtitle: { fontSize: '12px', opacity: 0.6, margin: '2px 0 0 0' },
    headerActions: { display: 'flex', gap: '0.75rem', alignItems: 'center' },
    
    searchBox: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: '10px', padding: '0.5rem 0.85rem', width: '240px' },
    searchIcon: { opacity: 0.3 },
    searchInput: { background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', outline: 'none', width: '100%' },
    btnPrimary: { display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', color: '#fff', padding: '0.6rem 1.25rem', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)' },
    
    tableCard: { background: 'rgba(15, 23, 42, 0.3)', border: '1px solid rgba(148, 163, 184, 0.08)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1 },
    tableHeader: { display: 'flex', padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.4)', color: '#94a3b8', fontSize: '10px', fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase' },
    tableBody: { overflowY: 'auto', flexGrow: 1 },
    tableRow: { display: 'flex', padding: '1rem 1.5rem', borderBottom: '1px solid rgba(148, 163, 184, 0.04)', fontSize: '13px', color: '#cbd5e1', alignItems: 'center', transition: 'background 0.2s', '&:hover': { background: 'rgba(255,255,255,0.02)' } },
    
    idBadge: { background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '11px' },
    typeBadge: { background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px' },
    statusActive: { color: '#10b981', fontWeight: 800, fontSize: '11px' },
    statusInactive: { color: '#ef4444', fontWeight: 800, fontSize: '11px' },
    iconBtn: { background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', borderRadius: '4px', transition: 'all 0.2s', '&:hover': { color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' } },
    
    pagination: { padding: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', borderTop: '1px solid rgba(148, 163, 184, 0.08)' },
    pageBtn: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', padding: '4px', cursor: 'pointer' },
    
    loaderArea: { height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: '#64748b' },
    errorArea: { height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#ef4444' },
    emptyArea: { padding: '4rem', textAlign: 'center', color: '#64748b', fontSize: '14px' },

    modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalContent: { background: '#1e293b', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '20px', width: '440px', maxWidth: '90vw', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' },
    modalHeader: { padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    closeBtn: { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' },
    modalBody: { padding: '1.5rem' },
    formGroup: { marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '6px' },
    formRow: { display: 'flex', gap: '1rem' },
    formInput: { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: '10px', padding: '0.75rem', color: '#fff', fontSize: '14px', outline: 'none' },
    formSelect: { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: '10px', padding: '0.75rem', color: '#fff', fontSize: '14px', outline: 'none' },
    submitBtn: { width: '100%', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', color: '#fff', padding: '0.85rem', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '0.5rem' },
    errorMsg: { color: '#ef4444', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1rem' }
};

export default KeywordRulesTab;
