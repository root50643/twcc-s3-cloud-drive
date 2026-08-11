import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearApiSessionState } from "./api";
import { AdminUsersView } from "./AdminUsersView";
import { AuditView } from "./AuditView";
import { ChangePasswordView } from "./ChangePasswordView";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => { clearApiSessionState(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); fetchMock.mockReset(); });

describe("management views", () => {
  it("shows account roles and protects the only administrator delete action", async () => {
    fetchMock.mockResolvedValueOnce(json({ users: [{ id: 1, username: "alice", role: "admin", s3Prefix: "", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }] }));
    render(<AdminUsersView currentUser={{ id: 1, username: "alice", role: "admin", s3Prefix: "" }} onSessionEnded={vi.fn()} />);
    expect(await screen.findByText("整個 bucket")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刪除 alice" })).toBeDisabled();
  });

  it("changes the current password with CSRF and ends the session", async () => {
    const ended = vi.fn();
    fetchMock.mockResolvedValueOnce(json({ csrfToken: "csrf-test" })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(<ChangePasswordView onSessionEnded={ended} />);
    fireEvent.change(screen.getByLabelText("目前密碼"), { target: { value: "old" } });
    fireEvent.change(screen.getByLabelText("新密碼"), { target: { value: "new value" } });
    fireEvent.change(screen.getByLabelText("確認新密碼"), { target: { value: "new value" } });
    fireEvent.click(screen.getByRole("button", { name: "更新密碼" }));
    await waitFor(() => expect(ended).toHaveBeenCalled());
    expect(new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).get("X-CSRF-Token")).toBe("csrf-test");
  });

  it("renders login audit rows newest first", async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [
      { id: 2, username: "bob", success: false, outcome: "failure", ipAddress: "203.0.113.2", createdAt: "2026-08-02T00:00:00.000Z" },
      { id: 1, username: "alice", success: true, outcome: "success", ipAddress: "203.0.113.1", createdAt: "2026-08-01T00:00:00.000Z" }
    ], nextCursor: null }));
    render(<AuditView kind="logins" title="登入紀錄" />);
    await screen.findByText("bob");
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("bob");
    expect(rows[2]).toHaveTextContent("alice");
  });
});
