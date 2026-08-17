import { v4 as uuidv4 } from "uuid";
import type { Board, BoardAction, Column } from "../types";

export function createDefaultBoard(): Board {
  const titles = ["1. To Do", "2. In Progress", "3. Review", "4. Done"];
  const columns: Column[] = titles.map((title, i) => ({
    id: uuidv4(),
    title,
    order: i,
    cards: [],
    isDone: title === "4. Done",
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
