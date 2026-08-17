import { BoardProvider } from "./board/BoardContext";
import { Board } from "./board/Board";

function App() {
  return (
    <BoardProvider>
      <div className="min-h-screen">
        <header className="px-6 pt-5 pb-1">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
            ✨ Kanban Board
          </h1>
        </header>
        <Board />
      </div>
    </BoardProvider>
  );
}

export default App;
