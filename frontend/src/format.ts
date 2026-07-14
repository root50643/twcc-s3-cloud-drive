export function formatBytes(size: number): string {
  if (size === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** index;
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: index === 0 ? 0 : 1
  })} ${units[index]}`;
}

export function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function folderNameFromPrefix(prefix: string): string {
  const trimmed = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return trimmed.split("/").filter(Boolean).pop() ?? "Root";
}

export function buildBreadcrumb(prefix: string): Array<{ label: string; prefix: string }> {
  const parts = prefix.split("/").filter(Boolean);
  const crumbs = [{ label: "Root", prefix: "" }];
  let current = "";

  for (const part of parts) {
    current += `${part}/`;
    crumbs.push({ label: part, prefix: current });
  }

  return crumbs;
}
