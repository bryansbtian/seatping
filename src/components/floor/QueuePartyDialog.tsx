import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLang } from "@/lib/i18n";
import type { WaitingParty } from "@/lib/floorLive";

type QueuePartyDialogProps = {
  open: boolean;
  party: WaitingParty | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onAdmit: (queueEntryId: string) => Promise<void>;
  onRemove: (queueEntryId: string) => Promise<void>;
};

const QueuePartyDialog = ({
  open,
  party,
  busy,
  onOpenChange,
  onAdmit,
  onRemove,
}: QueuePartyDialogProps) => {
  const { t } = useLang();

  if (!party) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="queue-party-dialog">
        <DialogHeader>
          <DialogTitle>{t("floor.live.waitingActionTitle")}</DialogTitle>
          <DialogDescription asChild>
            <span className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
              <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">
                {party.name} &middot; {t("floor.live.partyOf", { n: party.partySize })} &middot;{" "}
                {t("floor.live.waitingFor", { n: party.waitingMinutes })}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600" role="status">
          {t("floor.live.waitingActionBody")}
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructiveOutline"
            disabled={busy}
            title={t("floor.live.removeHint")}
            data-testid="queue-party-remove"
            onClick={() => onRemove(party.id)}
          >
            {t("floor.live.remove")}
          </Button>
          <Button
            disabled={busy}
            title={t("floor.live.admitHint")}
            data-testid="queue-party-admit"
            onClick={() => onAdmit(party.id)}
          >
            {t("floor.live.admit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QueuePartyDialog;
