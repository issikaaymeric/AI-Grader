import './i18n/index';
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import Navbar from "./pages/Navbar";
import Dashboard from "./pages/Dashboard";
import ResultsPage from "./pages/ResultsPage";
import MyGradesPage from "./pages/MyGradesPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";

function ProtectedRoute({ children }) {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const user = useAuthStore((state) => state.user);
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  const user = useAuthStore((state) => state.user);

  return (
    <HashRouter>
      {user && <Navbar />}
      <main>
        <Routes>
          <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/"         element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/results"  element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
          <Route path="/grades"   element={<ProtectedRoute><MyGradesPage /></ProtectedRoute>} />
          <Route path="/profile"  element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </HashRouter>
  );
}