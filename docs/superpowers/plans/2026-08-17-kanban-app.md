# Kanban App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-only Kanban board web app (React + TypeScript + Tailwind, dnd-kit drag-and-drop, localStorage persistence) matching the design spec.

**Architecture:** Vite React SPA. A `BoardProvider` (Context + `useReducer`) holds the board state (columns → cards) and persists to `localStorage` on every change. `Board` renders `Column`s inside a dnd-kit `DndContext`; `Column` renders `Card`s inside a `SortableContext`. Clicking a card opens `CardModal` for full edit (description, labels, due date, priority).

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, uuid (for ids), Vitest (reducer unit tests).

## Global Constraints

- No backend — all state in `localStorage` under key `kanban-board`, per spec.
- Priority type is exactly `"low" | "medium" | "high"`, per spec.
- Card fields: `id, title, description?, labels: string[], dueDate?: string, priority, order`, per spec.
- Column fields: `id, title, order, cards: Card[]`, per spec.
- Seed 3 default columns ("To Do", "In Progress", "Done") when localStorage is empty or fails to parse, per spec.
- Style: modern/minimal, Trello/Linear-like, per spec.
- Confirm before deleting a column that has cards (use `window.confirm`), per spec.

---

### Task 1: Project scaffold (Vite + React + TS + Tailwind)

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `tailwind.config.js`, `postcss.config.js`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `.gitignore`

**Interfaces:**
- Produces: a running Vite dev server rendering `<App />`, Tailwind classes usable in any component thereafter.

- [ ] **Step 1: Scaffold Vite React-TS project**

```bash
npm create vite@latest . -- --template react-ts
```

Run this inside `C:\Users\bubir\OneDrive\Desktop\AI Course\Kanban`. If prompted about a non-empty directory (docs/ already exists), confirm to proceed.

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities uuid
npm install -D tailwindcss postcss autoprefixer @types/uuid vitest
```

- [ ] **Step 3: Initialize Tailwind config**

```bash
npx tailwindcss init -p
```

Replace `tailwind.config.js` content with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 4: Add Tailwind directives to `src/index.css`**

Replace file contents with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-50 text-gray-900;
}
```

- [ ] **Step 5: Simplify `src/App.tsx` to a placeholder**

```tsx
function App() {
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">Kanban</h1>
    </div>
  );
}

export default App;
```

- [ ] **Step 6: Run dev server and verify it renders**

```bash
npm run dev
```

