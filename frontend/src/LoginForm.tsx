import { FormEvent, useState } from "react";
import { Cloud, LockKeyhole, LogIn, UserRound } from "lucide-react";
import { login } from "./api";
import type { User } from "./types";

interface LoginFormProps {
  onLogin(user: User): void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const user = await login(username.trim(), password);
      onLogin(user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">
          <Cloud size={28} />
        </div>
        <h1 id="login-title">TWCC S3 Cloud Drive</h1>
        <p>請登入後瀏覽與下載檔案。</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>帳號</span>
            <div className="input-row">
              <UserRound size={18} aria-hidden="true" />
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
          </label>

          <label>
            <span>密碼</span>
            <div className="input-row">
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button className="primary-action" type="submit" disabled={busy}>
            <LogIn size={18} aria-hidden="true" />
            {busy ? "登入中" : "登入"}
          </button>
        </form>
      </section>
    </main>
  );
}
