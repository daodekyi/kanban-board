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
