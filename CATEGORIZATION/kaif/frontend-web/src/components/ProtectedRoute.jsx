import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../shared/hooks/useAuth';
import { useRole } from '../context/RoleContext';

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { user, loading: authLoading } = useAuth();
  const { role, roleLoading } = useRole();

  // If we have a user but no role yet, we must wait (even if roleLoading is technically false 
  // after a logout/login transition). This prevents transient "Access Restricted" blips.
  if (authLoading || roleLoading || (user && !role)) {
    return <div style={{ 
      height: '100vh', 
      backgroundColor: 'var(--bg-primary, #0f172a)',
      display: 'grid',
      placeItems: 'center',
      color: 'var(--text-secondary)'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(72, 62, 168, 0.1)', borderTopColor: '#483EA8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Authenticating session...</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    if (role === 'QC') return <Navigate to="/qc" replace />;
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', backgroundColor: '#0f172a', color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ marginBottom: '8px' }}>Access Restricted</h2>
        <p style={{ color: '#94a3b8' }}>Your role ({role}) does not have permission to view this page.</p>
        <button onClick={() => window.location.href = '/'} style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '6px', background: '#483EA8', color: 'white', border: 'none', cursor: 'pointer' }}>Go Home</button>
      </div>
    </div>;
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
