import { v4 as uuidv4 } from "uuid";
import type { Board, BoardAction, Column } from "../types";

export function createDefaultBoard(title = "Kanban Board"): Board {
  const titles = ["1. To Do", "2. In Progress", "3. Review", "4. Done"];
  const columns: Column[] = titles.map((columnTitle, i) => ({
    id: uuidv4(),
    title: columnTitle,
    order: i,
    cards: [],
    isDone: columnTitle === "4. Done",
  }));
  return { id: uuidv4(), title, columns };
}

export function boardReducer(state: Board, action: BoardAction): Board {
  switch (action.type) {
    case "addColumn": {
      // max+1 chứ không phải length: sau khi xóa một cột, length có thể trùng
      // order của cột đang có và hai cột sẽ tranh nhau vị trí khi sắp xếp.
      const order = state.columns.reduce((max, c) => Math.max(max, c.order + 1), 0);
      const column: Column = {
        id: action.columnId ?? uuidv4(),
        title: action.title,
        order,
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
            enteredColumnAt: new Date().toISOString(),
            ...action.patch,
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

      const changingColumn = fromColumnId !== toColumnId;
      const cardToInsert = changingColumn
        ? { ...movingCard, enteredColumnAt: new Date().toISOString() }
        : movingCard;

      return {
        ...state,
        columns: state.columns.map((c) => {
          if (c.id === fromColumnId && c.id === toColumnId) {
            const withoutCard = c.cards.filter((card) => card.id !== cardId);
            const reordered = [
              ...withoutCard.slice(0, toIndex),
              cardToInsert,
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
              cardToInsert,
              ...c.cards.slice(toIndex),
            ];
            return { ...c, cards: inserted.map((card, i) => ({ ...card, order: i })) };
          }
          return c;
        }),
      };
    }

    case "moveColumn": {
      const sorted = state.columns.slice().sort((a, b) => a.order - b.order);
      const from = sorted.findIndex((c) => c.id === action.columnId);
      if (from === -1) return state;
      const [moving] = sorted.splice(from, 1);
      const to = Math.max(0, Math.min(action.toIndex, sorted.length));
      sorted.splice(to, 0, moving);
      return { ...state, columns: sorted.map((c, i) => ({ ...c, order: i })) };
    }

    case "setColumnDone": {
      return {
        ...state,
        columns: state.columns.map((c) =>
          c.id === action.columnId ? { ...c, isDone: action.isDone } : c
        ),
      };
    }

    case "setWipLimit": {
      return {
        ...state,
        columns: state.columns.map((c) =>
          c.id === action.columnId ? { ...c, wipLimit: action.wipLimit } : c
        ),
      };
    }

    default:
      return state;
  }
}
