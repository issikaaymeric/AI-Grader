import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Navbar from './pages/Navbar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import MyGradesPage from './pages/MyGradesPage';
import ResultsPage from './pages/ResultsPage';

function RequireAuth({ children }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={
            <RequireAuth><Dashboard /></RequireAuth>
          } />
          <Route path="/grades" element={
            <RequireAuth><MyGradesPage /></RequireAuth>
          } />
          <Route path="/results" element={
            <RequireAuth><ResultsPage /></RequireAuth>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
