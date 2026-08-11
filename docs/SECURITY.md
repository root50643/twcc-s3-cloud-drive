# Security Design

## Passwords

密碼使用 Argon2id PHC 格式，每筆自動產生 16-byte salt，參數為 64 MiB memory、3 iterations、parallelism 4、32-byte hash。這採用 [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html) 的 memory-constrained 建議，並高於 [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) 的最低設定。

系統只拒絕空字串，不 trim 或正規化密碼。JSON request 上限為 64 KiB，用來限制整體 request 資源消耗，不是密碼政策。

## Sessions And CSRF

- Session ID 只存在 HttpOnly cookie，server-side state 存在 SQLite。
- Cookie 固定 `SameSite=Strict` 與 `Path=/`；HTTPS 模式增加 `Secure` 及 `__Host-` prefix。
- 登入後 regenerate Session ID，避免 session fixation。
- 閒置與絕對期限分別預設 60 分鐘及 12 小時。
- 修改密碼、重設密碼、刪除帳號或角色變更會撤銷 Session。
- 所有 state-changing REST API 需要 Session-bound CSRF token custom header。

參考：[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) 與 [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)。

## Authorization

Frontend 隱藏管理功能只改善使用體驗，不是安全邊界。Backend 每次請求都查詢目前使用者並驗證角色；所有 S3 key 都在 backend 套用 prefix，拒絕 `.`、`..` 與 scope 外路徑。

最後管理員的刪除與降級檢查在 SQLite `BEGIN IMMEDIATE` 交易內執行，避免同時操作造成零管理員狀態。

## Secrets

S3 credential 與 Session secret 只從 `.env` 讀取，不寫入 SQLite、response、audit 或 client bundle。錯誤處理只記錄安全的 error name、HTTP status 與 S3 request ID。

Presigned URL 會透露 endpoint、bucket 與 object key，但不包含原始 Access Key 或 Secret Key。URL 本身在有效期內等同下載權限，因此不寫入 audit 或一般 log。

## Web And Network

- Backend 不映射 host port，只能由 compose network 存取。
- `TRUST_PROXY_HOPS` 必須符合可信任的反向代理層數，來源 IP 才不會被偽造。
- Nginx 與 Helmet 設定 CSP、frame denial、MIME sniffing protection、referrer policy 及 `Cache-Control: no-store`。
- 登入同時按帳號與 IP 限流，錯誤訊息不區分未知帳號與錯誤密碼。
- 正式環境必須使用 HTTPS；只有 HTTPS 模式才啟用 HSTS 與 Secure cookie。

## Operational Security

- 限制 `.env`、`data/` 及備份檔的檔案權限。
- 使用僅具必要 bucket/prefix read 權限的 S3 credential。
- 定期更新 container image 與 npm dependencies，執行 `pnpm audit --prod`。
- 備份 SQLite 前停止 backend，並加密異地備份。
- 測試帳密公開或經由非秘密管道傳遞後，應立即在網頁更換。

MFA/Passkey、Vault/HSM pepper 及集中式不可變 audit sink 尚未實作，適合作為更高安全需求的後續工作。
