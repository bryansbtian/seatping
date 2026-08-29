import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatPhoneParts } from "@shared/phone";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { assignTable, fetchLiveFloor } from "@/lib/floorLiveApi";
import { allTables, candidateTablesForParty, type LiveFloor } from "@/lib/floorLive";
import AssignTableDialog, {
  type AssignSelection,
  type AssignTarget,
} from "@/components/floor/AssignTableDialog";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { GuestStatusBadge } from "@/components/GuestBadge";
import { Clock, ListOrdered, RefreshCw, Users } from "lucide-react";
import { queueFullName, queueLegacyKey, waitedMinutes, type QueueRow } from "@/lib/queueStats";

type QueueEtaSummary = {
  status: "ETA" | "NO_CAPACITY";
  displayText: string;
};

const POLL_INTERVAL_MS = 15000;
const ARRIVAL_WINDOW_MS = 5 * 60 * 1000;

function guestCountKey(n: number): TKey {
  if (n === 1) {
    return "dash.guestOne";
  }
  return "dash.guestMany";
}

function contactLine(row: QueueRow): string | null {
  const method = row.notificationMethod;
  if (method === "email") {
    if (row.email) {
      return `Email: ${row.email}`;
    }
    return "Email";
  }
  if (method === "sms" || method === "whatsapp") {
    const phone = formatPhoneParts(row.countryCode, row.phoneNumber);
    let label = "SMS";
    if (method === "whatsapp") {
      label = "WhatsApp";
    }
    if (phone) {
      return `${label}: ${phone}`;
    }
    return label;
  }
  return null;
}

