import { Avatar, Button } from "@douyinfe/semi-ui";
import { Box, Boxes, FolderKanban, LogOut, MessageSquareCode, Network, Server, Settings, Users } from "lucide-react";
import { ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { SessionList } from "../../features/playground/SessionList";
import { useAgentSessionContext } from "../../features/playground/AgentSessionProvider";
import { useAuth } from "../../shared/auth/AuthProvider";
import { cx } from "../../shared/lib/className";
import z3r0Logo from "../../assets/z3r0-logo.png";
import { preloadAdminRoute, preloadAdminRoutes } from "../routePreload";

type AdminLayoutContext = {
  setHeaderActions: (actions: ReactNode) => void;
  refreshWorkProjects: () => void;
};

export function useAdminHeaderActions() {
  return useOutletContext<AdminLayoutContext>().setHeaderActions;
}

export function useRefreshWorkProjects() {
  return useOutletContext<AdminLayoutContext>().refreshWorkProjects;
}

const navItems = [
  { path: "/playground", label: "Playground", eyebrow: "Agent Workbench", icon: MessageSquareCode },
  { path: "/work-projects", label: "Work Projects", eyebrow: "Project Operations", icon: FolderKanban, adminOnly: true },
  { path: "/hosts", label: "Host Management", eyebrow: "Infrastructure Access", icon: Server, adminOnly: true },
  { path: "/egress-proxies", label: "Egress Proxies", eyebrow: "Network Egress", icon: Network, adminOnly: true },
  { path: "/sandbox-images", label: "Sandbox Images", eyebrow: "Execution Baseline", icon: Boxes, adminOnly: true },
  { path: "/sandbox-containers", label: "Sandbox Containers", eyebrow: "Runtime Instances", icon: Box, adminOnly: true },
  { path: "/system-users", label: "System Users", eyebrow: "Access Control", icon: Users, adminOnly: true },
  { path: "/system-config", label: "System Config", eyebrow: "Runtime Configuration", icon: Settings, adminOnly: true },
];

export function AdminLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [headerActions, setHeaderActionsState] = useState<ReactNode>(null);
  const [projectListVersion, setProjectListVersion] = useState(0);
  const {
    sessions,
    sessionsLoading,
    activeSessionId,
    selectSession,
    deleteSession,
    refreshSessions,
    dropSessionRuntime,
    syncSessionSummaries,
  } = useAgentSessionContext();

  const setHeaderActions = useCallback((actions: ReactNode) => {
    setHeaderActionsState((current) => (Object.is(current, actions) ? current : actions));
  }, []);

  useEffect(() => {
    const id = window.setTimeout(preloadAdminRoutes, 300);
    return () => window.clearTimeout(id);
  }, []);

  const refreshWorkProjects = useCallback(() => {
    setProjectListVersion((version) => version + 1);
  }, []);

  const handleSelectAgentSession = useCallback((sessionId: string) => {
    selectSession(sessionId);
    if (!location.pathname.startsWith("/playground")) {
      navigate("/playground");
    }
  }, [location.pathname, navigate, selectSession]);

  const outletContext = useMemo<AdminLayoutContext>(
    () => ({ setHeaderActions, refreshWorkProjects }),
    [refreshWorkProjects, setHeaderActions],
  );

  const handleSignOut = () => {
    signOut();
    navigate("/login", { replace: true });
  };

  const isAdmin = user?.role === "admin";
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const activeItem = visibleNavItems.find((item) => location.pathname.startsWith(item.path));
  const contentMode = location.pathname.startsWith("/playground") ? "fixed" : "scroll";

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand-lockup">
          <img className="brand-logo" src={z3r0Logo} alt="" />
          <div>
            <div className="brand-name">Z3r0</div>
            <div className="brand-kicker">Red Team Collaboration Platform</div>
          </div>
        </div>

        <div className="admin-sidebar-body">
          <div className="admin-sidebar-top">
            <NavLink
              to="/playground"
              className="admin-nav-link"
              onFocus={() => preloadAdminRoute("/playground")}
              onPointerDown={() => preloadAdminRoute("/playground")}
              onPointerEnter={() => preloadAdminRoute("/playground")}
            >
              <MessageSquareCode size={18} />
              <span>Playground</span>
            </NavLink>
            <div className="admin-sidebar-secondary">
              <SessionList
                sessions={sessions}
                loading={sessionsLoading}
                activeSessionId={activeSessionId}
                projectListVersion={projectListVersion}
                onSelect={handleSelectAgentSession}
                onDelete={deleteSession}
                onRefreshSessions={refreshSessions}
                onDropRuntime={dropSessionRuntime}
                onSyncSessionSummaries={syncSessionSummaries}
              />
            </div>
          </div>

          <nav className="admin-nav admin-nav-bottom" aria-label="Primary navigation">
            {visibleNavItems.slice(1).map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="admin-nav-link"
                  onFocus={() => preloadAdminRoute(item.path)}
                  onPointerDown={() => preloadAdminRoute(item.path)}
                  onPointerEnter={() => preloadAdminRoute(item.path)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <div className="page-eyebrow">{activeItem?.eyebrow || "Operations"}</div>
            <h1>{activeItem?.label || "Console"}</h1>
          </div>
          <div className="topbar-actions">
            {headerActions ? <div className="topbar-resource-actions">{headerActions}</div> : null}
            <div className="topbar-session-actions">
              <Avatar size="small" color="red">{user?.username?.[0]?.toUpperCase() || "U"}</Avatar>
              <Button icon={<LogOut size={16} />} theme="borderless" type="tertiary" onClick={handleSignOut} aria-label="Sign out" />
            </div>
          </div>
        </header>
        <main className="admin-content">
          <div className={cx("admin-content-viewport", `admin-content-viewport-${contentMode}`)}>
            <div className={cx("admin-route", `admin-route-${contentMode}`)}>
              <Suspense fallback={<AdminRouteFallback />}>
                <Outlet context={outletContext} />
              </Suspense>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function AdminRouteFallback() {
  return (
    <div className="admin-route-fallback">
      <div className="route-fallback-spinner" />
    </div>
  );
}
