import type { BatchDownloadItem } from "./types";

export const BATCH_DOWNLOAD_INTERVAL_MS = 250;

export async function triggerBrowserDownloads(
  downloads: BatchDownloadItem[],
  intervalMs = BATCH_DOWNLOAD_INTERVAL_MS,
  documentRef: Document = document
): Promise<void> {
  for (const [index, download] of downloads.entries()) {
    if (index > 0 && intervalMs > 0) {
      await delay(intervalMs);
    }

    const link = documentRef.createElement("a");
    link.href = download.url;
    link.download = fileNameFromKey(download.key);
    link.hidden = true;
    documentRef.body.append(link);
    link.click();
    link.remove();
  }
}

function fileNameFromKey(key: string): string {
  return key.split("/").filter(Boolean).pop() ?? "download";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
