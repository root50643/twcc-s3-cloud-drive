import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fetchMock = vi.fn();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("App", () => {
  it("shows login when the session is unauthenticated", async () => {
    vi.stubGlobal(
      "fetch",
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 401 }))
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "TWCC S3 Cloud Drive" })).toBeInTheDocument();
    expect(screen.getByLabelText("帳號")).toBeInTheDocument();
  });

  it("loads the file browser after login", async () => {
    vi.stubGlobal(
      "fetch",
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 401 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ user: { username: "alice" } }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              prefix: "",
              folders: [{ name: "reports", prefix: "reports/" }],
              files: [],
              nextContinuationToken: null
            }),
            { status: 200 }
          )
        )
    );

    render(<App />);
    fireEvent.change(await screen.findByLabelText("帳號"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("密碼"), { target: { value: "password-one" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() => expect(screen.getByText("reports")).toBeInTheDocument());
    expect(screen.getByText("alice")).toBeInTheDocument();
  });
});
