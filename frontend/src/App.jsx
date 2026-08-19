import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';

import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import NewInterviewPage from './pages/NewInterviewPage.jsx';
import InterviewRoomPage from './pages/InterviewRoomPage.jsx';
import CodingChallengePage from './pages/CodingChallengePage.jsx';
import ReportPage from './pages/ReportPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
          <Route path="/interviews/new" element={<ProtectedRoute><NewInterviewPage /></ProtectedRoute>} />
          <Route path="/interviews/:id/room" element={<ProtectedRoute><InterviewRoomPage /></ProtectedRoute>} />
          <Route path="/interviews/:id/coding" element={<ProtectedRoute><CodingChallengePage /></ProtectedRoute>} />
          <Route path="/interviews/:id/report" element={<ProtectedRoute><ReportPage /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
