import { adminRoutes } from "./routeManifest";

const routeLoaders = {
  landing: () => import("../features/landing/LandingPage"),
  login: () => import("../features/auth/LoginPage"),
  protectedAdminShell: () => import("./layouts/ProtectedAdminShell"),
} as const;

const adminRouteLoaders = new Map(adminRoutes.map((route) => [route.path, route.loader]));

const preloadedRoutes = new Set<string>();

export const loadLandingPage = routeLoaders.landing;
export const loadLoginPage = routeLoaders.login;
export const loadProtectedAdminShell = routeLoaders.protectedAdminShell;

export function preloadAdminRoute(path: string) {
  const loader = adminRouteLoaders.get(path);
  if (!loader || preloadedRoutes.has(path)) return;
  preloadedRoutes.add(path);
  void loader().catch(() => preloadedRoutes.delete(path));
}
