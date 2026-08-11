import { type FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { changePassword } from "./api";

export function ChangePasswordView({ onSessionEnded }: { onSessionEnded(): void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation) {
      setError("兩次輸入的新密碼不一致。");
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      onSessionEnded();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="management-view narrow-view" aria-labelledby="change-password-title">
      <div className="section-heading">
        <div><h2 id="change-password-title">更換密碼</h2><p>更新後所有裝置都需要重新登入。</p></div>
      </div>
      <form className="management-form" onSubmit={submit}>
        <label>目前密碼<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
        <label>新密碼<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
        <label>確認新密碼<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="form-actions">
          <button className="primary-action text-button" type="submit" disabled={busy}>
            <KeyRound size={18} aria-hidden="true" />{busy ? "更新中" : "更新密碼"}
          </button>
        </div>
      </form>
    </section>
  );
}
