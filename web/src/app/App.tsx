import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useOutletContext } from "react-router-dom";
import { AuthProvider, useAuth } from "../shared/auth/AuthProvider";
import {
  loadLandingPage,
  loadHostsPage,
  loadLoginPage,
  loadPlaygroundPage,
  loadProtectedAdminShell,
  loadSandboxContainersPage,
  loadSandboxImagesPage,
  loadSystemConfigPage,
  loadSystemUsersPage,
  loadWorkProjectWorkspacePage,
  loadWorkProjectsPage,
} from "./routePreload";

const LandingPage = lazy(() => loadLandingPage().then((module) => ({ default: module.LandingPage })));
const LoginPage = lazy(() => loadLoginPage().then((module) => ({ default: module.LoginPage })));
const ProtectedAdminShell = lazy(() => loadProtectedAdminShell().then((module) => ({ default: module.ProtectedAdminShell })));
const HostsPage = lazy(() => loadHostsPage().then((module) => ({ default: module.HostsPage })));
const PlaygroundPage = lazy(() => loadPlaygroundPage().then((module) => ({ default: module.PlaygroundPage })));
const WorkProjectWorkspacePage = lazy(() => loadWorkProjectWorkspacePage().then((module) => ({ default: module.WorkProjectWorkspacePage })));
const SandboxContainersPage = lazy(() => loadSandboxContainersPage().then((module) => ({ default: module.SandboxContainersPage })));
const SandboxImagesPage = lazy(() => loadSandboxImagesPage().then((module) => ({ default: module.SandboxImagesPage })));
const SystemUsersPage = lazy(() => loadSystemUsersPage().then((module) => ({ default: module.SystemUsersPage })));
const SystemConfigPage = lazy(() => loadSystemConfigPage().then((module) => ({ default: module.SystemConfigPage })));
const WorkProjectsPage = lazy(() => loadWorkProjectsPage().then((module) => ({ default: module.WorkProjectsPage })));

function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

function AdminOnlyRoute() {
  const { user } = useAuth();
  const outletContext = useOutletContext();
  if (user?.role !== "admin") {
    return <Navigate to="/playground" replace />;
  }
  return <Outlet context={outletContext} />;
}

function PublicOnlyRoute() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/playground" replace />;
  }
  return <Outlet />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route element={<ProtectedAdminShell />}>
                <Route path="/playground" element={<PlaygroundPage />} />
                <Route element={<AdminOnlyRoute />}>
                  <Route path="/hosts" element={<HostsPage />} />
                  <Route path="/work-projects" element={<WorkProjectsPage />} />
                  <Route path="/work-projects/:projectId" element={<WorkProjectWorkspacePage />} />
                  <Route path="/sandbox-images" element={<SandboxImagesPage />} />
                  <Route path="/sandbox-containers" element={<SandboxContainersPage />} />
                  <Route path="/system-users" element={<SystemUsersPage />} />
                  <Route path="/system-config" element={<SystemConfigPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/playground" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

function RouteFallback() {
  return (
    <div className="route-fallback">
      <div className="route-fallback-spinner" />
    </div>
  );
}
