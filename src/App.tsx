import { BoardProvider } from "./board/BoardContext";
import { Board } from "./board/Board";

function App() {
  return (
    <BoardProvider>
      <div className="min-h-screen">
        <header className="px-6 pt-5 pb-1">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            ✨ Kanban
          </h1>
        </header>
        <Board />
      </div>
    </BoardProvider>
  );
}

export default App;
