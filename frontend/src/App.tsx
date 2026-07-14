import { useEffect, useState } from "react";
import { getCurrentUser } from "./api";
import { DriveView } from "./DriveView";
import { LoginForm } from "./LoginForm";
import type { User } from "./types";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((currentUser) => {
        if (!cancelled) {
          setUser(currentUser);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInitializing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (initializing) {
    return <div className="boot-screen">載入中</div>;
  }

  if (!user) {
    return <LoginForm onLogin={setUser} />;
  }

  return <DriveView user={user} onLogout={() => setUser(null)} />;
}
