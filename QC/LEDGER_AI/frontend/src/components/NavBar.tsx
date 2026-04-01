import { NavLink } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';

export default function NavBar() {
  return (
    <nav className="navbar">
      <div className="brand">
        <LayoutDashboard className="inline-block mr-2" size={24} style={{ verticalAlign: 'middle' }} />
        QC Admin
      </div>
      <div className="nav-links">
        <NavLink to="/review-document" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          Review Document
        </NavLink>
        <NavLink to="/frequent-transactions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          Frequently Changed
        </NavLink>
        <NavLink to="/random-documents" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          Random Check
        </NavLink>
        <NavLink to="/global-vector-cache" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          Vector Cache
        </NavLink>
        <NavLink to="/global-keyword-rules" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          Keyword Rules
        </NavLink>
      </div>
    </nav>
  );
}
