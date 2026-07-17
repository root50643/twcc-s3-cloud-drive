import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Download,
  File,
  Folder,
  LogOut,
  RefreshCw,
  Search,
  X
} from "lucide-react";
import { createBatchDownloadUrls, createDownloadUrl, listObjects, logout } from "./api";
import { triggerBrowserDownloads } from "./downloads";
import {
  buildBreadcrumb,
  folderNameFromPrefix,
  formatBytes,
  formatDate,
  sortByLastModifiedDesc
} from "./format";
import type { FileItem, FolderItem, ObjectListResponse, User } from "./types";

interface DriveViewProps {
  user: User;
  onLogout(): void;
}

export const MAX_BATCH_DOWNLOAD_FILES = 20;

export function DriveView({ user, onLogout }: DriveViewProps) {
  const [prefix, setPrefix] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ObjectListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [batchDownloading, setBatchDownloading] = useState(false);

  const crumbs = useMemo(() => buildBreadcrumb(prefix), [prefix]);

  const loadCurrentFolder = useCallback(
    async (nextToken?: string) => {
      setError("");
      if (nextToken) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await listObjects(prefix, nextToken);
        setData((current) => {
          if (!nextToken || !current) {
            return result;
          }
          return {
            ...result,
            folders: [...current.folders, ...result.folders],
            files: [...current.files, ...result.files]
          };
        });
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load files.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [prefix]
  );

  useEffect(() => {
    setData(null);
    setQuery("");
    setSelectedKeys(new Set());
    setStatus("");
    void loadCurrentFolder();
  }, [loadCurrentFolder]);

  const filteredFolders = useMemo(
    () => filterByName(data?.folders ?? [], query),
    [data?.folders, query]
  );
  const filteredFiles = useMemo(
    () => sortByLastModifiedDesc(filterByName(data?.files ?? [], query)),
    [data?.files, query]
  );
  const displayedKeys = useMemo(() => filteredFiles.map((file) => file.key), [filteredFiles]);
  const selectedDisplayedCount = useMemo(
    () => displayedKeys.filter((key) => selectedKeys.has(key)).length,
    [displayedKeys, selectedKeys]
  );
  const allDisplayedSelected =
    displayedKeys.length > 0 && selectedDisplayedCount === displayedKeys.length;

  async function handleLogout() {
    await logout();
    onLogout();
  }

  async function handleDownload(file: FileItem) {
    setDownloadingKey(file.key);
    setError("");
    try {
      const url = await createDownloadUrl(file.key);
      window.location.assign(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to download file.");
    } finally {
      setDownloadingKey(null);
    }
  }

  function toggleFileSelection(key: string) {
    setStatus("");
    setError("");
    if (selectedKeys.has(key)) {
      setSelectedKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      return;
    }

    if (selectedKeys.size >= MAX_BATCH_DOWNLOAD_FILES) {
      setError(`一次最多可下載 ${MAX_BATCH_DOWNLOAD_FILES} 個檔案。`);
      return;
    }

    setSelectedKeys((current) => new Set(current).add(key));
  }

  function toggleDisplayedFiles() {
    setStatus("");
    if (
      allDisplayedSelected ||
      (selectedKeys.size >= MAX_BATCH_DOWNLOAD_FILES && selectedDisplayedCount > 0)
    ) {
      setSelectedKeys((current) => {
        const next = new Set(current);
        displayedKeys.forEach((key) => next.delete(key));
        return next;
      });
      setError("");
      return;
    }

    const next = new Set(selectedKeys);
    for (const key of displayedKeys) {
      if (next.size >= MAX_BATCH_DOWNLOAD_FILES) {
        break;
      }
      next.add(key);
    }
    setSelectedKeys(next);
    setError(
      displayedKeys.some((key) => !next.has(key))
        ? `已選取前 ${MAX_BATCH_DOWNLOAD_FILES} 個檔案。`
        : ""
    );
  }

  function clearSelection() {
    setSelectedKeys(new Set());
    setError("");
    setStatus("");
  }

  function refreshCurrentFolder() {
    clearSelection();
    void loadCurrentFolder();
  }

  async function handleBatchDownload() {
    const selectedInDisplayOrder = sortByLastModifiedDesc(data?.files ?? [])
      .filter((file) => selectedKeys.has(file.key))
      .map((file) => file.key);
    if (selectedInDisplayOrder.length === 0) {
      return;
    }

    setBatchDownloading(true);
    setError("");
    setStatus("");
    try {
      const result = await createBatchDownloadUrls(selectedInDisplayOrder);
      await triggerBrowserDownloads(result.downloads);
      setSelectedKeys(new Set());
      setStatus(`已送出 ${result.downloads.length} 個檔案下載。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to download files.");
    } finally {
      setBatchDownloading(false);
    }
  }

  const parentPrefix = prefix.split("/").filter(Boolean).slice(0, -1).join("/");
  const normalizedParentPrefix = parentPrefix ? `${parentPrefix}/` : "";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">S3-compatible storage</p>
          <h1>TWCC S3 Cloud Drive</h1>
        </div>
        <div className="user-tools">
          <span>{user.username}</span>
          <button className="icon-button text-button" type="button" onClick={handleLogout}>
            <LogOut size={18} aria-hidden="true" />
            登出
          </button>
        </div>
      </header>

      <section className="drive-toolbar" aria-label="Folder controls">
        <div className="breadcrumb" aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => (
            <button
              key={crumb.prefix}
              type="button"
              onClick={() => setPrefix(crumb.prefix)}
              disabled={batchDownloading}
              className={index === crumbs.length - 1 ? "active-crumb" : ""}
              aria-current={index === crumbs.length - 1 ? "page" : undefined}
            >
              {crumb.label}
            </button>
          ))}
        </div>

        <div className="toolbar-actions">
          <div className="search-box">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="搜尋目前資料夾"
              placeholder="搜尋目前資料夾"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={refreshCurrentFolder}
            disabled={batchDownloading}
            title="重新整理"
            aria-label="重新整理"
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      {error ? <div className="status-error">{error}</div> : null}
      {status ? (
        <div className="status-success" role="status">
          {status}
        </div>
      ) : null}

      <section className="drive-surface" aria-label={folderNameFromPrefix(prefix)}>
        {prefix ? (
          <button
            className="up-row"
            type="button"
            onClick={() => setPrefix(normalizedParentPrefix)}
            disabled={batchDownloading}
          >
            <ChevronLeft size={18} aria-hidden="true" />
            上一層
          </button>
        ) : null}

        {selectedKeys.size > 0 ? (
          <div className="batch-toolbar" aria-label="批量下載工具">
            <span>已選取 {selectedKeys.size} 個檔案</span>
            <div className="batch-actions">
              <button
                className="icon-button"
                type="button"
                onClick={clearSelection}
                disabled={batchDownloading}
                title="清除選取"
                aria-label="清除選取"
              >
                <X size={18} aria-hidden="true" />
              </button>
              <button
                className="primary-action batch-download-button"
                type="button"
                onClick={() => void handleBatchDownload()}
                disabled={batchDownloading}
              >
                <Download size={18} aria-hidden="true" />
                {batchDownloading ? "準備下載中" : `下載所選 (${selectedKeys.size})`}
              </button>
            </div>
          </div>
        ) : null}

        <div className="file-table" role="table" aria-label="檔案列表">
          <div className="table-header" role="row">
            <span className="selection-cell" role="columnheader">
              <SelectAllCheckbox
                checked={allDisplayedSelected}
                indeterminate={selectedDisplayedCount > 0 && !allDisplayedSelected}
                disabled={loading || batchDownloading || displayedKeys.length === 0}
                onChange={toggleDisplayedFiles}
              />
            </span>
            <span className="name-cell" role="columnheader">名稱</span>
            <span className="size-cell" role="columnheader">大小</span>
            <span className="modified-cell" role="columnheader">修改時間</span>
            <span className="action-cell" role="columnheader">操作</span>
          </div>

          {loading ? <div className="empty-state">載入檔案中</div> : null}

          {!loading && filteredFolders.length === 0 && filteredFiles.length === 0 ? (
            <div className="empty-state">{query ? "找不到符合的項目" : "這個資料夾目前沒有檔案"}</div>
          ) : null}

          {!loading
            ? filteredFolders.map((folder) => (
                <FolderRow
                  key={folder.prefix}
                  folder={folder}
                  disabled={batchDownloading}
                  onOpen={() => setPrefix(folder.prefix)}
                />
              ))
            : null}

          {!loading
            ? filteredFiles.map((file) => (
                <FileRow
                  key={file.key}
                  file={file}
                  busy={downloadingKey === file.key}
                  batchBusy={batchDownloading}
                  selected={selectedKeys.has(file.key)}
                  onToggle={() => toggleFileSelection(file.key)}
                  onDownload={() => void handleDownload(file)}
                />
              ))
            : null}
        </div>

        {data?.nextContinuationToken ? (
          <button
            className="load-more"
            type="button"
            disabled={loadingMore}
            onClick={() => void loadCurrentFolder(data.nextContinuationToken ?? undefined)}
          >
            {loadingMore ? "載入中" : "載入更多"}
          </button>
        ) : null}
      </section>
    </main>
  );
}

function FolderRow({
  folder,
  disabled,
  onOpen
}: {
  folder: FolderItem;
  disabled: boolean;
  onOpen(): void;
}) {
  return (
    <button
      className="table-row folder-row"
      type="button"
      onClick={onOpen}
      disabled={disabled}
      role="row"
    >
      <span className="selection-cell" role="cell" aria-hidden="true" />
      <span className="name-cell" role="cell">
        <Folder size={20} aria-hidden="true" />
        {folder.name}
      </span>
      <span className="size-cell" role="cell">-</span>
      <span className="modified-cell" role="cell">-</span>
      <span className="action-cell" role="cell">開啟</span>
    </button>
  );
}

function FileRow({
  file,
  busy,
  batchBusy,
  selected,
  onToggle,
  onDownload
}: {
  file: FileItem;
  busy: boolean;
  batchBusy: boolean;
  selected: boolean;
  onToggle(): void;
  onDownload(): void;
}) {
  return (
    <div className="table-row" role="row">
      <span className="selection-cell" role="cell">
        <input
          type="checkbox"
          checked={selected}
          disabled={batchBusy}
          onChange={onToggle}
          aria-label={`選取 ${file.name}`}
        />
      </span>
      <span className="name-cell" role="cell">
        <File size={20} aria-hidden="true" />
        {file.name}
      </span>
      <span className="size-cell" role="cell">{formatBytes(file.size)}</span>
      <span className="modified-cell" role="cell">{formatDate(file.lastModified)}</span>
      <span className="action-cell" role="cell">
        <button
          className="icon-button"
          type="button"
          onClick={onDownload}
          disabled={busy}
          title="下載"
          aria-label={`下載 ${file.name}`}
        >
          <Download size={18} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange(): void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label="選取目前顯示的所有檔案"
    />
  );
}

function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }
  return items.filter((item) => item.name.toLowerCase().includes(needle));
}
