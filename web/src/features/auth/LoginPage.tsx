import { Button, Input } from "@douyinfe/semi-ui";
import { Crosshair, KeyRound, Mail } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DEFAULT_ADMIN_PATH } from "../../app/routePaths";
import { login } from "../../shared/api/systemUsers";
import { showApiError } from "../../shared/api/feedback";
import { useAuth } from "../../shared/auth/AuthProvider";
import { FormField } from "../../shared/components/FormField";
import z3r0Logo from "../../assets/z3r0-logo.png";
import "../../app/styles/login.css";

type LoginLocationState = {
  from?: { pathname?: string };
};

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LoginLocationState | null)?.from?.pathname || DEFAULT_ADMIN_PATH;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const response = await login({ email, password });
      if (response.data?.token) {
        signIn(response.data.token);
        navigate(from, { replace: true });
      }
    } catch (error) {
      showApiError(error);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-grid" aria-hidden="true" />
      <div className="login-scanline" aria-hidden="true" />
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <img className="brand-logo large" src={z3r0Logo} alt="" />
          <div>
            <span className="login-kicker">Red Team Collaboration Platform</span>
            <h1 id="login-title">Z3r0 Console</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <FormField label="Email">
            <Input
              size="large"
              type="email"
              prefix={<Mail size={16} />}
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="<your email>"
              required
            />
          </FormField>
          <FormField label="Password">
            <Input
              size="large"
              mode="password"
              prefix={<KeyRound size={16} />}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              placeholder="<your password>"
              required
            />
          </FormField>
          <Button
            htmlType="submit"
            theme="solid"
            type="primary"
            size="large"
            block
            loading={submitting}
            icon={<Crosshair size={17} />}
          >
            Sign in
          </Button>
        </form>
      </section>
    </main>
  );
}
