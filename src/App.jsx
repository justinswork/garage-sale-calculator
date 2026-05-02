import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import LandingPage from './pages/LandingPage.jsx';
import EventLayout from './pages/EventLayout.jsx';
import EventHomePage from './pages/EventHomePage.jsx';
import SalePage from './pages/SalePage.jsx';
import ReportPage from './pages/ReportPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import EventSettingsPage from './pages/EventSettingsPage.jsx';
import HostActivityPage from './pages/HostActivityPage.jsx';
import Loader from './components/Loader.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { user, loading, error } = useAuth();
  if (loading) return <Loader label="Connecting…" />;
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted">
        <div>
          <p className="font-semibold text-ink mb-2">Couldn't connect</p>
          <p className="text-sm">{error.message}</p>
        </div>
      </div>
    );
  }
  if (!user) return <Loader label="Connecting…" />;
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/e/:eventId" element={<EventLayout />}>
        <Route index element={<EventHomePage />} />
        <Route path="sale/:saleId" element={<SalePage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="settings" element={<EventSettingsPage />} />
        <Route path="hosts/:hostId" element={<HostActivityPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
