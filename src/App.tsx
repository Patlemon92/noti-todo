import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AuthView from './views/AuthView';
import FocusView from './views/FocusView';
import PageView from './views/PageView';
import BoardsView from './views/BoardsView';
import NotesView from './views/NotesView';
import ProfileView from './views/ProfileView';
import InstallPrompt from './pwa/InstallPrompt';

function Protected({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/auth" replace state={{ from: location }} />;
  return children;
}

function PublicOnly({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (session) return <Navigate to="/focus" replace />;
  return children;
}

function FullPageLoader() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <span className="font-mono text-sm uppercase tracking-mono text-ink-soft">
        loading…
      </span>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div>
        <Routes>
          <Route
            path="/auth"
            element={
              <PublicOnly>
                <AuthView />
              </PublicOnly>
            }
          />
          <Route
            path="/focus"
            element={
              <Protected>
                <FocusView />
              </Protected>
            }
          />
          <Route
            path="/boards"
            element={
              <Protected>
                <BoardsView />
              </Protected>
            }
          />
          <Route
            path="/notes"
            element={
              <Protected>
                <NotesView />
              </Protected>
            }
          />
          <Route
            path="/profile"
            element={
              <Protected>
                <ProfileView />
              </Protected>
            }
          />
          <Route
            path="/page/:id"
            element={
              <Protected>
                <PageView />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/focus" replace />} />
        </Routes>
        <InstallPrompt />
      </div>
    </AuthProvider>
  );
}
