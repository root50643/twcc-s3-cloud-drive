# Account Administration

## Roles

| Role | File access | Account management | Audit access |
| --- | --- | --- | --- |
| `user` | Assigned S3 prefix only | Own password | No |
| `admin` | Assigned prefix or full bucket | Full | Full |

系統永遠必須保留至少一位管理員。最後一位管理員不能刪除自己，也不能把自己降級為一般使用者；有其他管理員時才能進行這些操作。

## Account Lifecycle

管理員可在「帳號管理」新增帳號、編輯角色與 S3 路徑、重設密碼或刪除帳號。帳號名稱不區分大小寫且不可重複。

密碼只要求不是空字串，不會 trim、正規化或套用複雜度規則。儲存時使用 Argon2id，任何 API 或稽核紀錄都不會保存明文。

使用者更換自己的密碼，或管理員重設密碼後，該帳號所有裝置的 Session 都會立即失效。

## S3 Paths

路徑以 bucket 內的 prefix 表示，例如 `uploads/team-a/`。系統會：

1. 移除前導 `/`、把 `\` 轉成 `/`，並補上結尾 `/`。
2. 拒絕包含 `.` 或 `..` segment 的路徑。
3. 使用 `ListObjectsV2` 與 `MaxKeys=1` 驗證 prefix。
4. 在列檔與簽發下載網址時再次套用該帳號 prefix。

一般使用者不可保存空白路徑。若資料庫中出現未設定路徑的一般使用者，檔案頁顯示「權限設定錯誤，請聯絡管理員。」

只有管理員可使用空白路徑，代表整個 bucket。管理員也可設定非空白路徑限制自己。

S3 沒有真正的資料夾。完全空白且沒有 folder marker 的 prefix 無法被驗證為存在，請先放入至少一個 object。

## Audit Records

- 登入紀錄：時間、帳號、成功/失敗/限流、來源 IP。
- 下載紀錄：成功產生 presigned URL 的時間、帳號及實際 object key。
- 管理操作：新增/刪除帳號、角色或路徑異動、密碼重設及來源 IP。

紀錄由新到舊顯示，可用完整帳號名稱篩選。刪除帳號不會刪除歷史紀錄；紀錄保存 username snapshot。

`AUDIT_RETENTION_DAYS` 預設為 180。Backend 啟動時及每 24 小時清理超期紀錄。

下載紀錄表示後端已成功簽發網址，不表示瀏覽器一定完成傳輸。檔案內容由瀏覽器直接向 S3 下載。

## Login Protection

登入失敗按帳號與 IP 分別限流，預設窗口為 15 分鐘，每帳號 10 次、每 IP 30 次。限流事件也會出現在登入紀錄，但不會延長失敗計數。

所有帳號不存在或密碼錯誤的回應一致，不會向登入者透露帳號是否存在。
