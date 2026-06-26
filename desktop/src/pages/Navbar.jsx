import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const BRAND = { primary: '#7C3AED', light: '#EDE9FE', muted: '#9333EA' };

const ROLE_BADGE = {
  student:   { bg: '#EDE9FE', color: '#7C3AED' },
  professor: { bg: '#FCE7F3', color: '#BE185D' },
  admin:     { bg: '#FEE2E2', color: '#DC2626' },
};

const NAV_LINKS = {
  student: [
    { to: '/',       label: 'Submit'    },
    { to: '/grades', label: 'My Grades' },
  ],
  professor: [
    { to: '/',          label: 'Submissions' },
    { to: '/grades',    label: 'All Grades'  },
    { to: '/rubrics',   label: 'Rubrics'     },
    { to: '/analytics', label: 'Analytics'   },
  ],
  admin: [
    { to: '/',          label: 'Submissions' },
    { to: '/grades',    label: 'All Grades'  },
    { to: '/rubrics',   label: 'Rubrics'     },
    { to: '/analytics', label: 'Analytics'   },
  ],
};

function initials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function getIsMobile() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen]           = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile]   = useState(getIsMobile);  // lazy init — no crash risk

  const popoverRef = useRef(null);
  const navRef     = useRef(null);

  // Resize listener
  useEffect(() => {
    const onResize = () => setIsMobile(getIsMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Close popover on outside click
  useEffect(() => {
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  const links  = NAV_LINKS[user?.role] ?? NAV_LINKS.student;
  const badge  = ROLE_BADGE[user?.role] ?? { bg: '#F3F4F6', color: '#374151' };

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  return (
    // position: relative is required so the absolute mobile drawer is contained
    <nav ref={navRef} style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: '#ffffff',
      borderBottom: '1px solid #EDE9FE',
      boxShadow: '0 1px 8px rgba(124,58,237,0.06)',
    }}>
      {/* ── Main bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '54px', padding: '0 20px',
        position: 'relative',   // ← contains the absolute mobile drawer
      }}>

        {/* Left: hamburger + logo + desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {isMobile && (
            <button
              onClick={() => setMobileOpen((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                       fontSize: '18px', color: BRAND.primary, padding: '4px' }}
              aria-label="Toggle menu"
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
          )}

          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
            <span style={{ fontSize: '22px' }}>🧠</span>
            {!isMobile && (
              <span style={{ fontWeight: 700, fontSize: '15px',
                             background: `linear-gradient(90deg, ${BRAND.primary}, ${BRAND.muted})`,
                             WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                MindMark
              </span>
            )}
          </Link>

          {!isMobile && user && (
            <>
              <div style={{ width: '1px', height: '20px', background: '#EDE9FE' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                {links.map((l) => (
                  <DesktopNavLink key={l.to} {...l} isActive={location.pathname === l.to} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right: role badge + avatar */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!isMobile && (
              <span style={{
                fontSize: '11px', fontWeight: 600, padding: '3px 10px',
                borderRadius: '99px', textTransform: 'capitalize',
                background: badge.bg, color: badge.color,
                border: `1px solid ${badge.color}22`,
              }}>
                {user.role}
              </span>
            )}

            {/* Avatar + popover */}
            <div ref={popoverRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setOpen((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '4px 10px 4px 5px', borderRadius: '12px', cursor: 'pointer',
                  border: `1px solid ${open ? BRAND.primary : '#EDE9FE'}`,
                  background: open ? BRAND.light : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.muted})`,
                  color: '#fff', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '11px', fontWeight: 700,
                }}>
                  {initials(user.name)}
                </div>
                {!isMobile && (
                  <div style={{ textAlign: 'left', lineHeight: 1.3 }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, margin: 0, color: '#111827' }}>{user.name}</p>
                    <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>{user.email}</p>
                  </div>
                )}
                <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: '2px' }}>▾</span>
              </button>

              {open && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: '#fff', border: '1px solid #EDE9FE',
                  borderRadius: '14px', padding: '4px', minWidth: '190px',
                  boxShadow: '0 8px 24px rgba(124,58,237,0.12)',
                }}>
                  {/* User info header */}
                  <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #f3f4f6' }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, margin: 0, color: '#111827' }}>{user.name}</p>
                    <p style={{ fontSize: '10px', color: '#9ca3af', margin: '2px 0 0' }}>{user.email}</p>
                  </div>
                  <div style={{ paddingTop: '4px' }}>
                    <PopoverItem label="👤  Profile"  onClick={() => { setOpen(false); navigate('/profile');  }} />
                    <PopoverItem label="⚙️  Settings" onClick={() => { setOpen(false); navigate('/settings'); }} />
                    <div style={{ height: '1px', background: '#f3f4f6', margin: '4px 0' }} />
                    <PopoverItem label="Sign out" onClick={handleLogout} danger />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile drawer — inside the relative div so it's contained */}
        {isMobile && mobileOpen && user && (
          <div style={{
            position: 'absolute', top: '54px', left: 0, right: 0,
            background: '#fff', borderBottom: '1px solid #EDE9FE',
            padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: '2px',
            boxShadow: '0 4px 12px rgba(124,58,237,0.08)',
            zIndex: 39,
          }}>
            {links.map((l) => (
              <MobileNavLink key={l.to} {...l} isActive={location.pathname === l.to} />
            ))}
            <div style={{ height: '1px', background: '#EDE9FE', margin: '6px 0' }} />
            <MobileNavLink to="/profile"  label="Profile"  isActive={location.pathname === '/profile'}  />
            <MobileNavLink to="/settings" label="Settings" isActive={location.pathname === '/settings'} />
          </div>
        )}
      </div>
    </nav>
  );
}

function DesktopNavLink({ to, label, isActive }) {
  return (
    <Link to={to} style={{
      padding: '6px 12px', borderRadius: '8px', textDecoration: 'none',
      fontSize: '13px', fontWeight: isActive ? 600 : 400,
      color: isActive ? BRAND.primary : '#6b7280',
      background: isActive ? BRAND.light : 'transparent',
      transition: 'all 0.15s',
    }}>
      {label}
    </Link>
  );
}

function MobileNavLink({ to, label, isActive }) {
  return (
    <Link to={to} style={{
      padding: '10px 12px', borderRadius: '10px', textDecoration: 'none',
      fontSize: '14px', fontWeight: isActive ? 600 : 400,
      color: isActive ? BRAND.primary : '#374151',
      background: isActive ? BRAND.light : 'transparent',
    }}>
      {label}
    </Link>
  );
}

function PopoverItem({ label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', padding: '8px 12px',
      border: 'none', background: 'none', fontSize: '13px', cursor: 'pointer',
      borderRadius: '8px', color: danger ? '#DC2626' : '#374151',
      transition: 'background 0.1s',
    }}
      onMouseEnter={(e) => e.currentTarget.style.background = danger ? '#FEF2F2' : '#F9FAFB'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
    >
      {label}
    </button>
  );
}