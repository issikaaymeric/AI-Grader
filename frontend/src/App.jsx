import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";

import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import ResultsPage from "./pages/ResultsPage";
import LoginPage from "./auth/LoginPage";
import RegisterPage from "./auth/RegisterPage";

function ProtectedRoute({ children }) {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <Navbar />
      <main>{children}</main>
    </>
  );
}

function PublicRoute({ children }) {
  const user = useAuthStore((state) => state.user);
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        <Route path="/"       element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/results" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}