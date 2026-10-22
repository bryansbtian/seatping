export type TicketMessageStatus =
  "RECEIVED" | "PENDING" | "SENDING" | "SENT" | "FAILED" | "UNKNOWN";
export type TicketChatMessage = {
  id?: string;
  sender: string;
  message: string;
  quotedText?: string | null;
  timestamp: string;
  isTeamResponse: boolean;
  status?: TicketMessageStatus;
};
export type TicketInboxStatus = {
  configured: boolean;
  lastSyncAt: string | null;
  hasError: boolean;
};
export function splitEmailReply(text: string): { message: string; quotedText: string | null } {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const quoteStart = lines.findIndex(
    (line) =>
      /^\s*>/.test(line) ||
      /^\s*(On .+wrote:|Pada .+menulis:|[-_]{3,}\s*(Original Message|Pesan Asli))/i.test(line),
  );
  if (quoteStart > 0) {
    const message = lines.slice(0, quoteStart).join("\n").trim();
    if (message) {
      return { message, quotedText: lines.slice(quoteStart).join("\n").trim() };
    }
  }
  return { message: normalized, quotedText: null };
}
