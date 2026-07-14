import {
  BookOpenText,
  Box,
  Boxes,
  FolderKanban,
  MessageSquareCode,
  Network,
  Server,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { DEFAULT_ADMIN_PATH } from "./routePaths";

type AdminRoute = {
  path: string;
  label: string;
  eyebrow: string;
  icon: LucideIcon;
  adminOnly: boolean;
  navigation: boolean;
  loader: () => Promise<unknown>;
  component: LazyExoticComponent<ComponentType>;
};

type RouteMetadata = Omit<AdminRoute, "component" | "loader">;

function defineRoute<TModule, TKey extends keyof TModule>(
  metadata: RouteMetadata,
  loader: () => Promise<TModule>,
  exportName: TKey,
): AdminRoute {
  return {
    ...metadata,
    loader,
    component: lazy(async () => ({
      default: (await loader())[exportName] as ComponentType,
    })),
  };
}

export const adminRoutes: readonly AdminRoute[] = [
  defineRoute(
    { path: DEFAULT_ADMIN_PATH, label: "Playground", eyebrow: "Agent Workbench", icon: MessageSquareCode, adminOnly: false, navigation: true },
    () => import("../features/playground/PlaygroundPage"),
    "PlaygroundPage",
  ),
  defineRoute(
    { path: "/work-projects", label: "Work Projects", eyebrow: "Project Operations", icon: FolderKanban, adminOnly: true, navigation: true },
    () => import("../features/work-projects/WorkProjectsPage"),
    "WorkProjectsPage",
  ),
  defineRoute(
    { path: "/work-projects/:projectId", label: "Work Projects", eyebrow: "Project Operations", icon: FolderKanban, adminOnly: true, navigation: false },
    () => import("../features/work-projects/WorkProjectWorkspacePage"),
    "WorkProjectWorkspacePage",
  ),
  defineRoute(
    { path: "/knowledges", label: "Knowledges", eyebrow: "Retrieval Context", icon: BookOpenText, adminOnly: true, navigation: true },
    () => import("../features/knowledges/KnowledgesPage"),
    "KnowledgesPage",
  ),
  defineRoute(
    { path: "/hosts", label: "Host Management", eyebrow: "Infrastructure Access", icon: Server, adminOnly: true, navigation: true },
    () => import("../features/hosts/HostsPage"),
    "HostsPage",
  ),
  defineRoute(
    { path: "/egress-proxies", label: "Egress Proxies", eyebrow: "Network Egress", icon: Network, adminOnly: true, navigation: true },
    () => import("../features/egress-proxies/EgressProxiesPage"),
    "EgressProxiesPage",
  ),
  defineRoute(
    { path: "/sandbox-images", label: "Sandbox Images", eyebrow: "Execution Baseline", icon: Boxes, adminOnly: true, navigation: true },
    () => import("../features/sandbox-images/SandboxImagesPage"),
    "SandboxImagesPage",
  ),
  defineRoute(
    { path: "/sandbox-containers", label: "Sandbox Containers", eyebrow: "Runtime Instances", icon: Box, adminOnly: true, navigation: true },
    () => import("../features/sandbox-containers/SandboxContainersPage"),
    "SandboxContainersPage",
  ),
  defineRoute(
    { path: "/system-users", label: "System Users", eyebrow: "Access Control", icon: Users, adminOnly: true, navigation: true },
    () => import("../features/system-users/SystemUsersPage"),
    "SystemUsersPage",
  ),
  defineRoute(
    { path: "/system-config", label: "System Config", eyebrow: "Runtime Configuration", icon: Settings, adminOnly: true, navigation: true },
    () => import("../features/system-config/SystemConfigPage"),
    "SystemConfigPage",
  ),
];

export const adminNavigationRoutes = adminRoutes.filter((route) => route.navigation);
