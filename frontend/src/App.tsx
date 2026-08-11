import { useEffect, useState } from "react";
import {
  Activity,
  Download,
  Files,
  KeyRound,
  LogOut,
  ShieldCheck,
  Users
} from "lucide-react";
import { clearApiSessionState, getCurrentUser, logout, subscribeSessionEnded } from "./api";
import { AdminUsersView } from "./AdminUsersView";
import { AuditView } from "./AuditView";
import { ChangePasswordView } from "./ChangePasswordView";
import { DriveView } from "./DriveView";
import { LoginForm } from "./LoginForm";
import type { User } from "./types";

type WorkspaceView = "files" | "users" | "logins" | "downloads" | "admin-actions" | "password";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeSessionEnded(() => {
      if (!cancelled) setUser(null);
    });
    getCurrentUser()
      .then((currentUser) => { if (!cancelled) setUser(currentUser); })
      .finally(() => { if (!cancelled) setInitializing(false); });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (initializing) return <div className="boot-screen">載入中</div>;
  if (!user) return <LoginForm onLogin={setUser} />;
  return <AuthenticatedWorkspace user={user} onSessionEnded={() => {
    clearApiSessionState();
    setUser(null);
  }} />;
}

function AuthenticatedWorkspace({ user, onSessionEnded }: { user: User; onSessionEnded(): void }) {
  const [view, setView] = useState<WorkspaceView>("files");
  const [logoutError, setLogoutError] = useState("");

  const tabs: Array<{ id: WorkspaceView; label: string; icon: typeof Files; admin?: boolean }> = [
    { id: "files", label: "檔案", icon: Files },
    { id: "users", label: "帳號管理", icon: Users, admin: true },
    { id: "logins", label: "登入紀錄", icon: Activity, admin: true },
    { id: "downloads", label: "下載紀錄", icon: Download, admin: true },
    { id: "admin-actions", label: "管理操作", icon: ShieldCheck, admin: true },
    { id: "password", label: "更換密碼", icon: KeyRound }
  ];

  async function handleLogout() {
    setLogoutError("");
    try {
      await logout();
      onSessionEnded();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">S3-compatible storage</p>
          <h1>TWCC S3 Cloud Drive</h1>
        </div>
        <div className="user-tools">
          <span className="role-badge">{user.role === "admin" ? "管理員" : "使用者"}</span>
          <span>{user.username}</span>
          <button className="icon-button text-button" type="button" onClick={() => void handleLogout()}>
            <LogOut size={18} aria-hidden="true" />登出
          </button>
        </div>
      </header>
      <nav className="workspace-tabs" aria-label="主要功能">
        {tabs.filter((tab) => !tab.admin || user.role === "admin").map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" className={view === tab.id ? "active" : ""} onClick={() => setView(tab.id)}>
              <Icon size={17} aria-hidden="true" />{tab.label}
            </button>
          );
        })}
      </nav>
      {logoutError ? <div className="status-error">{logoutError}</div> : null}
      {view === "files" ? <DriveView /> : null}
      {view === "password" ? <ChangePasswordView onSessionEnded={onSessionEnded} /> : null}
      {view === "users" && user.role === "admin" ? <AdminUsersView currentUser={user} onSessionEnded={onSessionEnded} /> : null}
      {view === "logins" && user.role === "admin" ? <AuditView kind="logins" title="登入紀錄" /> : null}
      {view === "downloads" && user.role === "admin" ? <AuditView kind="downloads" title="下載紀錄" /> : null}
      {view === "admin-actions" && user.role === "admin" ? <AuditView kind="admin-actions" title="管理操作紀錄" /> : null}
    </main>
  );
}
