import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearApiSessionState } from "./api";
import { App } from "./App";

const fetchMock = vi.fn();
const csrfResponse = () => new Response(JSON.stringify({ csrfToken: "csrf-test" }), { status: 200 });

beforeEach(() => {
  clearApiSessionState();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("App", () => {
  it("shows login when the session is unauthenticated", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 401 }));
    render(<App />);
    expect(await screen.findByRole("heading", { name: "TWCC S3 Cloud Drive" })).toBeInTheDocument();
    expect(screen.getByLabelText("帳號")).toBeInTheDocument();
  });

  it("loads the admin workspace after login", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { id: 1, username: "alice", role: "admin", s3Prefix: "uploads/" },
        csrfToken: "csrf-authenticated"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        prefix: "",
        folders: [{ name: "reports", prefix: "reports/" }],
        files: [],
        nextContinuationToken: null
      }), { status: 200 }));

    render(<App />);
    fireEvent.change(await screen.findByLabelText("帳號"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("密碼"), { target: { value: "password-one" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() => expect(screen.getByText("reports")).toBeInTheDocument());
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /帳號管理/ })).toBeInTheDocument();
    const loginRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(new Headers(loginRequest.headers).get("X-CSRF-Token")).toBe("csrf-test");
  });

  it("returns to login when an authenticated request reports an expired session", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { id: 1, username: "alice", role: "admin", s3Prefix: "uploads/" },
        csrfToken: "csrf-authenticated"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: "SESSION_EXPIRED", message: "Your session has expired." }
      }), { status: 401 }));

    render(<App />);
    fireEvent.change(await screen.findByLabelText("帳號"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("密碼"), { target: { value: "password-one" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    expect(await screen.findByRole("button", { name: "登入" })).toBeInTheDocument();
    expect(screen.queryByText("alice")).not.toBeInTheDocument();
  });
});
