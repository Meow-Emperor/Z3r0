import { lazy, Suspense, type ComponentType } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useOutletContext } from "react-router-dom";
import { AuthProvider, useAuth } from "../shared/auth/AuthProvider";
import { SYSTEM_USER_ROLE } from "../shared/api/generated/constants";
import { adminRoutes } from "./routeManifest";
import { DEFAULT_ADMIN_PATH, LOGIN_PATH } from "./routePaths";
import {
  loadLandingPage,
  loadLoginPage,
  loadProtectedAdminShell,
} from "./routePreload";

function lazyRoute<TModule extends Record<TKey, ComponentType>, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  key: TKey,
) {
  return lazy(() => loader().then((module) => ({ default: module[key] })));
}

const LandingPage = lazyRoute(loadLandingPage, "LandingPage");
const LoginPage = lazyRoute(loadLoginPage, "LoginPage");
const ProtectedAdminShell = lazyRoute(loadProtectedAdminShell, "ProtectedAdminShell");

function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={LOGIN_PATH} replace state={{ from: location }} />;
  }
  return <Outlet />;
}

function AdminOnlyRoute() {
  const { user } = useAuth();
  const outletContext = useOutletContext();
  if (user?.role !== SYSTEM_USER_ROLE.ADMIN) {
    return <Navigate to={DEFAULT_ADMIN_PATH} replace />;
  }
  return <Outlet context={outletContext} />;
}

function PublicOnlyRoute() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to={DEFAULT_ADMIN_PATH} replace />;
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
              <Route path={LOGIN_PATH} element={<LoginPage />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route element={<ProtectedAdminShell />}>
                {adminRoutes.filter((route) => !route.adminOnly).map((route) => {
                  const Page = route.component;
                  return <Route key={route.path} path={route.path} element={<Page />} />;
                })}
                <Route element={<AdminOnlyRoute />}>
                  {adminRoutes.filter((route) => route.adminOnly).map((route) => {
                    const Page = route.component;
                    return <Route key={route.path} path={route.path} element={<Page />} />;
                  })}
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to={DEFAULT_ADMIN_PATH} replace />} />
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
