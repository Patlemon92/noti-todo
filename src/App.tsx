import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AuthView from './views/AuthView';
import TodayView from './views/TodayView';
import SnapView from './views/SnapView';
import FocusView from './views/FocusView';
import PageView from './views/PageView';
import BoardsView from './views/BoardsView';
import NotesView from './views/NotesView';
import ProfileView from './views/ProfileView';
import DoneView from './views/DoneView';
import TrashView from './views/TrashView';
import InstallPrompt from './pwa/InstallPrompt';
import Sidebar from './components/ui/Sidebar';
import CommandPalette from './components/cmd/CommandPalette';

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
  if (session) return <Navigate to="/today" replace />;
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
        <ShellChrome />
        <RouteBlur />
        <main className="md:ml-[64px]">
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
            path="/today"
            element={
              <Protected>
                <TodayView />
              </Protected>
            }
          />
          <Route
            path="/snap"
            element={
              <Protected>
                <SnapView />
              </Protected>
            }
          />
          {/* pre-pivot routes — hidden from the nav, kept reachable by URL */}
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
            path="/done"
            element={
              <Protected>
                <DoneView />
              </Protected>
            }
          />
          <Route
            path="/trash"
            element={
              <Protected>
                <TrashView />
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
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
        </main>
        <InstallPrompt />
        <CommandPalette />
      </div>
    </AuthProvider>
  );
}

/** Only renders the desktop sidebar when the user is signed in. */
function ShellChrome() {
  const { session } = useAuth();
  if (!session) return null;
  return <Sidebar />;
}

/**
 * Blurs any focused input / contenteditable on every route change.
 * Stops iOS Safari from keeping the on-screen keyboard up when you
 * tap the bottom nav while a previous view's editor was focused.
 */
function RouteBlur() {
  const location = useLocation();
  useEffect(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) {
      el.blur();
    }
  }, [location.pathname]);
  return null;
}
