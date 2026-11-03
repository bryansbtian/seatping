import { useEffect, useState, useSyncExternalStore } from "react";
import type { BlogFields, BlogPost } from "@shared/blog";
import { BlogCollaboration } from "@/lib/blogCollaboration";

export function useBlogCollaboration(initial: BlogPost, paused: boolean) {
  const [provider] = useState(() => new BlogCollaboration(initial));
  const snapshot = useSyncExternalStore(provider.subscribe, () => provider.snapshot);
  useEffect(() => {
    provider.start();
    return () => provider.stop();
  }, [provider]);
  useEffect(() => {
    provider.paused = paused;
  }, [provider, paused]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (provider.snapshot.dirty || paused) {
        event.preventDefault();
      }
    };
    const reconnect = () => {
      void provider.sync().catch(() => {});
    };
    const leave = () => provider.leave();
    window.addEventListener("beforeunload", handler);
    window.addEventListener("online", reconnect);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("pagehide", leave);
    };
  }, [provider, paused]);
  return {
    ...snapshot,
    provider,
    change: (next: BlogFields) => provider.change(next, snapshot.fields),
    save: () => provider.save(),
    acceptPost: (post: BlogPost) => provider.acceptPost(post),
    restore: () => provider.restore(),
    discardRecovery: () => provider.discardRecovery(),
  };
}
