import { BoardProvider } from "./board/BoardContext";
import { Board } from "./board/Board";
import { BoardSwitcher } from "./board/BoardSwitcher";
import { ThemeProvider, useTheme } from "./theme/ThemeContext";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginScreen } from "./auth/LoginScreen";

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

function UserMenu() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2">
      {user.user_metadata?.avatar_url && (
        <img
          src={user.user_metadata.avatar_url}
          alt=""
          className="w-8 h-8 rounded-full"
          referrerPolicy="no-referrer"
        />
      )}
      <span className="text-sm text-gray-600 dark:text-gray-300 max-w-[140px] truncate hidden sm:inline">
        {user.user_metadata?.full_name ?? user.email}
      </span>
      <button
        type="button"
        onClick={signOut}
        title="Đăng xuất"
        className="text-sm text-gray-400 dark:text-gray-500 hover:text-red-500 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        Đăng xuất
      </button>
    </div>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        Đang tải...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <BoardProvider key={user.id}>
      <div className="min-h-screen">
        <header className="px-6 pt-5 pb-1 flex items-center justify-between">
          <BoardSwitcher />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <Board />
      </div>
    </BoardProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
