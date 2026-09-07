import { describe, expect, it } from "vitest";
import { compareTableNames } from "./tableOrder";

describe("compareTableNames", () => {
  it("orders numeric table names by value, not alphabetically", () => {
    const names = ["10", "2", "1", "20", "3"];
    expect([...names].sort(compareTableNames)).toEqual(["1", "2", "3", "10", "20"]);
  });

  it("keeps stable ordering for combo names like '5+6'", () => {
    const names = ["12+13", "2+3"];
    expect([...names].sort(compareTableNames)).toEqual(["2+3", "12+13"]);
  });
});
