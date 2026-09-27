import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AuthView from './views/AuthView';
import { isDemo } from './lib/demoBoard';
// Everything but the front door loads when first opened, so the app opens fast.
const MyDayView = lazy(() => import('./views/MyDayView'));
const SnapView = lazy(() => import('./views/SnapView'));
const SnapStatusView = lazy(() => import('./views/SnapStatusView'));
const FocusView = lazy(() => import('./views/FocusView'));
const PageView = lazy(() => import('./views/PageView'));
const BoardsView = lazy(() => import('./views/BoardsView'));
const NotesView = lazy(() => import('./views/NotesView'));
const ProfileView = lazy(() => import('./views/ProfileView'));
const DoneView = lazy(() => import('./views/DoneView'));
const TrashView = lazy(() => import('./views/TrashView'));
const ProjectsView = lazy(() => import('./views/ProjectsView'));
const ArchiveView = lazy(() => import('./views/ArchiveView'));
import InstallPrompt from './pwa/InstallPrompt';
import Sidebar from './components/ui/Sidebar';
const CommandPalette = lazy(() => import('./components/cmd/CommandPalette'));

function Protected({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (isDemo()) return children; // development build only: the sample board
  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/auth" replace state={{ from: location }} />;
  return children;
}

function PublicOnly({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (session) return <Navigate to="/day" replace />;
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
        <Suspense fallback={<FullPageLoader />}>
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
            path="/day"
            element={
              <Protected>
                <MyDayView />
              </Protected>
            }
          />
          <Route
            path="/projects"
            element={
              <Protected>
                <ProjectsView />
              </Protected>
            }
          />
          <Route
            path="/archive"
            element={
              <Protected>
                <ArchiveView />
              </Protected>
            }
          />
          {/* the old journal "today" is retired: My Day is today now */}
          <Route path="/today" element={<Navigate to="/day" replace />} />
          <Route
            path="/snap"
            element={
              <Protected>
                <SnapView />
              </Protected>
            }
          />
          <Route
            path="/snap/:id"
            element={
              <Protected>
                <SnapStatusView />
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
          <Route path="*" element={<Navigate to="/day" replace />} />
        </Routes>
        </Suspense>
        </main>
        <InstallPrompt />
        <Suspense fallback={null}><CommandPalette /></Suspense>
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
