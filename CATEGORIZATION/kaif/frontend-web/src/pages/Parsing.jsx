import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import {
    FileUp, CheckCircle, Loader2, AlertCircle, Search, Cpu, List, Lock,
    FileText, Clock, ChevronDown, Table as TableIcon, Trash2
} from "lucide-react";
import API from "../api/api";
import { useNavigate } from "react-router-dom";

export default function ParsingPage() {
    const navigate = useNavigate();

    const [file, setFile] = useState(null);
    const [password, setPassword] = useState("");
    const [needsPassword, setNeedsPassword] = useState(false);
    const [pdfType, setPdfType] = useState(null);
    const [status, setStatus] = useState("IDLE");
    const [processingStatus, setProcessingStatus] = useState("");
    const [error, setError] = useState("");
    const [documentId, setDocumentId] = useState(null);
    const fileInputRef = useRef(null);

    // Dashboard state merged from Dashboard.jsx
    const [stats, setStats] = useState({ total: 0, parsed: 0, failed: 0, pending_review: 0 });
    const [recentDocs, setRecentDocs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sortOption, setSortOption] = useState("Newest first");
    const [isSortOpen, setIsSortOpen] = useState(false);

    const sortOptions = ["Newest first", "Oldest first", "Last activity", "Alphabetically"];

    // Fetch dashboard data on mount
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [statsRes, recentRes] = await Promise.all([
                API.get("/documents/stats"),
                API.get("/documents/recent")
            ]);
            setStats(statsRes.data);
            setRecentDocs(recentRes.data);
        } catch (err) {
            console.error("Failed to fetch dashboard data", err);
        } finally {
            setIsLoading(false);
        }
    };

    const sortedDocs = [...recentDocs].sort((a, b) => {
        if (sortOption === "Newest first") return new Date(b.created_at) - new Date(a.created_at);
        if (sortOption === "Oldest first") return new Date(a.created_at) - new Date(b.created_at);
        if (sortOption === "Alphabetically") return a.file_name.localeCompare(b.file_name);
        return 0;
    });

    const handleDeleteDocument = async (docId, fileName) => {
        const confirmed = window.confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`);
        if (!confirmed) return;
        try {
            await API.delete(`/documents/${docId}`);
            setRecentDocs(prev => prev.filter(d => d.document_id !== docId));
            const statsRes = await API.get("/documents/stats");
            setStats(statsRes.data);
        } catch (err) {
            console.error("Delete failed", err);
            alert("Failed to delete document: " + (err.response?.data?.detail || err.message));
        }
    };

    const formatTime = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return "Just now";
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return date.toLocaleDateString();
    };

    const statCards = [
        { label: "Total Uploads", value: stats.total, icon: FileText, color: "#483EA8" },
        { label: "Successfully Parsed", value: stats.parsed, icon: CheckCircle, color: "#27ae60" },
        { label: "Failed/Corrupted", value: stats.failed, icon: AlertCircle, color: "#e74c3c" },
        { label: "Pending Review", value: stats.pending_review, icon: Clock, color: "#f39c12" },
    ];

    const steps = [
        {
            label: "Upload & Detect",
            icon: Search,
            statuses: ["DETECTING", "DETECTED", "PASSWORD_REQUIRED", "UPLOADING", "PROCESSING",
                "EXTRACTING_TEXT", "IDENTIFYING_FORMAT", "PARSING_TRANSACTIONS", "AWAITING_REVIEW", "DONE"],
        },
        {
            label: "Text Extraction",
            icon: List,
            statuses: ["EXTRACTING_TEXT", "IDENTIFYING_FORMAT", "PARSING_TRANSACTIONS", "AWAITING_REVIEW", "DONE"],
        },
        {
            label: "Format Identification",
            icon: Search,
            statuses: ["IDENTIFYING_FORMAT", "PARSING_TRANSACTIONS", "AWAITING_REVIEW", "DONE"],
            subtext: "Checking if format exists in DB...",
        },
        {
            label: "Transaction Extraction",
            icon: Cpu,
            statuses: ["PARSING_TRANSACTIONS", "AWAITING_REVIEW", "DONE"],
            subtext: "Running extraction pipeline...",
        },
        {
            label: "Validation & Review",
            icon: CheckCircle,
            statuses: ["AWAITING_REVIEW", "DONE"],
            subtext: "Checking code accuracy...",
        },
    ];

    const getStepState = (step, idx) => {
        const currentStatus = processingStatus || status;
        const isIncluded = step.statuses.includes(currentStatus);
        const nextStep = steps[idx + 1];
        const nextActive = nextStep ? nextStep.statuses.includes(currentStatus) : false;

        if (currentStatus === "DONE" || currentStatus === "AWAITING_REVIEW") return "completed";
        if (nextActive) return "completed";
        if (isIncluded && !nextActive) return "active";
        return "pending";
    };

    const getProcessingSubtext = () => {
        const currentStatus = processingStatus || status;
        switch (currentStatus) {
            case "EXTRACTING_TEXT":
                return "Extracting text from PDF pages...";
            case "IDENTIFYING_FORMAT":
                return "Checking if format exists in database...";
            case "PARSING_TRANSACTIONS":
                return "Running extraction pipeline (Code + LLM)...";
            case "AWAITING_REVIEW":
                return "Processing complete! Transactions ready for review.";
            default:
                return "";
        }
    };

    const onFileChange = async (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;
        if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
            setError("Only PDF files are supported.");
            return;
        }

        setFile(selectedFile);
        setError("");
        setPdfType(null);
        setNeedsPassword(false);
        setPassword("");
        setDocumentId(null);
        setProcessingStatus("");

        setStatus("DETECTING");
        const formData = new FormData();
        formData.append("file", selectedFile);

        try {
            const res = await API.post("/documents/verify-type", formData);
            const type = res.data.pdf_type;
            setPdfType(type);

            if (type === "PASSWORD_TEXT_PDF") {
                setNeedsPassword(true);
                setStatus("PASSWORD_REQUIRED");
                setError("This PDF is password-protected. Please enter the password below.");
            } else if (type === "CORRUPTED_PDF") {
                setStatus("ERROR");
                setError("This file appears to be corrupted and cannot be processed.");
            } else if (type === "RESTRICTED_PDF") {
                setStatus("ERROR");
                setError("This PDF has restrictions that prevent text extraction.");
            } else {
                setStatus("DETECTED");
            }
        } catch (err) {
            setStatus("ERROR");
            setError(err.response?.data?.detail || "Failed to detect PDF type.");
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setStatus("UPLOADING");
        setError("");
        setProcessingStatus("EXTRACTING_TEXT");

        const formData = new FormData();
        formData.append("file", file);
        if (password) formData.append("password", password);

        try {
            const res = await API.post("/documents/upload", formData);
            const docId = res.data.document_id;
            setDocumentId(docId);
            setStatus("PROCESSING");

            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await API.get(`/documents/status/${docId}`);
                    const docStatus = statusRes.data.status;
                    setProcessingStatus(docStatus);

                    if (docStatus === "AWAITING_REVIEW" || docStatus === "APPROVE" || docStatus === "POSTED") {
                        clearInterval(pollInterval);
                        setStatus("DONE");
                        fetchData();
                    } else if (docStatus === "FAILED") {
                        clearInterval(pollInterval);
                        setStatus("ERROR");
                        setError("Processing failed. The document could not be parsed.");
                    }
                } catch {
                    // Keep polling
                }
            }, 2000);

            setTimeout(() => {
                clearInterval(pollInterval);
            }, 300000);

        } catch (err) {
            setStatus("ERROR");
            setError(err.response?.data?.detail || "Upload failed. Please try again.");
        }
    };

    const isProcessing = ["UPLOADING", "PROCESSING"].includes(status);
    const showStepper = !["IDLE", "ERROR"].includes(status);
    const canUpload = file && !isProcessing && (status === "DETECTED" || (status === "PASSWORD_REQUIRED" && password));

    const typeLabel = {
        TEXT_PDF: "Text-based PDF",
        PASSWORD_TEXT_PDF: "Password-Protected PDF",
        SCANNED_PDF: "Scanned/Image PDF",
        IMAGE_CONVERTED_PDF: "Image-Converted PDF",
        HYBRID_PDF: "Hybrid PDF (Text + Images)",
        RESTRICTED_PDF: "Restricted PDF",
        CORRUPTED_PDF: "Corrupted PDF",
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>Extract PDF</h2>
            </div>

            <div className="upload-page-card" style={{ background: 'var(--card-bg)', padding: '2rem', borderRadius: '16px', marginBottom: '2rem' }}>
                {showStepper && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', paddingBottom: '1.5rem', marginBottom: '0rem' }}>
                            {steps.map((step, i) => {
                                const state = getStepState(step, i);
                                return (
                                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: state === 'completed' ? '#27ae60' : state === 'active' ? '#483EA8' : '#f3f4f6',
                                            color: state === 'pending' ? '#9ca3af' : 'white',
                                            marginBottom: '0.5rem', zIndex: 1, transition: 'all 0.3s'
                                        }}>
                                            {state === 'completed' ? <CheckCircle size={16} /> :
                                                state === 'active' ? <Loader2 size={16} className="spin-icon" /> :
                                                    <step.icon size={16} />}
                                        </div>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.2 }}>{step.label}</span>
                                        {i < steps.length - 1 && (
                                            <div style={{
                                                position: 'absolute', top: 16, left: '50%', width: '100%', height: 2,
                                                background: state === 'completed' ? '#27ae60' : '#e5e7eb', zIndex: 0
                                            }} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {isProcessing && (
                            <div style={{
                                padding: '0.85rem 1rem',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #f0eeff 0%, #e8e4ff 100%)',
                                border: '1px solid #d8d4f0',
                                marginBottom: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}>
                                <Loader2 size={16} className="spin-icon" style={{ color: '#483EA8' }} />
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#483EA8' }}>
                                    {getProcessingSubtext() || "Processing Document..."}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                <div>
                    <div
                        className="dropzone"
                        onClick={() => !isProcessing && fileInputRef.current.click()}
                        style={{
                            opacity: isProcessing ? 0.6 : 1,
                            cursor: isProcessing ? 'default' : 'pointer',
                            minHeight: '260px',
                            border: '2px dashed var(--border-color)',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2rem'
                        }}
                    >
                        <input
                            type="file"
                            hidden
                            ref={fileInputRef}
                            onChange={onFileChange}
                            accept=".pdf"
                        />
                        <FileUp size={48} style={{ color: '#483EA8', marginBottom: '1rem' }} />
                        <div style={{
                            fontSize: '1rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: '0.5rem'
                        }}>
                            {file ? file.name : <>Drag or <span style={{ color: '#483EA8' }}>upload file</span> here</>}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Supports PDF files only (Text-based, Password or Scanned)</div>
                    </div>

                    {pdfType && (
                        <div style={{
                            marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '1rem', borderRadius: '12px', background: '#f0eeff',
                            border: '1px solid #d8d4f0'
                        }}>
                            <Search size={16} color="#483EA8" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#483EA8' }}>
                                Detected: {typeLabel[pdfType] || pdfType}
                            </span>
                        </div>
                    )}

                    {needsPassword && (
                        <div style={{ marginTop: '2.5rem', textAlign: 'left' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                <Lock size={14} /> Document Password
                            </label>
                            <input
                                type="password"
                                placeholder="Enter PDF password to unlock extraction..."
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: 'var(--input-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.9rem'
                                }}
                            />
                        </div>
                    )}

                    {error && (
                        <div style={{
                            marginTop: '1.5rem', background: '#fdf0ef', border: '1px solid #fbdbd9',
                            padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center',
                            gap: '0.75rem', color: '#e74c3c', fontSize: '0.85rem', fontWeight: 600
                        }}>
                            <AlertCircle size={18} /> {error}
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '1rem' }}>
                    <button
                        disabled={!canUpload}
                        onClick={handleUpload}
                        style={{
                            width: '100%',
                            height: '56px',
                            fontSize: '1rem',
                            borderRadius: '12px',
                            background: canUpload ? '#483EA8' : '#e5e7eb',
                            color: canUpload ? 'white' : '#9ca3af',
                            border: 'none',
                            fontWeight: 700,
                            cursor: canUpload ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isProcessing ? (
                            <><Loader2 size={20} className="spin-icon" /> PROCESSING...</>
                        ) : status === "DONE" ? (
                            <><CheckCircle size={20} /> COMPLETED</>
                        ) : (
                            "UPLOAD & START EXTRACTION"
                        )}
                    </button>
                </div>
            </div>

            {/* Stats Cards Section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                {statCards.map((stat, i) => (
                    <div key={i} style={{
                        background: 'var(--card-bg)',
                        borderRadius: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1.25rem',
                        padding: '1.5rem',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ padding: '0.85rem', borderRadius: '14px', background: `${stat.color}12`, color: stat.color }}>
                            <stat.icon size={26} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{stat.label}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{stat.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Sort Dropdown */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Sort:</span>
                    <div
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 700, color: '#483EA8' }}
                        onClick={() => setIsSortOpen(!isSortOpen)}
                    >
                        {sortOption} <ChevronDown size={14} />
                    </div>
                    {isSortOpen && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: '40px',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                            zIndex: 10,
                            width: '180px',
                            padding: '0.5rem 0'
                        }}>
                            {sortOptions.map(opt => (
                                <div
                                    key={opt}
                                    onClick={() => { setSortOption(opt); setIsSortOpen(false); }}
                                    style={{
                                        padding: '0.6rem 1rem',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        background: sortOption === opt ? '#f0eeff' : 'transparent',
                                        color: sortOption === opt ? '#483EA8' : 'var(--text-secondary)',
                                        fontWeight: sortOption === opt ? 700 : 500
                                    }}
                                >
                                    {opt}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Documents Table */}
            <div style={{ background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-secondary)' }}>
                                <th style={{ padding: '1rem 2rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Name</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Documents</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Parsed</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Failed</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Type</th>
                                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Last activity</th>
                                <th style={{ padding: '1rem 2rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>
                                        <Loader2 size={24} color="#483EA8" className="spin-icon" style={{ display: 'inline-block' }} />
                                    </td>
                                </tr>
                            ) : sortedDocs.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                        No documents found.
                                    </td>
                                </tr>
                            ) : (
                                sortedDocs.map((doc) => (
                                    <tr key={doc.document_id} style={{ borderTop: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '1.25rem 2rem' }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{doc.file_name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                {doc.institution_name || 'Bank Statement'}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>1</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                background: doc.status === 'APPROVE' ? '#def7ec' : '#f3f4f6',
                                                color: doc.status === 'APPROVE' ? '#03543f' : '#9ca3af',
                                                fontSize: '0.75rem',
                                                fontWeight: 700
                                            }}>
                                                {doc.status === 'APPROVE' ? '1' : '0'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center', color: '#9ca3af' }}>
                                            {doc.status === 'FAILED' ? '1' : '-'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span style={{
                                                background: '#fef3c7',
                                                color: '#92400e',
                                                padding: '2px 10px',
                                                borderRadius: '50px',
                                                fontSize: '0.65rem',
                                                fontWeight: 800,
                                                textTransform: 'uppercase'
                                            }}>
                                                {doc.transaction_parsed_type === 'LLM' ? 'AI' : doc.transaction_parsed_type || 'N/A'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                            {formatTime(doc.created_at)}
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '1.25rem 2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => navigate(`/review?id=${doc.document_id}`)}
                                                    style={{
                                                        background: 'none',
                                                        border: '1px solid var(--border-color)',
                                                        padding: '6px 12px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: '#483EA8',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <TableIcon size={14} /> Transactions
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteDocument(doc.document_id, doc.file_name)}
                                                    title="Delete document"
                                                    style={{
                                                        background: 'none',
                                                        border: '1px solid #fecaca',
                                                        padding: '6px 8px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: '#e74c3c',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </motion.div>
    );
}