const QueueManager = ({
  me,
  setMe,
  locationId,
}: {
  me: any;
  setMe: (user: any) => void;
  locationId: string;
}) => {
  const { t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [floor, setFloor] = useState<LiveFloor | null>(null);
  const [floorError, setFloorError] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [queueEtas, setQueueEtas] = useState<Record<string, QueueEtaSummary>>({});
  const [now, setNow] = useState(() => new Date());

  const location = useMemo(() => {
    return (me?.locations || []).find((loc: any) => loc.id === locationId) ?? null;
  }, [me, locationId]);

  const queueRows: QueueRow[] = useMemo(() => {
    return (location?.queue || []) as QueueRow[];
  }, [location]);

  const loadFloor = useCallback(async () => {
    try {
      const data = await fetchLiveFloor(locationId);
      setFloor(data);
      setFloorError(false);
    } catch {
      setFloorError(true);
    }
  }, [locationId]);

  useEffect(() => {
    loadFloor();
    const timer = setInterval(loadFloor, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadFloor]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshMe = useCallback(async () => {
    const updated = await api("/auth/business/me");
    setMe(updated.user);
  }, [setMe]);

  const loadQueueEtas = useCallback(async () => {
    if (!me?.username) {
      setQueueEtas({});
      return;
    }
    try {
      const response = await api(
        `/auth/business/${me.username}/locations/${locationId}/queue-etas`,
      );
      const next: Record<string, QueueEtaSummary> = {};
      for (const eta of response.etas ?? []) {
        if (eta?.queueToken && eta?.displayText) {
          next[eta.queueToken] = { status: eta.status ?? "ETA", displayText: eta.displayText };
        }
      }
      setQueueEtas(next);
    } catch {
      setQueueEtas({});
    }
  }, [locationId, me?.username]);

  useEffect(() => {
    loadQueueEtas();
    const timer = setInterval(loadQueueEtas, 30000);
    return () => clearInterval(timer);
  }, [loadQueueEtas, queueRows.length]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>, successKey: TKey, name: string) => {
      setBusy(true);
      try {
        await action();
        await refreshMe();
        await loadFloor();
        toast({ title: t(successKey), description: name });
      } catch (err: any) {
        toast({
          title: t("dash.toast.admitFailed.title"),
          description: err?.message || t("common.pleaseTryAgain"),
          variant: "destructive",
        });
      } finally {
        setBusy(false);
      }
    },
    [refreshMe, loadFloor, toast, t],
  );

  const legacyKey = queueLegacyKey;
  const fullName = queueFullName;

  const admit = (row: QueueRow) =>
    runAction(
      () => api(`/auth/business/${me?.username}/queue/${legacyKey(row)}/admit`, { method: "POST" }),
      "dash.toast.admitted.title",
      fullName(row),
    );

  const confirmArrival = (row: QueueRow) =>
    runAction(
      () =>
        api(`/auth/business/${me?.username}/admitted/${legacyKey(row)}/confirm-arrival`, {
          method: "POST",
        }),
      "dash.toast.arrivalConfirmed.title",
      fullName(row),
    );

  const markNoShow = (row: QueueRow) =>
    runAction(
      () =>
        api(`/auth/business/${me?.username}/admitted/${legacyKey(row)}/mark-no-show`, {
          method: "POST",
        }),
      "dash.toast.noShow.title",
      fullName(row),
    );

  const remove = (row: QueueRow) =>
    runAction(
      () => api(`/auth/business/${me?.username}/queue/${legacyKey(row)}`, { method: "DELETE" }),
      "dash.toast.removed.title",
      fullName(row),
    );

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await refreshMe();
      await loadFloor();
      await loadQueueEtas();
      toast({
        title: t("dash.toast.queueRefreshed.title"),
        description: t("dash.toast.queueRefreshed.desc"),
      });
    } catch (err: any) {
      toast({
        title: t("dash.toast.refreshFailed.title"),
        description: err?.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [loadFloor, loadQueueEtas, refreshMe, t, toast]);

  const pendingAdmitted: QueueRow[] = ((location?.admittedCustomers || []) as QueueRow[]).filter(
    (row) => row.finalStatus === "pending",
  );

  const assignedTables = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const table of allTables(floor?.rooms ?? [])) {
      const queueEntryId = table.currentAssignment?.queueEntryId;
      if (queueEntryId && !map.has(queueEntryId)) {
        map.set(queueEntryId, { id: table.id, name: table.name });
      }
    }
    return map;
  }, [floor]);

  const handleSeat = useCallback(
    async (selection: AssignSelection) => {
      if (!assignTarget?.queueEntryId) {
        return;
      }
      const row = pendingAdmitted.find((candidate) => candidate.id === assignTarget.queueEntryId);
      if (!row) {
        return;
      }
      const body: Record<string, unknown> = {
        partySize: assignTarget.partySize,
        queueEntryId: assignTarget.queueEntryId,
      };
      if (selection.tableIds.length > 1) {
        body.tableIds = selection.tableIds;
      } else {
        body.tableId = selection.tableIds[0];
      }
      await runAction(
        async () => {
          await assignTable(locationId, body);
          await api(`/auth/business/${me?.username}/admitted/${legacyKey(row)}/confirm-arrival`, {
            method: "POST",
          });
        },
        "dash.toast.arrivalConfirmed.title",
        `${assignTarget.name}, ${selection.name}`,
      );
      setAssignTarget(null);
    },
    [assignTarget, legacyKey, locationId, me?.username, pendingAdmitted, runAction],
  );

  const seatAdmitted = (row: QueueRow) => {
    if (!row.id) {
      return;
    }
    const assignedTable = assignedTables.get(row.id);
    if (assignedTable) {
      confirmArrival(row);
      return;
    }
    if (allTables(floor?.rooms ?? []).length === 0) {
      confirmArrival(row);
      return;
    }
    const recommendation = candidateTablesForParty(floor?.rooms ?? [], row.numGuests, null)[0];
    setAssignTarget({
      name: fullName(row),
      partySize: row.numGuests,
      queueEntryId: row.id,
      recommendedTableId: recommendation?.id ?? null,
    });
  };

  let queueCountKey: TKey = "dash.queue.customerMany";
  if (queueRows.length === 1) {
    queueCountKey = "dash.queue.customerOne";
  }

  let listBody: React.ReactNode;
  if (queueRows.length === 0) {
    listBody = (
      <BusinessEmptyState
        icon={Users}
        title={t("queue.empty.title")}
        body={t("queue.empty.body")}
        className="py-10"
        testId="queue-empty"
      />
    );
  } else {
    listBody = (
      <ul className="space-y-3" data-testid="queue-list">
        {queueRows.map((row, index) => {
          const waited = waitedMinutes(row.joinedAt, now);
          let joinedLabel = t("dash.justNow");
          if (waited !== null && waited > 0 && waited < 60) {
            joinedLabel = t("dash.minAgo", { n: waited });
          }
          if (waited !== null && waited >= 60) {
            joinedLabel = t("dash.hourMinAgo", {
              h: Math.floor(waited / 60),
              m: waited % 60,
            });
          }
          let eta: QueueEtaSummary | null = null;
          if (row.queueToken) {
            eta = queueEtas[row.queueToken] ?? null;
          }
          let etaLabel: string | null = null;
          if (eta && eta.status === "NO_CAPACITY") {
            etaLabel = t("dash.queue.noCapacity");
          } else if (eta) {
            etaLabel = t("dash.queue.estimatedWait", { text: eta.displayText });
          }

          return (
            <li key={legacyKey(row)} data-testid={`queue-row-${row.id}`}>
              <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 transition-colors hover:bg-slate-100 md:flex-row md:items-center md:justify-between md:p-4">
                <div className="flex min-w-0 items-start gap-3 md:gap-4">
                  <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold leading-none tabular-nums text-slate-700 shadow-sm md:text-sm">
                    #{index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800 md:text-base">
                      {fullName(row)}
                      {row.isReturning && <GuestStatusBadge returning />}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-600 md:text-sm">
                      <span>{t("dash.queue.joined", { time: joinedLabel })}</span>
                      <span className="text-slate-400">&middot;</span>
                      <span>{t(guestCountKey(row.numGuests), { n: row.numGuests })}</span>
                    </div>
                    {contactLine(row) && (
                      <p className="mt-1 break-all text-xs text-slate-500 md:text-sm">
                        {contactLine(row)}
                      </p>
                    )}
                    {etaLabel && (
                      <p className="mt-1 text-xs font-medium text-indigo-600 md:text-sm">
                        {etaLabel}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 md:gap-3">
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1 md:flex-none"
                    disabled={busy}
                    data-testid={`queue-admit-${row.id}`}
                    onClick={() => admit(row)}
                  >
                    {t("dash.admit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructiveOutline"
                    className="flex-1 md:flex-none"
                    disabled={busy}
                    data-testid={`queue-remove-${row.id}`}
                    onClick={() => remove(row)}
                  >
                    {t("dash.remove")}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card className="flex flex-1 flex-col border border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b border-slate-200 p-4 md:p-6">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-800 md:text-xl">
              <ListOrdered className="h-5 w-5 shrink-0" aria-hidden="true" />
              {t("dash.queue.title")}
            </CardTitle>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button variant="outline" disabled={busy} onClick={refresh}>
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
              <span className="hidden sm:inline">{t("common.refresh")}</span>
            </Button>
            <Badge className="border-0 bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
              {t(queueCountKey, { n: queueRows.length })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col p-4 md:p-6">
          {floorError && (
            <p className="mb-3 text-xs text-amber-700" data-testid="queue-floor-error">
              {t("queue.floorUnavailable")}
            </p>
          )}
          {listBody}
        </CardContent>
      </Card>

      {pendingAdmitted.length > 0 && (
        <Card
          className="border border-amber-200 bg-amber-50 shadow-sm"
          data-testid="queue-awaiting"
        >
          <CardHeader className="border-b border-amber-200 p-4 md:p-6">
            <CardTitle className="flex items-center gap-2 text-lg text-amber-800 md:text-xl">
              <Clock className="h-5 w-5" aria-hidden="true" />
              {t("dash.awaiting.title")}
            </CardTitle>
            <CardDescription className="text-sm text-amber-700">
              {t("dash.awaiting.desc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            <ul className="space-y-3 md:space-y-4">
              {pendingAdmitted.map((row) => {
                const admitted = new Date(row.admittedAt || row.joinedAt);
                const elapsed = Math.max(0, now.getTime() - admitted.getTime());
                const remaining = Math.max(0, ARRIVAL_WINDOW_MS - elapsed);
                const expired = remaining === 0;
                let countdownLabel = "!";
                if (!expired) {
                  const minutes = Math.floor(remaining / 60000);
                  const seconds = Math.floor((remaining % 60000) / 1000);
                  countdownLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;
                }
                const admittedMinutes = waitedMinutes(row.admittedAt || row.joinedAt, now);
                let admittedLabel = t("dash.justNow");
                if (admittedMinutes !== null && admittedMinutes > 0 && admittedMinutes < 60) {
                  admittedLabel = t("dash.minAgo", { n: admittedMinutes });
                }
                if (admittedMinutes !== null && admittedMinutes >= 60) {
                  admittedLabel = t("dash.hourMinAgo", {
                    h: Math.floor(admittedMinutes / 60),
                    m: admittedMinutes % 60,
                  });
                }

                return (
                  <li
                    key={legacyKey(row)}
                    className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-white p-3 md:flex-row md:items-center md:justify-between md:p-4"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-semibold leading-none tabular-nums text-white">
                        {countdownLabel}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800 md:text-base">
                          {fullName(row)}
                          {row.isReturning && <GuestStatusBadge returning />}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-600 md:text-sm">
                          <span>{t("dash.admitted", { time: admittedLabel })}</span>
                          <span className="text-slate-400">&middot;</span>
                          <span>{t(guestCountKey(row.numGuests), { n: row.numGuests })}</span>
                          {expired && (
                            <>
                              <span className="hidden text-slate-400 md:inline">&middot;</span>
                              <span className="basis-full font-semibold text-red-600 md:basis-auto">
                                {t("dash.timeExpired")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 md:gap-3">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1 md:flex-none"
                        disabled={busy || !row.id}
                        data-testid={`queue-seat-${row.id}`}
                        onClick={() => seatAdmitted(row)}
                      >
                        {t("queue.action.seat")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructiveOutline"
                        className="flex-1 md:flex-none"
                        disabled={busy}
                        data-testid={`queue-noshow-${row.id}`}
                        onClick={() => markNoShow(row)}
                      >
                        {t("dash.noShow")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <AssignTableDialog
        open={Boolean(assignTarget)}
        target={assignTarget}
        rooms={floor?.rooms ?? []}
        busy={busy}
        onOpenChange={(next) => {
          if (!next) {
            setAssignTarget(null);
          }
        }}
        onConfirm={handleSeat}
        onResolve={async () => {
          setAssignTarget(null);
        }}
      />
    </div>
  );
};

export default QueueManager;
