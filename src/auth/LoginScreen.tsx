import { useAuth } from "./AuthContext";

export function LoginScreen() {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
          ✨ Kanban Board
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Đăng nhập để xem board và thẻ của riêng bạn
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="inline-flex items-center gap-3 px-5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100 font-medium shadow-sm hover:shadow-md transition-shadow"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"
            />
          </svg>
          Đăng nhập với Google
        </button>
      </div>
    </div>
  );
}
