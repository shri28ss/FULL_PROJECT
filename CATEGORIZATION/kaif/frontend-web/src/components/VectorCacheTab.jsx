import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { supabase } from '../shared/supabase';
import { 
  Database, Database as CacheIcon, Search, Plus, X, 
  Loader2, CheckCircle, AlertCircle, Trash2, Cpu 
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const PAGE_SIZE = 50;

/**
 * VectorCacheTab Component
 * Semantic vector cache management for Categorization backend.
 */
const VectorCacheTab = () => {
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
            const res = await axios.get(`${API_BASE_URL}/api/qc/vector-cache`, {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            setData(res.data || []);
            setError(null);
        } catch (e) {
            console.error('Failed to load cache:', e);
            setError('Failed to fetch vector cache. Ensure ML service is running.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleDelete = async (id) => {
        if (!window.confirm('Remove from global vector cache?')) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            await axios.delete(`${API_BASE_URL}/api/qc/vector-cache/${id}`, {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            fetchData();
        } catch (e) {
            alert('Deletion failed: ' + (e.response?.data?.error || e.message));
        }
    };

    const filtered = data.filter(row => 
        row.clean_name.toUpperCase().includes(search.toUpperCase()) ||
        String(row.target_template_id || '').includes(search)
    );
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    return (
        <div style={styles.container}>
            {showModal && <AddVectorModal onClose={() => setShowModal(false)} onSuccess={fetchData} />}
            
            <header style={styles.header}>
                <div style={styles.headerTitleGroup}>
                   <div style={styles.iconBox}><Database size={18} color="#fff"/></div>
                   <div>
                      <h2 style={styles.title}>Global Vector Cache</h2>
                      <p style={styles.subtitle}>Semantic similarity embeddings for fuzzy string matching</p>
                   </div>
                </div>
                <div style={styles.headerActions}>
                   <div style={styles.searchBox}>
                      <Search size={14} style={styles.searchIcon}/>
                      <input 
                        type="text" 
                        placeholder="Search cache..." 
                        style={styles.searchInput} 
                        value={search} 
                        onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} 
                      />
                   </div>
                   <button style={styles.btnPrimary} onClick={() => setShowModal(true)}>
                      <Plus size={16}/> New Entry
                   </button>
                </div>
            </header>

            <div style={styles.tableCard}>
                <div style={styles.tableHeader}>
                    <div style={{ flex: 2 }}>CLEAN NAME</div>
                    <div style={{ flex: 1 }}>TEMPLATE ID</div>
                    <div style={{ flex: 1 }}>VERIFIED</div>
                    <div style={{ flex: 1 }}>APPROVALS</div>
                    <div style={{ flex: 1 }}>CREATED</div>
                    <div style={{ width: '80px', textAlign: 'center' }}>ACTIONS</div>
                </div>
                <div style={styles.tableBody}>
                    {loading ? (
                        <div style={styles.loaderArea}>
                            <Loader2 size={32} style={{ animation: 'spin 2s linear infinite', color: '#6366f1' }}/>
                            <p>Querying vector database...</p>
                        </div>
                    ) : error ? (
                        <div style={styles.errorArea}><AlertCircle size={24}/> {error}</div>
                    ) : pageData.length === 0 ? (
                        <div style={styles.emptyArea}>No cache entries found matching "{search}"</div>
                    ) : (
                        pageData.map((row, i) => (
                            <div key={row.cache_id} style={{ ...styles.tableRow, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                <div style={{ flex: 2, fontWeight: 700, color: '#fff', fontSize: '12px' }}>{row.clean_name}</div>
                                <div style={{ flex: 1 }}><span style={styles.idBadge}>{row.target_template_id}</span></div>
                                <div style={{ flex: 1 }}>
                                    {row.is_verified ? 
                                        <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 800 }}><CheckCircle size={12}/> YES</span> : 
                                        <span style={{ color: '#64748b', fontSize: '11px' }}>PENDING</span>
                                    }
                                </div>
                                <div style={{ flex: 1 }}>
                                    <span style={styles.approvalBadge}>{row.approval_count}</span>
                                </div>
                                <div style={{ flex: 1, fontSize: '10px', opacity: 0.5 }}>{new Date(row.created_at).toLocaleDateString()}</div>
                                <div style={{ width: '80px', display: 'flex', justifyContent: 'center' }}>
                                    <button style={styles.iconBtn} onClick={() => handleDelete(row.cache_id)}><Trash2 size={14}/></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

const AddVectorModal = ({ onClose, onSuccess }) => {
    const [name, setName] = useState('');
    const [templateId, setTemplateId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name) return setError('Clean name is required');
        
        setLoading(true); setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            await axios.post(`${API_BASE_URL}/api/qc/vector-cache`, {
                clean_name: name.trim().toUpperCase(),
                target_template_id: templateId ? Number(templateId) : null
            }, {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create vector entry');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
                <header style={styles.modalHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                       <Cpu size={18} color="#6366f1" />
                       <h3 style={{ margin: 0, fontSize: '1rem' }}>Generate New Vector</h3>
                    </div>
                    <button onClick={onClose} style={styles.closeBtn}><X size={18}/></button>
                </header>
                <form onSubmit={handleSubmit} style={styles.modalBody}>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Clean Reference Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g. AMAZON CLOUD SVCS"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          style={styles.formInput}
                          autoFocus
                        />
                        <span style={styles.inputNote}>Embedding (384-dim) will be generated by Model automatically.</span>
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Target Template ID</label>
                        <input 
                          type="number" 
                          placeholder="ID from COA library"
                          value={templateId}
                          onChange={e => setTemplateId(e.target.value)}
                          style={styles.formInput}
                        />
                    </div>
                    {error && <div style={styles.errorMsg}><AlertCircle size={14}/> {error}</div>}
                    <button type="submit" disabled={loading} style={styles.submitBtn}>
                        {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite', marginRight: '8px'}}/> Processing...</> : <><Plus size={16} style={{ marginRight: '8px'}}/> Create Vector</>}
                    </button>
                </form>
            </div>
        </div>
    );
};

const styles = {
    container: { display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' },
    headerTitleGroup: { display: 'flex', alignItems: 'center', gap: '1rem' },
    iconBox: { width: '42px', height: '42px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: 0 },
    subtitle: { fontSize: '12px', opacity: 0.6, margin: '2px 0 0 0' },
    headerActions: { display: 'flex', gap: '0.75rem', alignItems: 'center' },
    
    searchBox: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: '10px', padding: '0.5rem 0.85rem', width: '240px' },
    searchIcon: { opacity: 0.3 },
    searchInput: { background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', outline: 'none', width: '100%' },
    btnPrimary: { display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #6366f1, #c084fc)', border: 'none', color: '#fff', padding: '0.6rem 1.25rem', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)' },
    
    tableCard: { background: 'rgba(15, 23, 42, 0.3)', border: '1px solid rgba(148, 163, 184, 0.08)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1 },
    tableHeader: { display: 'flex', padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.4)', color: '#94a3b8', fontSize: '10px', fontWeight: 900, letterSpacing: '1px' },
    tableBody: { overflowY: 'auto' },
    tableRow: { display: 'flex', padding: '0.85rem 1.5rem', borderBottom: '1px solid rgba(148, 163, 184, 0.04)', fontSize: '13px', color: '#cbd5e1', alignItems: 'center' },
    
    idBadge: { background: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '11px' },
    approvalBadge: { background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 900 },
    iconBtn: { background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', borderRadius: '4px', transition: 'all 0.2s', '&:hover': { color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' } },
    
    loaderArea: { height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: '#64748b' },
    errorArea: { height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#ef4444' },
    emptyArea: { padding: '4rem', textAlign: 'center', color: '#64748b' },

    modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalContent: { background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '24px', width: '420px', maxWidth: '90vw', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' },
    modalHeader: { padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    closeBtn: { background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' },
    modalBody: { padding: '1.5rem' },
    formGroup: { marginBottom: '1.25rem' },
    label: { display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600, color: '#94a3b8' },
    formInput: { width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.85rem', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
    inputNote: { fontSize: '10px', color: '#64748b', marginTop: '6px', display: 'block' },
    submitBtn: { width: '100%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', color: '#fff', padding: '0.85rem', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '0.5rem' },
    errorMsg: { color: '#ef4444', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1rem' }
};

export default VectorCacheTab;
