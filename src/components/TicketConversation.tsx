import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TicketChatMessage, TicketInboxStatus } from "@shared/tickets";

type ConversationTicket = { ticketNumber: string; messages: TicketChatMessage[]; status: string };

function senderInitials(sender: string) {
  return (
    sender
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "S"
  );
}

function messageDay(timestamp: string) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
export default function TicketConversation({
  ticketNumber,
  messages,
  onRefresh,
  active = true,
}: {
  ticketNumber: string;
  messages: TicketChatMessage[];
  onRefresh: (ticket: ConversationTicket) => void;
  active?: boolean;
}) {
  const [name, setName] = useState("SeatPing Team");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [inbox, setInbox] = useState<TicketInboxStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showQuoted, setShowQuoted] = useState<string[]>([]);
  const thread = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const request = useRef<{ id: string; message: string; name: string } | null>(null);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const refresh = useCallback(async () => {
    const response = await fetch(`/tickets/${encodeURIComponent(ticketNumber)}`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Unable to refresh the conversation");
    }
    const data = (await response.json()) as { ticket: ConversationTicket };
    refreshRef.current(data.ticket);
  }, [ticketNumber]);
  useEffect(() => {
    setMessage("");
    setError("");
    nearBottom.current = true;
    request.current = null;
    let active = true;
    const status = async () => {
      try {
        const response = await fetch("/tickets/email/status", { credentials: "include" });
        if (response.ok && active) {
          setInbox((await response.json()) as TicketInboxStatus);
        }
      } catch {}
    };
    void status();
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void refresh().catch(() => setError("Unable to refresh the conversation"));
        void status();
      }
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [ticketNumber, refresh]);
  useEffect(() => {
    if (active && thread.current && nearBottom.current) {
      thread.current.scrollTop = thread.current.scrollHeight;
    }
  }, [active, messages.length, ticketNumber]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (sending) {
      return;
    }
    if (!name.trim()) {
      setError("Enter your name before sending a response.");
      return;
    }
    if (!message.trim()) {
      setError("Enter a response before sending.");
      return;
    }
    setSending(true);
    setError("");
    if (!request.current || request.current.message !== message || request.current.name !== name) {
      request.current = { id: crypto.randomUUID(), message, name };
    }
    try {
      const response = await fetch(`/tickets/${encodeURIComponent(ticketNumber)}/respond`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          responderName: name.trim(),
          requestId: request.current.id,
        }),
      });
      const data = (await response.json()) as { error?: string; ticket: ConversationTicket };
      if (!response.ok) {
        throw new Error(data.error || "Unable to send this reply");
      }
      refreshRef.current(data.ticket);
      nearBottom.current = true;
      setMessage("");
      request.current = null;
    } catch (cause) {
      if (cause instanceof Error) {
        setError(cause.message);
      }
    } finally {
      setSending(false);
    }
  }
  async function sync() {
    setSyncing(true);
    setError("");
    try {
      const response = await fetch("/tickets/email/sync", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Unable to sync replies right now");
      }
      await refresh();
    } catch (cause) {
      if (cause instanceof Error) {
        setError(cause.message);
      }
    } finally {
      setSyncing(false);
    }
  }
  async function retry(id: string) {
    setError("");
    try {
      const response = await fetch(
        `/tickets/${encodeURIComponent(ticketNumber)}/messages/${encodeURIComponent(id)}/retry`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) {
        throw new Error("Unable to retry this reply");
      }
      await refresh();
    } catch (cause) {
      if (cause instanceof Error) {
        setError(cause.message);
      }
    }
  }
  let syncLabel = "Email Sync Not Configured";
  if (inbox?.configured) {
    syncLabel = "Waiting For Email Sync";
  }
  if (inbox?.lastSyncAt) {
    syncLabel = `Last Synced ${new Date(inbox.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (inbox?.hasError) {
    syncLabel = "Email Sync Needs Attention";
  }
  return (
    <section
      aria-labelledby="ticket-messages-title"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-white"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <h3 id="ticket-messages-title" className="text-label text-ink">
            Messages
          </h3>
          <p role="status" className="mt-1 text-caption text-ink-subtle">
            {syncLabel}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={syncing || !inbox?.configured}
          onClick={() => void sync()}
        >
          Sync Replies
        </Button>
      </div>
      <div
        role="log"
        ref={thread}
        aria-label="Ticket Conversation"
        aria-live="polite"
        onScroll={(event) => {
          const element = event.currentTarget;
          nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
        }}
        className="min-h-16 min-w-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-slate-50/70 px-3 py-4 sm:px-4 [overflow-wrap:anywhere]"
      >
        {messages.length === 0 && (
          <p className="py-8 text-center text-body text-ink-subtle">
            Messages will appear here when the conversation starts.
          </p>
        )}
        {messages.map((entry, index) => {
          const id = entry.id || String(index);
          const day = messageDay(entry.timestamp);
          const previous = messages[index - 1];
          const showDay =
            !previous ||
            new Date(previous.timestamp).toDateString() !==
              new Date(entry.timestamp).toDateString();
          let status = "Received";
          if (entry.isTeamResponse) {
            status = "Sent";
          }
          if (entry.status === "PENDING") {
            status = "Queued";
          } else if (entry.status === "SENDING") {
            status = "Sending";
          } else if (entry.status === "FAILED") {
            status = "Failed";
          } else if (entry.status === "UNKNOWN") {
            status = "Delivery Unconfirmed";
          }
          return (
            <Fragment key={id}>
              {showDay && (
                <div className="flex items-center gap-3" role="separator" aria-label={day}>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-caption font-medium text-ink-subtle">{day}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <div
                className={cn(
                  "flex min-w-0 items-end gap-2",
                  entry.isTeamResponse && "flex-row-reverse",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white text-caption font-medium text-ink-subtle",
                    entry.isTeamResponse && "border-slate-900 bg-slate-900 text-white",
                  )}
                >
                  {senderInitials(entry.sender)}
                </span>
                <div className="min-w-0 max-w-[calc(100%-2.25rem)] space-y-1.5 sm:max-w-[80%]">
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-ink-subtle",
                      entry.isTeamResponse && "justify-end",
                    )}
                  >
                    <span className="font-medium text-ink">{entry.sender}</span>
                    <time
                      dateTime={entry.timestamp}
                      title={new Date(entry.timestamp).toLocaleString()}
                    >
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl rounded-bl-sm border bg-white px-3 py-2.5 text-body leading-relaxed text-ink",
                      entry.isTeamResponse &&
                        "rounded-bl-2xl rounded-br-sm border-slate-900 bg-slate-900 text-white",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{entry.message}</p>
                  </div>
                  {entry.quotedText && (
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setShowQuoted((current) => {
                            if (current.includes(id)) {
                              return current.filter((value) => value !== id);
                            }
                            return [...current, id];
                          })
                        }
                      >
                        Quoted Email
                      </Button>
                      {showQuoted.includes(id) && (
                        <p className="whitespace-pre-wrap break-words border-l-2 pl-3 text-caption text-ink-subtle">
                          {entry.quotedText}
                        </p>
                      )}
                    </div>
                  )}
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-2 text-caption text-ink-subtle",
                      entry.isTeamResponse && "justify-end",
                    )}
                  >
                    <span>{status}</span>
                    {entry.id && ["FAILED", "UNKNOWN"].includes(entry.status || "") && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void retry(entry.id || "")}
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                  {entry.status === "UNKNOWN" && (
                    <p className="text-caption text-ink-subtle">
                      Check your inbox before retrying because the earlier email may have been sent.
                    </p>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
      <form
        noValidate
        onSubmit={(event) => void send(event)}
        className="max-h-[50dvh] min-h-0 min-w-0 space-y-2 overflow-y-auto border-t bg-white p-3 sm:p-4"
      >
        <div className="min-w-0">
          <Label htmlFor="ticket-response-message" className="sr-only">
            Response Message
          </Label>
          <Textarea
            id="ticket-response-message"
            className="h-32 min-h-32 min-w-0 resize-y"
            value={message}
            maxLength={20000}
            aria-required="true"
            disabled={sending}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey) &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Write a reply..."
            rows={4}
          />
        </div>
        {error && (
          <p role="alert" className="text-body text-destructive [overflow-wrap:anywhere]">
            {error}
          </p>
        )}
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <Label htmlFor="ticket-responder-name" className="text-caption text-ink-subtle">
            From
          </Label>
          <Input
            id="ticket-responder-name"
            aria-label="Your Name"
            className="min-w-0 max-w-48 max-sm:h-8 max-sm:text-body"
            value={name}
            maxLength={120}
            aria-required="true"
            disabled={sending}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
          />
          <Button
            type="submit"
            aria-label="Send Response"
            disabled={sending}
            className="shrink-0 max-sm:h-8"
          >
            <HugeiconsIcon icon={ArrowUp02Icon} className="h-4 w-4" />
            Send
          </Button>
        </div>
      </form>
    </section>
  );
}
