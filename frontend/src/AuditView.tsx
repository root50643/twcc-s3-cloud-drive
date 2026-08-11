import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Filter, RefreshCw } from "lucide-react";
import { type AuditKind, listAudit } from "./api";
import type { AdminAuditItem, DownloadAuditItem, LoginAuditItem } from "./types";

type AuditRow = LoginAuditItem | DownloadAuditItem | AdminAuditItem;

export function AuditView({ kind, title }: { kind: AuditKind; title: string }) {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [activeUsername, setActiveUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (cursor?: string) => {
    setLoading(true); setError("");
    try {
      const page = await listAudit(kind, { cursor, username: activeUsername || undefined });
      setItems((current) => cursor ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to load audit records."); }
    finally { setLoading(false); }
  }, [activeUsername, kind]);

  useEffect(() => { setItems([]); void load(); }, [load]);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveUsername(username.trim());
  }

  const columns = kind === "logins"
    ? ["時間", "帳號", "結果", "IP"]
    : kind === "downloads"
      ? ["時間", "帳號", "下載檔案"]
      : ["時間", "管理員", "操作", "目標", "IP"];

  return (
    <section className="management-view" aria-labelledby="audit-title">
      <div className="section-heading audit-heading"><div><h2 id="audit-title">{title}</h2><p>最近的紀錄優先顯示</p></div>
        <form className="audit-filter" onSubmit={filter}><input aria-label="依帳號篩選" placeholder="依帳號篩選" value={username} onChange={(event) => setUsername(event.target.value)} /><button className="icon-button" type="submit" title="套用篩選" aria-label="套用篩選"><Filter size={17} /></button><button className="icon-button" type="button" onClick={() => void load()} title="重新整理" aria-label="重新整理紀錄"><RefreshCw size={17} /></button></form>
      </div>
      {error ? <div className="status-error inline-status">{error}</div> : null}
      <div className="admin-table-wrap"><table className="admin-table audit-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>
        {!loading && items.length === 0 ? <tr><td colSpan={columns.length} className="table-message">沒有紀錄</td></tr> : null}
        {items.map((item) => <AuditRowView key={item.id} kind={kind} item={item} />)}
        {loading && items.length === 0 ? <tr><td colSpan={columns.length} className="table-message">載入中</td></tr> : null}
      </tbody></table></div>
      {nextCursor ? <button className="load-more" type="button" disabled={loading} onClick={() => void load(nextCursor)}>{loading ? "載入中" : "載入更多"}</button> : null}
    </section>
  );
}

function AuditRowView({ kind, item }: { kind: AuditKind; item: AuditRow }) {
  if (kind === "logins") {
    const row = item as LoginAuditItem;
    const result = row.outcome === "success" ? "成功" : row.outcome === "rate_limited" ? "已限流" : "失敗";
    return <tr><Cell label="時間">{formatTimestamp(row.createdAt)}</Cell><Cell label="帳號">{row.username}</Cell><Cell label="結果"><span className={`audit-result ${row.success ? "success" : "failure"}`}>{result}</span></Cell><Cell label="IP">{row.ipAddress}</Cell></tr>;
  }
  if (kind === "downloads") {
    const row = item as DownloadAuditItem;
    return <tr><Cell label="時間">{formatTimestamp(row.createdAt)}</Cell><Cell label="帳號">{row.username}</Cell><Cell label="下載檔案"><span className="path-value">{row.objectKey}</span></Cell></tr>;
  }
  const row = item as AdminAuditItem;
  return <tr><Cell label="時間">{formatTimestamp(row.createdAt)}</Cell><Cell label="管理員">{row.actorUsername}</Cell><Cell label="操作">{actionLabel(row.action)}</Cell><Cell label="目標">{row.targetUsername ?? "-"}</Cell><Cell label="IP">{row.ipAddress}</Cell></tr>;
}

function Cell({ label, children }: { label: string; children: ReactNode }) { return <td data-label={label}>{children}</td>; }
function formatTimestamp(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value)); }
function actionLabel(value: string): string { return ({ "user.created": "新增帳號", "user.access_updated": "更新權限", "user.password_reset": "重設密碼", "user.deleted": "刪除帳號" } as Record<string, string>)[value] ?? value; }
