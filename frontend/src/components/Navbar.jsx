import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const ROLE_BADGE = {
  student:   { bg: '#EFF6FF', color: '#1D4ED8' },
  professor: { bg: '#EEF2FF', color: '#4338CA' },
  admin:     { bg: '#FEF2F2', color: '#DC2626' },
};

const AVATAR_COLORS = {
  student:   { bg: '#EFF6FF', color: '#1D4ED8' },
  professor: { bg: '#EEF2FF', color: '#4338CA' },
  admin:     { bg: '#FEF2F2', color: '#DC2626' },
};

const NAV_LINKS = {
  student: [
    { to: '/',       icon: 'ti-upload',    label: 'Submit' },
    { to: '/grades', icon: 'ti-file-text', label: 'My grades' },
  ],
  professor: [
    { to: '/',          icon: 'ti-upload',     label: 'Submissions' },
    { to: '/grades',    icon: 'ti-file-text',  label: 'All grades' },
    { to: '/rubrics',   icon: 'ti-list-check', label: 'Rubrics' },
    { to: '/analytics', icon: 'ti-chart-bar',  label: 'Analytics' },
  ],
  admin: [
    { to: '/',          icon: 'ti-upload',     label: 'Submissions' },
    { to: '/grades',    icon: 'ti-file-text',  label: 'All grades' },
    { to: '/rubrics',   icon: 'ti-list-check', label: 'Rubrics' },
    { to: '/analytics', icon: 'ti-chart-bar',  label: 'Analytics' },
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
  const popoverRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => setOpen(false), [location.pathname]);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  // Render a skeleton bar while Zustand rehydrates from localStorage
  // so the layout doesn't flash/collapse on first load
  if (!user) {
    return (
      <nav style={{
        background: '#ffffff',
        borderBottom: '0.5px solid #e5e7eb',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        height: '52px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🧠</span>
          <span style={{ fontWeight: 500, fontSize: '15px', color: '#111827' }}>AI Grader</span>
        </div>
      </nav>
    );
  }

  const links = NAV_LINKS[user.role] ?? NAV_LINKS.student;
  const badge = ROLE_BADGE[user.role] ?? { bg: '#F3F4F6', color: '#374151' };
  const avatar = AVATAR_COLORS[user.role] ?? { bg: '#F3F4F6', color: '#374151' };

  return (
    <nav style={{
      background: '#ffffff',
      borderBottom: '0.5px solid #e5e7eb',
      padding: '0 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '52px',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>

      {/* ── Left: brand + nav links ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>

        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <span style={{ fontSize: '20px' }}>🧠</span>
          <span style={{ fontWeight: 500, fontSize: '15px', color: '#111827' }}>AI Grader</span>
        </Link>

        <div style={{ width: '1px', height: '20px', background: '#e5e7eb' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {links.map(({ to, icon, label }) => {
            const isActive = location.pathname === to;
            return (
              <NavLink key={to} to={to} icon={icon} label={label} isActive={isActive} />
            );
          })}
        </div>
      </div>

      {/* ── Right: badge + user menu ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

        <span style={{
          fontSize: '11px',
          fontWeight: 500,
          padding: '2px 8px',
          borderRadius: '99px',
          textTransform: 'capitalize',
          background: badge.bg,
          color: badge.color,
        }}>
          {user.role}
        </span>

        <div ref={popoverRef} style={{ position: 'relative' }}>

          {/* Trigger */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px 4px 6px',
              borderRadius: '12px',
              border: `0.5px solid ${open ? '#9ca3af' : '#e5e7eb'}`,
              background: open ? '#f3f4f6' : 'transparent',
              cursor: 'pointer',
              transition: 'border-color 0.12s, background 0.12s',
            }}
          >
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: avatar.bg, color: avatar.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 500, flexShrink: 0,
            }}>
              {initials(user.name)}
            </div>

            {/* Name + email — inline style only, no Tailwind responsive class */}
            <div style={{ lineHeight: 1.3, textAlign: 'left' }}>
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#111827', margin: 0 }}>
                {user.name}
              </p>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>
                {user.email}
              </p>
            </div>

            <span style={{
              fontSize: '12px', color: '#9ca3af', marginLeft: '2px',
              transform: open ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.15s', display: 'inline-block',
            }}>▾</span>
          </button>

          {/* Dropdown */}
          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              background: '#ffffff',
              border: '0.5px solid #d1d5db',
              borderRadius: '12px', padding: '4px', minWidth: '200px', zIndex: 50,
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            }}>
              <div style={{
                padding: '10px 12px 8px',
                borderBottom: '0.5px solid #e5e7eb', marginBottom: '4px',
              }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#111827', margin: 0 }}>{user.name}</p>
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>{user.email}</p>
              </div>

              <PopoverItem label="Profile"  onClick={() => { setOpen(false); navigate('/profile'); }} />
              <PopoverItem label="Settings" onClick={() => { setOpen(false); navigate('/settings'); }} />

              <div style={{ height: '0.5px', background: '#e5e7eb', margin: '4px 0' }} />

              <PopoverItem label="Sign out" onClick={handleLogout} danger />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function NavLink({ to, icon, label, isActive }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        fontSize: '13px', textDecoration: 'none', padding: '6px 10px',
        borderRadius: '8px', transition: 'background 0.12s, color 0.12s',
        color: isActive || hovered ? '#111827' : '#6b7280',
        background: isActive || hovered ? '#f3f4f6' : 'transparent',
      }}
    >
      {label}
    </Link>
  );
}

function PopoverItem({ label, onClick, danger = false }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '7px 12px', borderRadius: '8px', fontSize: '13px',
        color: hovered ? (danger ? '#DC2626' : '#111827') : '#6b7280',
        background: hovered ? (danger ? '#FEF2F2' : '#f3f4f6') : 'transparent',
        border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {label}
    </button>
  );
}