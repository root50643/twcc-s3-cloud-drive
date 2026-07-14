import { describe, expect, it } from "vitest";
import { sortByLastModifiedDesc } from "./format";

describe("sortByLastModifiedDesc", () => {
  it("sorts files from newest to oldest without changing the input", () => {
    const files = [
      { name: "old.txt", lastModified: "2026-01-01T00:00:00.000Z" },
      { name: "new.txt", lastModified: "2026-07-14T00:00:00.000Z" },
      { name: "middle.txt", lastModified: "2026-04-01T00:00:00.000Z" }
    ];

    expect(sortByLastModifiedDesc(files).map((file) => file.name)).toEqual([
      "new.txt",
      "middle.txt",
      "old.txt"
    ]);
    expect(files.map((file) => file.name)).toEqual(["old.txt", "new.txt", "middle.txt"]);
  });

  it("places missing or invalid dates last and uses the name as a stable tie-breaker", () => {
    const files = [
      { name: "z-no-date.txt", lastModified: null },
      { name: "b.txt", lastModified: "2026-07-14T00:00:00.000Z" },
      { name: "a.txt", lastModified: "2026-07-14T00:00:00.000Z" },
      { name: "a-invalid.txt", lastModified: "not-a-date" }
    ];

    expect(sortByLastModifiedDesc(files).map((file) => file.name)).toEqual([
      "a.txt",
      "b.txt",
      "a-invalid.txt",
      "z-no-date.txt"
    ]);
  });
});
