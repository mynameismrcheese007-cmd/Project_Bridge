import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { NavBar } from './components/NavBar';
import { PageTransition } from './motion';
import { RequireAuth } from './components/RequireAuth';
import { SkeletonList } from './components/ui/Skeleton';
import { Explore } from './pages/Explore';
import { ForgotPassword } from './pages/ForgotPassword';
import { Login } from './pages/Login';
import { MyProjects } from './pages/MyProjects';
import { NotFound } from './pages/NotFound';
import { Notifications } from './pages/Notifications';
import { ProjectPage } from './pages/ProjectPage';
import { ProjectPreview } from './pages/ProjectPreview';
import { Register } from './pages/Register';
import { Requests } from './pages/Requests';
import { ResetPassword } from './pages/ResetPassword';

// Pages most visitors never open are loaded when first visited, keeping the first load small.
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })));
const AdminArea = lazy(() => import('./pages/AdminArea').then((m) => ({ default: m.AdminArea })));
const Messages = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Messages })));
const Offers = lazy(() => import('./pages/Offers').then((m) => ({ default: m.Offers })));
const ProjectEditor = lazy(() => import('./pages/ProjectEditor').then((m) => ({ default: m.ProjectEditor })));
const ProjectManage = lazy(() => import('./pages/ProjectManage').then((m) => ({ default: m.ProjectManage })));


export function App() {
  return (
    <>
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <NavBar />
      <div id="content">
        <PageTransition>
        <Suspense
          fallback={
            <main className="page page-narrow">
              <SkeletonList rows={3} label="Loading page…" />
            </main>
          }
        >
        <Routes>
          <Route path="/" element={<Explore />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <Account />
              </RequireAuth>
            }
          />
          <Route
            path="/notifications"
            element={
              <RequireAuth>
                <Notifications />
              </RequireAuth>
            }
          />
          {['/messages', '/messages/:id'].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                <RequireAuth>
                  <Messages />
                </RequireAuth>
              }
            />
          ))}
          <Route
            path="/offers"
            element={
              <RequireAuth>
                <Offers />
              </RequireAuth>
            }
          />
          <Route
            path="/requests"
            element={
              <RequireAuth>
                <Requests />
              </RequireAuth>
            }
          />
          <Route
            path="/my-projects"
            element={
              <RequireAuth>
                <MyProjects />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/new"
            element={
              <RequireAuth>
                <ProjectEditor />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:id/edit"
            element={
              <RequireAuth>
                <ProjectEditor />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:id/preview"
            element={
              <RequireAuth>
                <ProjectPreview />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:id/manage"
            element={
              <RequireAuth>
                <ProjectManage />
              </RequireAuth>
            }
          />
          <Route path="/projects/:id" element={<ProjectPage />} />
          {/* Not guarded in the UI on purpose: the server decides (see AdminArea). */}
          <Route path="/admin" element={<AdminArea />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </PageTransition>
      </div>
    </>
  );
}
