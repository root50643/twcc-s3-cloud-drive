# REST API

Base path：`/api/v1`。所有 response 使用 JSON，`204 No Content` 除外。瀏覽器必須保留 HTTP-only Session cookie。

## CSRF Flow

1. `GET /auth/csrf` 取得 `{ "csrfToken": "..." }` 並建立匿名 Session。
2. 所有 `POST`、`PATCH`、`DELETE` 請求加入 `X-CSRF-Token` header。
3. 登入成功會回傳新的 CSRF token；之後改用新 token。

Token 不應放在 URL、localStorage、log 或錯誤訊息。

## Authentication

```http
GET  /auth/csrf
POST /auth/login
GET  /auth/me
POST /auth/logout
POST /auth/change-password
```

登入 body：

```json
{ "username": "alice", "password": "example-password" }
```

成功 response：

```json
{
  "user": { "id": 1, "username": "alice", "role": "admin", "s3Prefix": "uploads/" },
  "csrfToken": "shortened-example"
}
```

更換密碼 body：

```json
{ "currentPassword": "current-example", "newPassword": "new-example" }
```

## Objects

```http
GET  /objects?prefix=&continuationToken=
POST /download-urls
POST /download-urls/batch
```

單檔 body：`{ "key": "reports/file.pdf" }`。

批量 body：

```json
{ "keys": ["file-a.pdf", "file-b.pdf"] }
```

批量下載接受 1–20 個 key，正規化後去除重複並維持輸入順序。任何 key 越界或任何 URL 產生失敗時，整批請求失敗。

## Admin Users

以下 endpoints 需要 `admin`：

```http
GET    /admin/users
POST   /admin/users
PATCH  /admin/users/:id
DELETE /admin/users/:id
POST   /admin/users/:id/reset-password
POST   /admin/s3-paths/validate
```

建立帳號：

```json
{
  "username": "bob",
  "password": "example-password",
  "role": "user",
  "s3Prefix": "uploads/bob/"
}
```

更新權限：

```json
{ "role": "user", "s3Prefix": "uploads/bob/" }
```

重設密碼：`{ "password": "new-example" }`。

路徑驗證：`{ "s3Prefix": "uploads/bob/" }`，回傳 normalized prefix、是否存在及是否為 whole bucket。

## Admin Audit

```http
GET /admin/audit/logins?limit=50&cursor=&username=
GET /admin/audit/downloads?limit=50&cursor=&username=
GET /admin/audit/admin-actions?limit=50&cursor=&username=
```

`limit` 為 1–100，預設 50。Response 格式：

```json
{
  "items": [],
  "nextCursor": null
}
```

有下一頁時，把 `nextCursor` 原值傳給下一次請求。紀錄固定由新到舊。

## Errors

```json
{
  "error": {
    "code": "S3_SCOPE_NOT_CONFIGURED",
    "message": "權限設定錯誤，請聯絡管理員。"
  }
}
```

常見狀態碼：`400` 驗證錯誤、`401` 未登入、`403` 權限或 CSRF、`409` 帳號/最後管理員衝突、`429` 登入限流、`502` S3 上游失敗。Response 不包含 stack、SDK 原始錯誤、S3 金鑰或環境變數。
