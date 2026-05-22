// ============================================================
// App.jsx
//
// Root component. Sets up client-side routing with
// react-router-dom. Three routes:
//   /login        — public, accessible to anyone
//   /dashboard    — protected, volunteers only
//   /admin        — protected, admins only
//
// ProtectedRoute handles session checks and role enforcement.
// ============================================================

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./components/LoginPage";
import AcceptInvitePage from "./components/AcceptInvitePage";
import VolunteerDashboard from "./components/VolunteerDashboard";
import AdminDashboard from "./components/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import PrayerDashboard from "./components/PrayerDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />

        {/* Protected volunteer route */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requiredRole="volunteer">
              <VolunteerDashboard />
            </ProtectedRoute>
          }
        />

        {/* Protected admin route */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* Protected prayer ministry route */}
        <Route
          path="/prayer"
          element={
            <ProtectedRoute requiredRole="prayer_team">
              <PrayerDashboard />
            </ProtectedRoute>
          }
        />

        {/* Redirect root to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
