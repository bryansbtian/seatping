import { useCallback, useEffect, useRef, useState } from "react";
import type { BlogFields, BlogPost } from "@shared/blog";
import { BlogSaveQueue } from "@/lib/blogApi";

export function useBlogAutosave(initial: BlogPost, paused: boolean) {
  const [fields, setFields] = useState<BlogFields>(initial);
  const [post, setPost] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<BlogFields | null>(null);
  const queue = useRef(new BlogSaveQueue(initial));
  const latest = useRef<BlogFields>(initial);
  const version = useRef(0);
  const pending = useRef(0);
  const alive = useRef(true);
  const storageKey = `seatping.blog.recovery.${initial.id}`;

  useEffect(() => {
    alive.current = true;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        import("@shared/blog").then(({ blogFieldsSchema }) => {
          const result = blogFieldsSchema.safeParse(parsed);
          if (alive.current && result.success) {
            setRecovery(result.data);
          }
        });
      }
    } catch {}
    return () => {
      alive.current = false;
    };
  }, [storageKey]);

  const change = useCallback(
    (next: BlogFields) => {
      latest.current = next;
      version.current += 1;
      setFields(next);
      setDirty(true);
      try {
        const {
          id: _id,
          status: _status,
          revision: _revision,
          createdAt: _created,
          updatedAt: _updated,
          publishedAt: _published,
          ...clean
        } = next as BlogPost;
        sessionStorage.setItem(storageKey, JSON.stringify(clean));
      } catch {}
    },
    [storageKey],
  );

  const save = useCallback(async () => {
    const generation = version.current;
    pending.current += 1;
    setSaving(true);
    setError("");
    try {
      const {
        id: _id,
        status: _status,
        revision: _revision,
        createdAt: _created,
        updatedAt: _updated,
        publishedAt: _published,
        ...clean
      } = latest.current as BlogPost;
      const saved = await queue.current.save(clean);
      if (alive.current) {
        setPost(saved);
        if (generation === version.current) {
          setDirty(false);
          try {
            sessionStorage.removeItem(storageKey);
          } catch {}
        }
      }
      return saved;
    } catch (cause) {
      if (alive.current) {
        setError(errorMessage(cause));
      }
      throw cause;
    } finally {
      pending.current -= 1;
      if (alive.current) {
        setSaving(pending.current > 0);
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (!dirty || paused || recovery) {
      return;
    }
    const timer = window.setTimeout(() => {
      void save().catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [fields, dirty, paused, recovery, save]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || paused) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, paused]);

  const acceptPost = (next: BlogPost) => {
    queue.current.post = next;
    setPost(next);
  };
  const restore = () => {
    if (recovery) {
      change(recovery);
    }
    setRecovery(null);
  };
  const discardRecovery = () => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
    setRecovery(null);
  };
  return {
    fields,
    post,
    change,
    save,
    dirty,
    saving,
    error,
    recovery,
    restore,
    discardRecovery,
    acceptPost,
  };
}
export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return "Something went wrong. Please try again.";
}
