import { useEffect, useState } from "react";

// No router library for an app this small — plain history API plus a tiny
// pub-sub so components re-render on navigation triggered from code (pushState
// alone doesn't fire `popstate`).
const listeners = new Set<() => void>();

export function navigate(path: string) {
  window.history.pushState(null, "", path);
  for (const listen of listeners) listen();
}

export function useRoute(): string {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onChange);
    listeners.add(onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      listeners.delete(onChange);
    };
  }, []);

  return path;
}

export function meetingIdFromPath(path: string): string | null {
  const match = path.match(/^\/m\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

export function newMeetingId(): string {
  return crypto.randomUUID().slice(0, 8);
}
