import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Download,
  File,
  Folder,
  LogOut,
  RefreshCw,
  Search
} from "lucide-react";
import { createDownloadUrl, listObjects, logout } from "./api";
import { buildBreadcrumb, folderNameFromPrefix, formatBytes, formatDate } from "./format";
import type { FileItem, FolderItem, ObjectListResponse, User } from "./types";

interface DriveViewProps {
  user: User;
  onLogout(): void;
}

export function DriveView({ user, onLogout }: DriveViewProps) {
  const [prefix, setPrefix] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ObjectListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

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
    void loadCurrentFolder();
  }, [loadCurrentFolder]);

  const filteredFolders = useMemo(
    () => filterByName(data?.folders ?? [], query),
    [data?.folders, query]
  );
  const filteredFiles = useMemo(() => filterByName(data?.files ?? [], query), [data?.files, query]);

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
            onClick={() => void loadCurrentFolder()}
            title="重新整理"
            aria-label="重新整理"
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      {error ? <div className="status-error">{error}</div> : null}

      <section className="drive-surface" aria-label={folderNameFromPrefix(prefix)}>
        {prefix ? (
          <button className="up-row" type="button" onClick={() => setPrefix(normalizedParentPrefix)}>
            <ChevronLeft size={18} aria-hidden="true" />
            上一層
          </button>
        ) : null}

        <div className="file-table" role="table" aria-label="檔案列表">
          <div className="table-header" role="row">
            <span role="columnheader">名稱</span>
            <span role="columnheader">大小</span>
            <span role="columnheader">修改時間</span>
            <span role="columnheader">操作</span>
          </div>

          {loading ? <div className="empty-state">載入檔案中</div> : null}

          {!loading && filteredFolders.length === 0 && filteredFiles.length === 0 ? (
            <div className="empty-state">{query ? "找不到符合的項目" : "這個資料夾目前沒有檔案"}</div>
          ) : null}

          {!loading
            ? filteredFolders.map((folder) => (
                <FolderRow key={folder.prefix} folder={folder} onOpen={() => setPrefix(folder.prefix)} />
              ))
            : null}

          {!loading
            ? filteredFiles.map((file) => (
                <FileRow
                  key={file.key}
                  file={file}
                  busy={downloadingKey === file.key}
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

function FolderRow({ folder, onOpen }: { folder: FolderItem; onOpen(): void }) {
  return (
    <button className="table-row folder-row" type="button" onClick={onOpen} role="row">
      <span className="name-cell" role="cell">
        <Folder size={20} aria-hidden="true" />
        {folder.name}
      </span>
      <span role="cell">-</span>
      <span role="cell">-</span>
      <span role="cell">開啟</span>
    </button>
  );
}

function FileRow({
  file,
  busy,
  onDownload
}: {
  file: FileItem;
  busy: boolean;
  onDownload(): void;
}) {
  return (
    <div className="table-row" role="row">
      <span className="name-cell" role="cell">
        <File size={20} aria-hidden="true" />
        {file.name}
      </span>
      <span role="cell">{formatBytes(file.size)}</span>
      <span role="cell">{formatDate(file.lastModified)}</span>
      <span role="cell">
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

function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }
  return items.filter((item) => item.name.toLowerCase().includes(needle));
}
