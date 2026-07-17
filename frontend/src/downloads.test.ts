import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerBrowserDownloads } from "./downloads";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("triggerBrowserDownloads", () => {
  it("clicks each download link in order and removes temporary elements", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await triggerBrowserDownloads(
      [
        { key: "reports/new.pdf", url: "https://storage.example.test/new" },
        { key: "old.txt", url: "https://storage.example.test/old" }
      ],
      0
    );

    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect((clickSpy.mock.contexts[0] as HTMLAnchorElement).href).toBe(
      "https://storage.example.test/new"
    );
    expect((clickSpy.mock.contexts[0] as HTMLAnchorElement).download).toBe("new.pdf");
    expect((clickSpy.mock.contexts[1] as HTMLAnchorElement).download).toBe("old.txt");
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });
});
