import { BoardProvider } from "./board/BoardContext";
import { Board } from "./board/Board";
import { BoardSwitcher } from "./board/BoardSwitcher";
import { ThemeProvider, useTheme } from "./theme/ThemeContext";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      className="w-9 h-9 rounded-full flex items-center justify-center text-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BoardProvider>
        <div className="min-h-screen">
          <header className="px-6 pt-5 pb-1 flex items-center justify-between">
            <BoardSwitcher />
            <ThemeToggle />
          </header>
          <Board />
        </div>
      </BoardProvider>
    </ThemeProvider>
  );
}

export default App;
