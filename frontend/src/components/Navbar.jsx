import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const ROLE_BADGE = {
  student: { bg: '#EFF6FF', color: '#1D4ED8' },
  professor: { bg: '#EEF2FF', color: '#4338CA' },
  admin: { bg: '#FEF2F2', color: '#DC2626' },
};

const AVATAR_COLORS = {
  student: { bg: '#EFF6FF', color: '#1D4ED8' },
  professor: { bg: '#EEF2FF', color: '#4338CA' },
  admin: { bg: '#FEF2F2', color: '#DC2626' },
};

const NAV_LINKS = {
  student: [
    { to: '/', icon: 'ti-upload', label: 'Submit' },
    { to: '/grades', icon: 'ti-file-text', label: 'My grades' },
  ],
  professor: [
    { to: '/', icon: 'ti-upload', label: 'Submissions' },
    { to: '/grades', icon: 'ti-file-text', label: 'All grades' },
    { to: '/rubrics', icon: 'ti-list-check', label: 'Rubrics' },
    { to: '/analytics', icon: 'ti-chart-bar', label: 'Analytics' },
  ],
  admin: [
    { to: '/', icon: 'ti-upload', label: 'Submissions' },
    { to: '/grades', icon: 'ti-file-text', label: 'All grades' },
    { to: '/rubrics', icon: 'ti-list-check', label: 'Rubrics' },
    { to: '/analytics', icon: 'ti-chart-bar', label: 'Analytics' },
  ],
};

function initials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    function handler(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  if (!user) return (
    <nav style={{ background: '#ffffff', borderBottom: '0.5px solid #e5e7eb', padding: '0 20px', display: 'flex', alignItems: 'center', height: '52px', position: 'sticky', top: 0, zIndex: 40 }}>
      <span style={{ fontSize: '20px' }}>🧠</span>
      <span style={{ fontWeight: 500, fontSize: '15px', marginLeft: '8px' }}>MindMark</span>
    </nav>
  );

  const links = NAV_LINKS[user.role] ?? NAV_LINKS.student;
  const badge = ROLE_BADGE[user.role] ?? { bg: '#F3F4F6', color: '#374151' };
  const avatar = AVATAR_COLORS[user.role] ?? { bg: '#F3F4F6', color: '#374151' };

  return (
    <nav style={{ background: '#ffffff', borderBottom: '0.5px solid #e5e7eb', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '52px', position: 'sticky', top: 0, zIndex: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        {isMobile && (
          <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>
            {mobileOpen ? '✕' : '☰'}
          </button>
        )}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <span style={{ fontSize: '20px' }}>🧠</span>
          {!isMobile && <span style={{ fontWeight: 500, fontSize: '15px', color: '#111827' }}>MindMark</span>}
        </Link>

        {!isMobile && (
          <>
            <div style={{ width: '1px', height: '20px', background: '#e5e7eb' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              {links.map((l) => <NavLink key={l.to} {...l} isActive={location.pathname === l.to} />)}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {!isMobile && (
          <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '99px', textTransform: 'capitalize', background: badge.bg, color: badge.color }}>
            {user.role}
          </span>
        )}
        <div ref={popoverRef} style={{ position: 'relative' }}>
          <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px 4px 6px', borderRadius: '12px', border: `0.5px solid ${open ? '#9ca3af' : '#e5e7eb'}`, background: open ? '#f3f4f6' : 'transparent', cursor: 'pointer' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: avatar.bg, color: avatar.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 500 }}>
              {initials(user.name)}
            </div>
            {!isMobile && (
              <div style={{ textAlign: 'left', lineHeight: 1 }}>
                <p style={{ fontSize: '12px', fontWeight: 500, margin: 0 }}>{user.name}</p>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>{user.email}</p>
              </div>
            )}
          </button>
          {open && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#ffffff', border: '0.5px solid #d1d5db', borderRadius: '12px', padding: '4px', minWidth: '180px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <PopoverItem label="Profile" onClick={() => { setOpen(false); navigate('/profile'); }} />
              <PopoverItem label="Settings" onClick={() => { setOpen(false); navigate('/settings'); }} />
              <div style={{ height: '0.5px', background: '#e5e7eb', margin: '4px 0' }} />
              <PopoverItem label="Sign out" onClick={() => { setOpen(false); logout(); navigate('/login'); }} danger />
            </div>
          )}
        </div>
      </div>

      {isMobile && mobileOpen && (
        <div style={{ position: 'absolute', top: '52px', left: 0, width: '100%', background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {links.map((l) => <NavLink key={l.to} {...l} isActive={location.pathname === l.to} />)}
        </div>
      )}
    </nav>
  );
}

function NavLink({ to, label, isActive }) {
  return (
    <Link to={to} style={{ padding: '8px 12px', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', color: isActive ? '#111827' : '#6b7280', background: isActive ? '#f3f4f6' : 'transparent', transition: '0.2s' }}>
      {label}
    </Link>
  );
}

function PopoverItem({ label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', fontSize: '13px', color: danger ? '#DC2626' : '#374151', cursor: 'pointer', borderRadius: '6px' }}>
      {label}
    </button>
  );
}