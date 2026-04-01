import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import API from '../api/api';

const ParsingContext = createContext();

export const useParsing = () => useContext(ParsingContext);

export const ParsingProvider = ({ children }) => {
    const [activeDoc, setActiveDoc] = useState(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [latestFinishedDocId, setLatestFinishedDocId] = useState(null);
    
    // Notification Modal State
    const [notification, setNotification] = useState(null); // { type: 'success'|'error', title, message, docId }

    const pollRef = useRef(null);
    const timerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startExtraction = async (file, password = "") => {
        setIsExtracting(true);
        setActiveDoc({
            id: null,
            name: file.name,
            status: "UPLOADING",
            processingStatus: "EXTRACTING_TEXT",
            elapsedSeconds: 0,
            parsedType: null
        });

        const formData = new FormData();
        formData.append("file", file);
        if (password) formData.append("password", password);

        try {
            const res = await API.post("/documents/upload", formData);
            const docId = res.data.document_id;
            setActiveDoc(prev => ({ ...prev, id: docId, status: "PROCESSING" }));

            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setActiveDoc(prev => prev ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 } : null);
            }, 1000);

            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = setInterval(async () => {
                try {
                    const statusRes = await API.get(`/documents/status/${docId}`);
                    const { status: docStatus, transaction_parsed_type: docParsedType } = statusRes.data;
                    
                    setActiveDoc(prev => ({ 
                        ...prev, 
                        processingStatus: docStatus, 
                        parsedType: docParsedType || prev.parsedType 
                    }));

                    if (["AWAITING_REVIEW", "APPROVE", "POSTED", "DONE"].includes(docStatus)) {
                        stopPolling(docId, "DONE");
                        setNotification({
                            type: 'success',
                            title: 'Extraction Complete',
                            message: `Transactions for "${file.name}" have been extracted successfully.`,
                            docId: docId
                        });
                    } else if (docStatus === "FAILED") {
                        stopPolling(docId, "ERROR");
                        setNotification({
                            type: 'error',
                            title: 'Extraction Failed',
                            message: `Failed to process "${file.name}". Please check the file if it's protected or corrupted.`,
                            docId: docId
                        });
                    }
                } catch (err) {
                    console.error("Polling error", err);
                }
            }, 2000);

        } catch (err) {
            setIsExtracting(false);
            setActiveDoc(null);
            throw err;
        }
    };

    const stopPolling = (docId, finalStatus) => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        setIsExtracting(false);
        setLatestFinishedDocId(docId);
        setActiveDoc(prev => prev ? { ...prev, status: finalStatus } : null);
    };

    const clearActiveDoc = () => {
        setActiveDoc(null);
        setIsExtracting(false);
    };

    return (
        <ParsingContext.Provider value={{
            activeDoc,
            isExtracting,
            latestFinishedDocId,
            startExtraction,
            clearActiveDoc,
            setLatestFinishedDocId,
            notification,
            setNotification
        }}>
            {children}
            <NotificationPortal notification={notification} onClose={() => setNotification(null)} />
        </ParsingContext.Provider>
    );
};

const NotificationPortal = ({ notification, onClose }) => {
    if (!notification) return null;

    return (
        <div style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 9999,
            width: '360px',
            animation: 'slideIn 0.4s ease-out'
        }}>
            <div style={{
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(12px)',
                borderRadius: '16px',
                border: `1px solid ${notification.type === 'success' ? 'rgba(39, 174, 96, 0.2)' : 'rgba(231, 76, 60, 0.2)'}`,
                boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                padding: '1.25rem',
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start'
            }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: notification.type === 'success' ? '#def7ec' : '#fde8e8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    <span style={{ color: notification.type === 'success' ? '#03543f' : '#9b1c1c', fontSize: '1.2rem', fontWeight: 800 }}>
                        {notification.type === 'success' ? '✓' : '!'}
                    </span>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e1b4b', marginBottom: '4px' }}>
                        {notification.title}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.4, marginBottom: '0.75rem' }}>
                        {notification.message}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {notification.type === 'success' && (
                            <button 
                                onClick={() => { window.location.href = `/review?id=${notification.docId}`; onClose(); }}
                                style={{
                                    background: '#483EA8', color: '#fff', border: 'none', 
                                    padding: '6px 16px', borderRadius: '6px', fontSize: '0.75rem', 
                                    fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                OK
                            </button>
                        )}
                        <button 
                            onClick={onClose}
                            style={{
                                background: 'transparent', color: '#9ca3af', border: '1px solid #e5e7eb', 
                                padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', 
                                fontWeight: 700, cursor: 'pointer'
                            }}
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
};
