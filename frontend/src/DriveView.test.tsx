import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerBrowserDownloads } from "./downloads";
import { DriveView } from "./DriveView";

vi.mock("./downloads", () => ({
  triggerBrowserDownloads: vi.fn()
}));

const fetchMock = vi.fn();
const triggerDownloadsMock = vi.mocked(triggerBrowserDownloads);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function file(key: string, lastModified = "2026-07-14T00:00:00.000Z") {
  return { key, name: key.split("/").pop(), size: 42, lastModified };
}

function listResponse(
  files: ReturnType<typeof file>[],
  folders: Array<{ name: string; prefix: string }> = [],
  prefix = ""
) {
  return jsonResponse({ prefix, folders, files, nextContinuationToken: null });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  triggerDownloadsMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  triggerDownloadsMock.mockReset();
});

describe("DriveView batch downloads", () => {
  it("requests selected files in displayed modification-time order", async () => {
    fetchMock
      .mockResolvedValueOnce(
        listResponse([
          file("old.txt", "2026-01-01T00:00:00.000Z"),
          file("new.txt", "2026-07-14T00:00:00.000Z")
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse({
          downloads: [
            { key: "new.txt", url: "https://storage.example.test/new" },
            { key: "old.txt", url: "https://storage.example.test/old" }
          ],
          expiresInSeconds: 300
        })
      );

    render(<DriveView user={{ username: "alice" }} onLogout={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText("選取 old.txt"));
    fireEvent.click(screen.getByLabelText("選取 new.txt"));
    fireEvent.click(screen.getByRole("button", { name: "下載所選 (2)" }));

    await waitFor(() => expect(triggerDownloadsMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      keys: ["new.txt", "old.txt"]
    });
    expect(triggerDownloadsMock).toHaveBeenCalledWith([
      { key: "new.txt", url: "https://storage.example.test/new" },
      { key: "old.txt", url: "https://storage.example.test/old" }
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("已送出 2 個檔案下載");
    expect(screen.queryByRole("button", { name: "下載所選 (2)" })).not.toBeInTheDocument();
  });

  it("selects only loaded files matching the current search", async () => {
    fetchMock.mockResolvedValueOnce(
      listResponse([file("report.pdf"), file("photo.png"), file("notes.pdf")])
    );

    render(<DriveView user={{ username: "alice" }} onLogout={vi.fn()} />);
    await screen.findByText("report.pdf");
    fireEvent.change(screen.getByLabelText("搜尋目前資料夾"), { target: { value: ".pdf" } });
    fireEvent.click(screen.getByLabelText("選取目前顯示的所有檔案"));

    expect(screen.getByLabelText("選取 report.pdf")).toBeChecked();
    expect(screen.getByLabelText("選取 notes.pdf")).toBeChecked();
    expect(screen.queryByLabelText("選取 photo.png")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下載所選 (2)" })).toBeInTheDocument();
  });

  it("caps select-all at twenty files", async () => {
    fetchMock.mockResolvedValueOnce(
      listResponse(Array.from({ length: 22 }, (_, index) => file(`file-${index}.txt`)))
    );

    render(<DriveView user={{ username: "alice" }} onLogout={vi.fn()} />);
    await screen.findByText("file-0.txt");
    fireEvent.click(screen.getByLabelText("選取目前顯示的所有檔案"));

    const selectedFileCheckboxes = screen
      .getAllByRole("checkbox")
      .filter((checkbox) => checkbox.getAttribute("aria-label")?.startsWith("選取 file-"))
      .filter((checkbox) => (checkbox as HTMLInputElement).checked);
    expect(selectedFileCheckboxes).toHaveLength(20);
    expect(screen.getByText("已選取前 20 個檔案。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下載所選 (20)" })).toBeInTheDocument();
  });

  it("keeps the selection when the batch API fails", async () => {
    fetchMock
      .mockResolvedValueOnce(listResponse([file("retry.txt")]))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "S3_DOWNLOAD_URL_FAILED", message: "Unable to create download URLs." } },
          502
        )
      );

    render(<DriveView user={{ username: "alice" }} onLogout={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText("選取 retry.txt"));
    fireEvent.click(screen.getByRole("button", { name: "下載所選 (1)" }));

    expect(await screen.findByText("Unable to create download URLs.")).toBeInTheDocument();
    expect(screen.getByLabelText("選取 retry.txt")).toBeChecked();
    expect(screen.getByRole("button", { name: "下載所選 (1)" })).toBeInTheDocument();
  });

  it("clears selection on refresh and folder navigation and never selects folders", async () => {
    const rootFiles = [file("root.txt")];
    const folders = [{ name: "reports", prefix: "reports/" }];
    fetchMock
      .mockResolvedValueOnce(listResponse(rootFiles, folders))
      .mockResolvedValueOnce(listResponse(rootFiles, folders))
      .mockResolvedValueOnce(listResponse([], [], "reports/"));

    render(<DriveView user={{ username: "alice" }} onLogout={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText("選取 root.txt"));
    expect(screen.queryByLabelText("選取 reports")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    expect(screen.queryByRole("button", { name: "下載所選 (1)" })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(await screen.findByLabelText("選取 root.txt"));
    fireEvent.click(screen.getByText("reports"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("button", { name: "下載所選 (1)" })).not.toBeInTheDocument();
  });
});