Expected: server starts (e.g. on http://localhost:5173), and visiting it shows "Kanban" heading styled with Tailwind (semibold, larger text). Stop the server after confirming (Ctrl+C).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React TS Tailwind project"
```

---

### Task 2: Domain types and reducer (pure logic, TDD)

**Files:**
- Create: `src/types.ts`
- Create: `src/board/boardReducer.ts`
- Test: `src/board/boardReducer.test.ts`

**Interfaces:**
- Produces:
  - `Priority = "low" | "medium" | "high"` (from `src/types.ts`)
  - `Card { id: string; title: string; description?: string; labels: string[]; dueDate?: string; priority: Priority; order: number }`
  - `Column { id: string; title: string; order: number; cards: Card[] }`
  - `Board { id: string; title: string; columns: Column[] }`
  - `BoardAction` union: `{ type: "addColumn"; title: string } | { type: "removeColumn"; columnId: string } | { type: "renameColumn"; columnId: string; title: string } | { type: "addCard"; columnId: string; title: string } | { type: "updateCard"; columnId: string; cardId: string; patch: Partial<Omit<Card, "id">> } | { type: "removeCard"; columnId: string; cardId: string } | { type: "moveCard"; cardId: string; fromColumnId: string; toColumnId: string; toIndex: number }`
  - `boardReducer(state: Board, action: BoardAction): Board`
  - `createDefaultBoard(): Board` — returns board with 3 seed columns ("To Do", "In Progress", "Done"), empty cards.

- [ ] **Step 1: Define types**

Create `src/types.ts`:

```ts
export type Priority = "low" | "medium" | "high";

export interface Card {
  id: string;
  title: string;
  description?: string;
  labels: string[];
  dueDate?: string;
  priority: Priority;
  order: number;
}

export interface Column {
  id: string;
  title: string;
  order: number;
  cards: Card[];
}

export interface Board {
  id: string;
  title: string;
  columns: Column[];
}

export type BoardAction =
  | { type: "addColumn"; title: string }
  | { type: "removeColumn"; columnId: string }
  | { type: "renameColumn"; columnId: string; title: string }
  | { type: "addCard"; columnId: string; title: string }
  | { type: "updateCard"; columnId: string; cardId: string; patch: Partial<Omit<Card, "id">> }
  | { type: "removeCard"; columnId: string; cardId: string }
  | { type: "moveCard"; cardId: string; fromColumnId: string; toColumnId: string; toIndex: number };
```

- [ ] **Step 2: Write failing reducer tests**

Create `src/board/boardReducer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { boardReducer, createDefaultBoard } from "./boardReducer";
import type { Board } from "../types";

function boardWithOneCard(): Board {
  const base = createDefaultBoard();
  const col = base.columns[0];
  col.cards.push({
    id: "card-1",
    title: "First card",
    labels: [],
    priority: "medium",
    order: 0,
  });
  return base;
}

describe("createDefaultBoard", () => {
  it("seeds three columns: To Do, In Progress, Done", () => {
    const board = createDefaultBoard();
    expect(board.columns.map((c) => c.title)).toEqual(["To Do", "In Progress", "Done"]);
    expect(board.columns.every((c) => c.cards.length === 0)).toBe(true);
  });
});

describe("boardReducer", () => {
  it("addColumn appends a new column with next order", () => {
    const board = createDefaultBoard();
    const next = boardReducer(board, { type: "addColumn", title: "Backlog" });
    expect(next.columns).toHaveLength(4);
    expect(next.columns[3].title).toBe("Backlog");
    expect(next.columns[3].order).toBe(3);
  });

  it("removeColumn removes the column by id", () => {
    const board = createDefaultBoard();
    const targetId = board.columns[0].id;
    const next = boardReducer(board, { type: "removeColumn", columnId: targetId });
    expect(next.columns.find((c) => c.id === targetId)).toBeUndefined();
    expect(next.columns).toHaveLength(2);
  });

  it("renameColumn updates the title", () => {
    const board = createDefaultBoard();
    const targetId = board.columns[0].id;
    const next = boardReducer(board, { type: "renameColumn", columnId: targetId, title: "Doing" });
    expect(next.columns.find((c) => c.id === targetId)?.title).toBe("Doing");
  });

  it("addCard appends a card to the given column", () => {
    const board = createDefaultBoard();
    const columnId = board.columns[0].id;
    const next = boardReducer(board, { type: "addCard", columnId, title: "New task" });
    const col = next.columns.find((c) => c.id === columnId)!;
    expect(col.cards).toHaveLength(1);
    expect(col.cards[0].title).toBe("New task");
    expect(col.cards[0].priority).toBe("medium");
    expect(col.cards[0].labels).toEqual([]);
  });

  it("updateCard patches fields on the matching card", () => {
    const board = boardWithOneCard();
    const columnId = board.columns[0].id;
    const next = boardReducer(board, {
      type: "updateCard",
      columnId,
      cardId: "card-1",
      patch: { title: "Updated", priority: "high", dueDate: "2026-09-01" },
    });
    const card = next.columns[0].cards.find((c) => c.id === "card-1")!;
    expect(card.title).toBe("Updated");
    expect(card.priority).toBe("high");
    expect(card.dueDate).toBe("2026-09-01");
  });

  it("removeCard removes the card from its column", () => {
    const board = boardWithOneCard();
    const columnId = board.columns[0].id;
    const next = boardReducer(board, { type: "removeCard", columnId, cardId: "card-1" });
    expect(next.columns[0].cards).toHaveLength(0);
  });

  it("moveCard moves a card between columns and reorders", () => {
    const board = boardWithOneCard();
    const fromColumnId = board.columns[0].id;
    const toColumnId = board.columns[1].id;
    const next = boardReducer(board, {
      type: "moveCard",
      cardId: "card-1",
      fromColumnId,
      toColumnId,
      toIndex: 0,
    });
    expect(next.columns[0].cards).toHaveLength(0);
    expect(next.columns[1].cards).toHaveLength(1);
    expect(next.columns[1].cards[0].id).toBe("card-1");
  });

  it("moveCard reorders within the same column", () => {
    const board = createDefaultBoard();
    const columnId = board.columns[0].id;
    board.columns[0].cards = [
      { id: "a", title: "A", labels: [], priority: "medium", order: 0 },
      { id: "b", title: "B", labels: [], priority: "medium", order: 1 },
    ];
    const next = boardReducer(board, {
      type: "moveCard",
      cardId: "b",
      fromColumnId: columnId,
      toColumnId: columnId,
      toIndex: 0,
    });
    expect(next.columns[0].cards.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/board/boardReducer.test.ts`
Expected: FAIL — `boardReducer.ts` does not exist yet (module not found).

- [ ] **Step 4: Implement the reducer**

Create `src/board/boardReducer.ts`:

```ts
import { v4 as uuidv4 } from "uuid";
import type { Board, BoardAction, Column } from "../types";

export function createDefaultBoard(): Board {
  const titles = ["To Do", "In Progress", "Done"];
  const columns: Column[] = titles.map((title, i) => ({
    id: uuidv4(),
    title,
    order: i,
    cards: [],
  }));
  return { id: uuidv4(), title: "My Board", columns };
}

export function boardReducer(state: Board, action: BoardAction): Board {
  switch (action.type) {
    case "addColumn": {
      const column: Column = {
        id: uuidv4(),
        title: action.title,
        order: state.columns.length,
        cards: [],
      };
      return { ...state, columns: [...state.columns, column] };
    }

    case "removeColumn": {
      return {
        ...state,
        columns: state.columns.filter((c) => c.id !== action.columnId),
      };
    }

    case "renameColumn": {
      return {
        ...state,
        columns: state.columns.map((c) =>
          c.id === action.columnId ? { ...c, title: action.title } : c
        ),
      };
    }

    case "addCard": {
      return {
        ...state,
        columns: state.columns.map((c) => {
          if (c.id !== action.columnId) return c;
          const card = {
            id: uuidv4(),
            title: action.title,
            labels: [] as string[],
            priority: "medium" as const,
            order: c.cards.length,
          };
          return { ...c, cards: [...c.cards, card] };
        }),
      };
    }

    case "updateCard": {
      return {
        ...state,
        columns: state.columns.map((c) => {
          if (c.id !== action.columnId) return c;
          return {
            ...c,
            cards: c.cards.map((card) =>
              card.id === action.cardId ? { ...card, ...action.patch } : card
            ),
          };
        }),
      };
    }

    case "removeCard": {
      return {
        ...state,
        columns: state.columns.map((c) =>
          c.id === action.columnId
            ? { ...c, cards: c.cards.filter((card) => card.id !== action.cardId) }
            : c
        ),
      };
    }

    case "moveCard": {
      const { cardId, fromColumnId, toColumnId, toIndex } = action;
      const fromColumn = state.columns.find((c) => c.id === fromColumnId);
      const movingCard = fromColumn?.cards.find((c) => c.id === cardId);
      if (!movingCard) return state;

      return {
        ...state,
        columns: state.columns.map((c) => {
          if (c.id === fromColumnId && c.id === toColumnId) {
            const withoutCard = c.cards.filter((card) => card.id !== cardId);
            const reordered = [
              ...withoutCard.slice(0, toIndex),
              movingCard,
              ...withoutCard.slice(toIndex),
            ];
            return { ...c, cards: reordered.map((card, i) => ({ ...card, order: i })) };
          }
          if (c.id === fromColumnId) {
            return { ...c, cards: c.cards.filter((card) => card.id !== cardId) };
          }
          if (c.id === toColumnId) {
            const inserted = [
              ...c.cards.slice(0, toIndex),
              movingCard,
              ...c.cards.slice(toIndex),
            ];
            return { ...c, cards: inserted.map((card, i) => ({ ...card, order: i })) };
          }
          return c;
        }),
      };
    }

    default:
      return state;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/board/boardReducer.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/board/boardReducer.ts src/board/boardReducer.test.ts
git commit -m "feat: add board domain types and pure reducer with tests"
```

---

### Task 3: localStorage persistence hook + BoardProvider context

**Files:**
- Create: `src/board/useLocalStorage.ts`
- Create: `src/board/BoardContext.tsx`
- Test: `src/board/useLocalStorage.test.ts`

**Interfaces:**
- Consumes: `boardReducer`, `createDefaultBoard`, `Board`, `BoardAction` from Task 2.
- Produces:
  - `useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void]`
  - `BoardProvider({ children }: { children: React.ReactNode })` — wraps app, initializes state from localStorage key `"kanban-board"` (falling back to `createDefaultBoard()` on missing/invalid data), persists on every dispatch.
  - `useBoard(): { board: Board; dispatch: React.Dispatch<BoardAction> }` — context hook consumed by `Board`, `Column`, `Card`, `CardModal` in later tasks.

- [ ] **Step 1: Write failing test for useLocalStorage fallback behavior**

Create `src/board/useLocalStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "./useLocalStorage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns initialValue when nothing stored", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", { a: 1 }));
    expect(result.current[0]).toEqual({ a: 1 });
  });

  it("persists updates to localStorage and reflects them", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", { a: 1 }));
    act(() => {
      result.current[1]({ a: 2 });
    });
    expect(result.current[0]).toEqual({ a: 2 });
    expect(JSON.parse(window.localStorage.getItem("test-key")!)).toEqual({ a: 2 });
  });

  it("falls back to initialValue when stored data is invalid JSON", () => {
    window.localStorage.setItem("test-key", "not-json{");
    const { result } = renderHook(() => useLocalStorage("test-key", { a: 1 }));
    expect(result.current[0]).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Install test utilities and jsdom environment**

```bash
npm install -D @testing-library/react jsdom
```

Add to `vite.config.ts` a `test` block (merge with existing config):

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/board/useLocalStorage.test.ts`
Expected: FAIL — `useLocalStorage.ts` not found.

- [ ] **Step 4: Implement useLocalStorage**

Create `src/board/useLocalStorage.ts`:

```ts
import { useState } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    setStoredValue(value);
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable — state still updates in memory
    }
  };

  return [storedValue, setValue];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/board/useLocalStorage.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Implement BoardContext (no test — thin wiring over tested reducer/hook)**

Create `src/board/BoardContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import type { Board, BoardAction } from "../types";
import { boardReducer, createDefaultBoard } from "./boardReducer";
import { useLocalStorage } from "./useLocalStorage";

interface BoardContextValue {
  board: Board;
  dispatch: React.Dispatch<BoardAction>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorage<Board>("kanban-board", createDefaultBoard());
  const [board, dispatch] = useReducer(boardReducer, stored);

  useEffect(() => {
    setStored(board);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  return (
    <BoardContext.Provider value={{ board, dispatch }}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within a BoardProvider");
  return ctx;
}
```

- [ ] **Step 7: Commit**

```bash
git add src/board/useLocalStorage.ts src/board/useLocalStorage.test.ts src/board/BoardContext.tsx vite.config.ts package.json package-lock.json
git commit -m "feat: add localStorage-backed board context"
```

---

### Task 4: Card and CardModal components

**Files:**
- Create: `src/board/Card.tsx`
- Create: `src/board/CardModal.tsx`

**Interfaces:**
- Consumes: `Card`, `Priority` types (Task 2); `useBoard()` (Task 3).
- Produces:
  - `CardView({ card, columnId }: { card: Card; columnId: string })` — draggable card display, click opens modal.
  - `CardModal({ card, columnId, onClose }: { card: Card; columnId: string; onClose: () => void })` — edit form, dispatches `updateCard`/`removeCard`.

- [ ] **Step 1: Implement CardModal**

Create `src/board/CardModal.tsx`:

```tsx
import { useState } from "react";
import type { Card, Priority } from "../types";
import { useBoard } from "./BoardContext";

const LABEL_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa", "#a78bfa"];

export function CardModal({
  card,
  columnId,
  onClose,
}: {
  card: Card;
  columnId: string;
  onClose: () => void;
}) {
  const { dispatch } = useBoard();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [labels, setLabels] = useState<string[]>(card.labels);
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(card.priority);

  const toggleLabel = (color: string) => {
    setLabels((prev) =>
      prev.includes(color) ? prev.filter((l) => l !== color) : [...prev, color]
    );
  };

  const handleSave = () => {
    dispatch({
      type: "updateCard",
      columnId,
      cardId: card.id,
      patch: {
        title,
        description: description || undefined,
        labels,
        dueDate: dueDate || undefined,
        priority,
      },
    });
    onClose();
  };

  const handleDelete = () => {
    dispatch({ type: "removeCard", columnId, cardId: card.id });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-5 space-y-4">
        <input
          className="w-full text-lg font-semibold border-b border-gray-200 pb-2 focus:outline-none focus:border-blue-400"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="w-full border border-gray-200 rounded p-2 text-sm min-h-[80px] focus:outline-none focus:border-blue-400"
          placeholder="Mô tả..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">Nhãn</div>
          <div className="flex gap-2">
            {LABEL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => toggleLabel(color)}
                className="w-6 h-6 rounded-full border-2"
                style={{
                  backgroundColor: color,
                  borderColor: labels.includes(color) ? "#111827" : "transparent",
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <div className="text-xs font-medium text-gray-500 mb-1">Hạn chót</div>
            <input
              type="date"
              className="w-full border border-gray-200 rounded p-2 text-sm"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-gray-500 mb-1">Độ ưu tiên</div>
            <select
              className="w-full border border-gray-200 rounded p-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
            </select>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <button
            type="button"
            onClick={handleDelete}
            className="text-red-500 text-sm hover:underline"
          >
            Xóa thẻ
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-gray-200 hover:bg-gray-50"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 text-sm rounded bg-blue-500 text-white hover:bg-blue-600"
            >
              Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement CardView**

Create `src/board/Card.tsx`:

```tsx
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card, Priority } from "../types";
import { CardModal } from "./CardModal";

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export function CardView({ card, columnId }: { card: Card; columnId: string }) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => setOpen(true)}
        className="bg-white rounded-md shadow-sm border border-gray-100 p-3 cursor-pointer hover:shadow-md transition-shadow space-y-2"
      >
        <div className="text-sm font-medium text-gray-800">{card.title}</div>

        {card.labels.length > 0 && (
          <div className="flex gap-1">
            {card.labels.map((color) => (
              <span
                key={color}
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <span className={`px-1.5 py-0.5 rounded ${PRIORITY_STYLES[card.priority]}`}>
            {PRIORITY_LABEL[card.priority]}
          </span>
          {card.dueDate && (
            <span className={isOverdue(card.dueDate) ? "text-red-500 font-medium" : "text-gray-400"}>
              {card.dueDate}
            </span>
          )}
        </div>
      </div>

      {open && (
        <CardModal card={card} columnId={columnId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors (Column/Board components that use these are added in Task 5, so imports of `CardView`/`CardModal` don't exist yet — that's fine, this step just checks Card.tsx/CardModal.tsx compile in isolation as part of the whole project). If `tsc` reports unused-file issues, ignore; it will fully resolve once Task 5 wires them in.

- [ ] **Step 4: Commit**

```bash
git add src/board/Card.tsx src/board/CardModal.tsx
git commit -m "feat: add Card view and CardModal edit form"
```

---

### Task 5: Column and Board components with drag-and-drop

**Files:**
- Create: `src/board/Column.tsx`
- Create: `src/board/Board.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useBoard()` (Task 3), `CardView` (Task 4), `Column`/`Board` types (Task 2).
- Produces: `<Board />` — the full rendered app, mounted by `App`.

- [ ] **Step 1: Implement Column**

Create `src/board/Column.tsx`:

```tsx
import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { Column } from "../types";
import { CardView } from "./Card";
import { useBoard } from "./BoardContext";

export function ColumnView({ column }: { column: Column }) {
  const { dispatch } = useBoard();
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);

  const { setNodeRef } = useDroppable({ id: column.id });

  const handleAddCard = () => {
    const title = newCardTitle.trim();
    if (title) {
      dispatch({ type: "addCard", columnId: column.id, title });
    }
    setNewCardTitle("");
    setAddingCard(false);
  };

  const handleRename = () => {
    const title = titleDraft.trim();
    if (title) {
      dispatch({ type: "renameColumn", columnId: column.id, title });
    }
    setEditingTitle(false);
  };

  const handleRemoveColumn = () => {
    if (column.cards.length > 0) {
      const confirmed = window.confirm(
        `Cột "${column.title}" có ${column.cards.length} thẻ. Xóa cột sẽ xóa luôn các thẻ này. Tiếp tục?`
      );
      if (!confirmed) return;
    }
    dispatch({ type: "removeColumn", columnId: column.id });
  };

  return (
    <div className="bg-gray-100 rounded-lg w-72 flex-shrink-0 flex flex-col max-h-full">
      <div className="flex items-center justify-between p-3">
        {editingTitle ? (
          <input
            autoFocus
            className="flex-1 text-sm font-semibold bg-white rounded px-2 py-1 mr-2"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
        ) : (
          <div
            className="text-sm font-semibold cursor-text"
            onClick={() => setEditingTitle(true)}
          >
            {column.title} <span className="text-gray-400 font-normal">({column.cards.length})</span>
          </div>
        )}
        <button
          type="button"
          onClick={handleRemoveColumn}
          className="text-gray-400 hover:text-red-500 text-sm"
        >
          ✕
        </button>
      </div>

      <div ref={setNodeRef} className="flex-1 overflow-y-auto px-3 space-y-2">
        <SortableContext
          items={column.cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.map((card) => (
            <CardView key={card.id} card={card} columnId={column.id} />
          ))}
        </SortableContext>
      </div>

      <div className="p-3">
        {addingCard ? (
          <div className="space-y-2">
            <input
              autoFocus
              className="w-full text-sm rounded px-2 py-1.5 border border-gray-200"
              placeholder="Tiêu đề thẻ..."
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCard()}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddCard}
                className="px-2 py-1 text-xs rounded bg-blue-500 text-white"
              >
                Thêm
              </button>
              <button
                type="button"
                onClick={() => setAddingCard(false)}
                className="px-2 py-1 text-xs rounded border border-gray-200"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCard(true)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            + Thêm thẻ
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement Board with DndContext**

Create `src/board/Board.tsx`:

```tsx
import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useBoard } from "./BoardContext";
import { ColumnView } from "./Column";

export function Board() {
  const { board, dispatch } = useBoard();
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleAddColumn = () => {
    const title = newColumnTitle.trim();
    if (title) {
      dispatch({ type: "addColumn", title });
    }
    setNewColumnTitle("");
    setAddingColumn(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const cardId = String(active.id);
    const fromColumn = board.columns.find((c) => c.cards.some((card) => card.id === cardId));
    if (!fromColumn) return;

    const overId = String(over.id);
    let toColumn = board.columns.find((c) => c.id === overId);
    let toIndex: number;

    if (toColumn) {
      toIndex = toColumn.cards.length;
    } else {
      toColumn = board.columns.find((c) => c.cards.some((card) => card.id === overId));
      if (!toColumn) return;
      toIndex = toColumn.cards.findIndex((card) => card.id === overId);
    }

    if (fromColumn.id === toColumn.id) {
      const currentIndex = fromColumn.cards.findIndex((card) => card.id === cardId);
      if (currentIndex === toIndex) return;
    }

    dispatch({
      type: "moveCard",
      cardId,
      fromColumnId: fromColumn.id,
      toColumnId: toColumn.id,
      toIndex,
    });
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 p-6 overflow-x-auto h-screen items-start">
        {board.columns
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((column) => (
            <ColumnView key={column.id} column={column} />
          ))}

        <div className="w-72 flex-shrink-0">
          {addingColumn ? (
            <div className="bg-gray-100 rounded-lg p-3 space-y-2">
              <input
                autoFocus
                className="w-full text-sm rounded px-2 py-1.5 border border-gray-200"
                placeholder="Tên cột..."
                value={newColumnTitle}
                onChange={(e) => setNewColumnTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="px-2 py-1 text-xs rounded bg-blue-500 text-white"
                >
                  Thêm
                </button>
                <button
                  type="button"
                  onClick={() => setAddingColumn(false)}
                  className="px-2 py-1 text-xs rounded border border-gray-200"
                >
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingColumn(true)}
              className="text-sm text-gray-500 hover:text-gray-700 bg-gray-100/50 rounded-lg px-3 py-2 w-full text-left"
            >
              + Thêm cột
            </button>
          )}
        </div>
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 3: Wire Board into App with BoardProvider**

Replace `src/App.tsx`:

```tsx
import { BoardProvider } from "./board/BoardContext";
import { Board } from "./board/Board";

function App() {
  return (
    <BoardProvider>
      <div className="min-h-screen">
        <header className="px-6 pt-4">
          <h1 className="text-xl font-semibold text-gray-800">Kanban</h1>
        </header>
        <Board />
      </div>
    </BoardProvider>
  );
}

export default App;
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: PASS — all tests from Tasks 2 and 3 still green.

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification in browser**

```bash
npm run dev
```

Open the printed local URL and verify:
- Three seeded columns appear (To Do, In Progress, Done).
- Click "+ Thêm cột", add a column, it appears.
- Click "+ Thêm thẻ" in a column, add a card, it appears.
- Click a card, modal opens; edit description/labels/due date/priority, click Lưu — changes persist on the card.
- Drag a card to another column — it moves.
- Drag a card within the same column — order changes.
- Reload the page — board state persists (localStorage).
- Delete a column with cards — confirm dialog appears; confirming removes it.

Stop the dev server after verifying (Ctrl+C).

- [ ] **Step 7: Commit**

```bash
git add src/board/Column.tsx src/board/Board.tsx src/App.tsx
git commit -m "feat: add Column and Board components with drag-and-drop"
```

---

### Task 6: Final polish and README

**Files:**
- Modify: `src/index.css` (scrollbar/empty-state polish if needed)
- Create: `README.md`

**Interfaces:**
- None (documentation and minor styling only; no new exports consumed elsewhere).

- [ ] **Step 1: Add README with setup/run instructions**

Create `README.md`:

```markdown
# Kanban

Ứng dụng Kanban board chạy hoàn toàn trên trình duyệt (không backend). Xây dựng bằng Vite + React + TypeScript + Tailwind CSS, kéo thả bằng dnd-kit, dữ liệu lưu trong localStorage.

## Chạy dự án

\`\`\`bash
npm install
npm run dev
\`\`\`

Mở URL được in ra (mặc định http://localhost:5173).

## Kiểm thử

\`\`\`bash
npx vitest run
\`\`\`

## Tính năng

- Tạo/sửa/xóa cột và thẻ
- Kéo thả thẻ giữa các cột và trong cùng cột
- Chi tiết thẻ: mô tả, nhãn màu, hạn chót, độ ưu tiên
- Dữ liệu tự động lưu vào localStorage
```

- [ ] **Step 2: Verify production build succeeds**

Run: `npm run build`
Expected: build completes with no TypeScript or bundling errors, `dist/` directory created.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```
