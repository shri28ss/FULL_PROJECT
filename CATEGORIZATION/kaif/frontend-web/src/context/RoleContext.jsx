import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../shared/supabase';
import { useAuth } from '../shared/hooks/useAuth';

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const { user } = useAuth();
  const [role, setRole] = useState(() => localStorage.getItem('user-role'));
  const [roleLoading, setRoleLoading] = useState(!localStorage.getItem('user-role'));

  useEffect(() => {
    if (!user) {
      setRole(null);
      setRoleLoading(false);
      localStorage.removeItem('user-role');
      return;
    }

    const fetchRole = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        const currentRole = data?.role || 'USER';
        setRole(currentRole);
        localStorage.setItem('user-role', currentRole);
      } catch (err) {
        console.error('Error fetching role in RoleContext:', err);
        // Fallback to local storage if available, else default to USER
        setRole(localStorage.getItem('user-role') || 'USER');
      } finally {
        setRoleLoading(false);
      }
    };

    fetchRole();
  }, [user]);

  return (
    <RoleContext.Provider value={{ role, roleLoading }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};
