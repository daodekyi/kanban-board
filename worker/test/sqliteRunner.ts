import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SqlRunner } from "../src/data";

/** SQLite trong bộ nhớ đã chạy migration thật — D1 cũng là SQLite nên kiểm được đúng ngữ nghĩa SQL. */
export function memoryRunner(): SqlRunner & { db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  return {
    db,
    async all(sql, params) {
      return db.prepare(sql).all(...params) as Record<string, unknown>[];
    },
    // D1 batch là một transaction: lỗi một câu thì cả lô bị hủy. Mô phỏng y vậy.
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        for (const s of stmts) db.prepare(s.sql).run(...s.params);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}
