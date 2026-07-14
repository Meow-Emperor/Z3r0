import { useNavigate } from "react-router-dom";
import { DEFAULT_ADMIN_PATH, LOGIN_PATH } from "../../app/routePaths";
import "../../app/styles/landing.css";
import z3r0Logo from "../../assets/z3r0-logo.png";
import { useAuth } from "../../shared/auth/AuthProvider";
import { LandingContent } from "./LandingContent";

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const consolePath = isAuthenticated ? DEFAULT_ADMIN_PATH : LOGIN_PATH;

  return <LandingContent logoSrc={z3r0Logo} primaryAction={{ label: "Open workbench", onSelect: () => navigate(consolePath) }} />;
}
