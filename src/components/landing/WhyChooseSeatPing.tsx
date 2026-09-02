import { cn } from "@/lib/utils";
import {
  SECTION_PADDING,
  SECTION_CONTENT_GAP,
  SECTION_HEADING,
  SECTION_SUBTITLE,
  CARD_TITLE,
  CARD_DESCRIPTION,
} from "@/components/landing/section";

const SAMPLE_BUSINESS = "Cafe Milano";

const SAMPLE_GUEST = "Priya";

const JOIN_MESSAGE = `Hi ${SAMPLE_GUEST}! You've joined the queue at ${SAMPLE_BUSINESS}. You're #4 in line. We'll text you when it's your turn.`;

const TURN_MESSAGE = `Good news! It's your turn at ${SAMPLE_BUSINESS}. Please proceed to the host within the next 5 minutes. Thank you for using SeatPing!`;

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[16rem] rounded-[1.75rem] border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_40px_-28px_rgba(15,23,42,0.28)]">
      <div className="rounded-[1.35rem] bg-slate-50 px-3 pb-4 pt-3">
        <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-slate-200" />
        {children}
      </div>
    </div>
  );
}

function QueueStatusScreen() {
  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center">
        <p className="text-sm font-semibold text-slate-900">You are #4 in line</p>
        <p className="mt-0.5 text-caption text-slate-500">There are 3 parties ahead of you</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-center">
          <p className="text-caption text-slate-500">Estimated Wait</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-900">15-25 Minutes</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-center">
          <p className="text-caption text-slate-500">Notifications</p>
          <p className="mt-0.5 text-xs font-medium text-slate-900">SMS</p>
        </div>
      </div>
      <p className="text-center text-caption leading-snug text-slate-400">
        Wait time may change based on queue movement and upcoming reservations.
      </p>
    </div>
  );
}

function MessageThreadScreen() {
  return (
    <div className="space-y-2.5">
      <p className="text-center text-caption text-slate-400">Today 7:41 PM</p>
      <p className="max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-caption leading-relaxed text-slate-700">
        {JOIN_MESSAGE}
      </p>
      <p className="text-center text-caption text-slate-400">8:04 PM</p>
      <p className="max-w-[92%] rounded-2xl rounded-bl-md bg-indigo-600 px-3 py-2 text-caption leading-relaxed text-white">
        {TURN_MESSAGE}
      </p>
    </div>
  );
}

function YourTurnScreen() {
  return (
    <div className="space-y-2.5 text-center">
      <p className="text-base font-bold text-indigo-600">It&apos;s Your Turn!</p>
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-3 py-4">
        <p className="text-caption font-semibold uppercase tracking-wide text-slate-500">
          Please Arrive Within
        </p>
        <p className="mt-1 text-4xl font-bold leading-none tabular-nums text-indigo-600">4:32</p>
        <p className="mt-2 text-caption text-slate-500">Your spot will be held for 5 minutes.</p>
      </div>
    </div>
  );
}

const MOMENTS: { label: string; title: string; body: string; screen: React.ReactNode }[] = [
  {
    label: "At the door",
    title: "No Crowd in Your Entrance",
    body: "They scan the QR code, join in a few taps, and watch their place in line from their own phone instead of yours.",
    screen: <QueueStatusScreen />,
  },
  {
    label: "While they wait",
    title: "Nobody Has to Be Chased",
    body: "SeatPing sends the update over SMS, WhatsApp, or Email, so your host is not calling names into a full room.",
    screen: <MessageThreadScreen />,
  },
  {
    label: "When the table is ready",
    title: "The Turn Does Not Wait Forever",
    body: "The spot is held for five minutes while they walk back, then the queue keeps moving without you having to decide.",
    screen: <YourTurnScreen />,
  },
];

export function WhySeatPingSection() {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-t border-slate-200 bg-slate-50/60",
        SECTION_PADDING,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 left-0 h-72 w-[36rem] max-w-[90vw] rounded-full bg-indigo-100/40 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-7xl px-8 scroll-animate lg:px-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Why SeatPing
          </p>
          <h2 className={cn("mt-3", SECTION_HEADING)}>Your Guests Never Have to Stand and Wait</h2>
          <p className={cn("mt-4 max-w-2xl", SECTION_SUBTITLE)}>
            The rest of this page is what your team sees. This is what your guest sees: they scan a
            code at your door, walk away, and come back when their table is ready.
          </p>
        </div>

        <div className={cn(SECTION_CONTENT_GAP, "grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6")}>
          {MOMENTS.map((moment) => (
            <div key={moment.title}>
              <PhoneFrame>{moment.screen}</PhoneFrame>
              <div className="mt-5 text-center md:text-left">
                <p className="text-caption font-semibold uppercase tracking-wide text-indigo-600">
                  {moment.label}
                </p>
                <h3 className={cn("mt-1.5", CARD_TITLE)}>{moment.title}</h3>
                <p className={cn("mt-1.5", CARD_DESCRIPTION)}>{moment.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
