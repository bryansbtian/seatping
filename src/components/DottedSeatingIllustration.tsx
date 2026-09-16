import { cn } from "@/lib/utils";

const VIEW_WIDTH = 944;
const VIEW_HEIGHT = 372;

const FLOOR_Y = 318;
const CHAIR_CENTERS = [220, 472, 724];
const FOCUS_CENTER = CHAIR_CENTERS[1];

const BACKREST = { top: 100, bottom: 220, halfWidth: 70, radius: 30 };
const SEAT = { top: 220, bottom: 248, halfWidth: 76, radius: 10 };

const LEG_FOOT_Y = 351;

const LEGS = [
  { topOffset: -60, bottomOffset: -54, bottom: FLOOR_Y },
  { topOffset: 60, bottomOffset: 54, bottom: FLOOR_Y },
  { topOffset: -68, bottomOffset: -78, bottom: LEG_FOOT_Y },
  { topOffset: 68, bottomOffset: 78, bottom: LEG_FOOT_Y },
];

const PINGS = [
  { x1: FOCUS_CENTER, y1: 51, x2: FOCUS_CENTER, y2: 14 },
  { x1: FOCUS_CENTER - 43, y1: 65, x2: FOCUS_CENTER - 70, y2: 38 },
  { x1: FOCUS_CENTER + 43, y1: 65, x2: FOCUS_CENTER + 70, y2: 38 },
];

function linePath(x1: number, y1: number, x2: number, y2: number) {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function backrestPath(centerX: number) {
  const { top, bottom, halfWidth, radius } = BACKREST;
  const left = centerX - halfWidth;
  const right = centerX + halfWidth;
  return [
    `M ${left} ${bottom}`,
    `L ${left} ${top + radius}`,
    `A ${radius} ${radius} 0 0 1 ${left + radius} ${top}`,
    `L ${right - radius} ${top}`,
    `A ${radius} ${radius} 0 0 1 ${right} ${top + radius}`,
    `L ${right} ${bottom}`,
  ].join(" ");
}

function seatPath(centerX: number) {
  const { top, bottom, halfWidth, radius } = SEAT;
  const left = centerX - halfWidth;
  const right = centerX + halfWidth;
  return [
    `M ${left + radius} ${top}`,
    `L ${right - radius} ${top}`,
    `A ${radius} ${radius} 0 0 1 ${right} ${top + radius}`,
    `L ${right} ${bottom - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `L ${left + radius} ${bottom}`,
    `A ${radius} ${radius} 0 0 1 ${left} ${bottom - radius}`,
    `L ${left} ${top + radius}`,
    `A ${radius} ${radius} 0 0 1 ${left + radius} ${top}`,
    "Z",
  ].join(" ");
}

function chairPaths(centerX: number) {
  const paths = [backrestPath(centerX), seatPath(centerX)];
  for (const leg of LEGS) {
    paths.push(
      linePath(centerX + leg.topOffset, SEAT.bottom, centerX + leg.bottomOffset, leg.bottom),
    );
  }
  return paths;
}

function legOffsetAtFloor(leg: (typeof LEGS)[number]) {
  const travel = (FLOOR_Y - SEAT.bottom) / (leg.bottom - SEAT.bottom);
  return leg.topOffset + (leg.bottomOffset - leg.topOffset) * travel;
}

const FLOOR_GAP_HALF_WIDTH = Math.max(...LEGS.map((leg) => Math.abs(legOffsetAtFloor(leg))));

const FLOOR_INSET = 4;

function floorPaths() {
  const paths = [];
  let start = FLOOR_INSET;
  for (const centerX of CHAIR_CENTERS) {
    paths.push(linePath(start, FLOOR_Y, centerX - FLOOR_GAP_HALF_WIDTH, FLOOR_Y));
    start = centerX + FLOOR_GAP_HALF_WIDTH;
  }
  paths.push(linePath(start, FLOOR_Y, VIEW_WIDTH - FLOOR_INSET, FLOOR_Y));
  return paths;
}

export type SeatingIllustrationVariant = "wide" | "compact";

const COMPACT_SIDE_MARGIN = 34;
const COMPACT_VERTICAL_BLEED = 4;
const COMPACT_LEFT = CHAIR_CENTERS[0] - SEAT.halfWidth - COMPACT_SIDE_MARGIN;
const COMPACT_RIGHT =
  CHAIR_CENTERS[CHAIR_CENTERS.length - 1] + SEAT.halfWidth + COMPACT_SIDE_MARGIN;

const VARIANTS: Record<
  SeatingIllustrationVariant,
  { viewBox: string; dotSize: number; dotSpacing: number }
> = {
  wide: { viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`, dotSize: 5.6, dotSpacing: 10 },
  compact: {
    viewBox: `${COMPACT_LEFT} ${-COMPACT_VERTICAL_BLEED} ${COMPACT_RIGHT - COMPACT_LEFT} ${VIEW_HEIGHT + COMPACT_VERTICAL_BLEED * 2}`,
    dotSize: 7.5,
    dotSpacing: 13,
  },
};

const DottedSeatingIllustration = ({
  className,
  variant = "wide",
}: {
  className?: string;
  variant?: SeatingIllustrationVariant;
}) => {
  const { viewBox, dotSize, dotSpacing } = VARIANTS[variant];

  return (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full text-indigo-600", className)}
      data-testid="dotted-seating-illustration"
      data-variant={variant}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={dotSize}
        strokeLinecap="round"
        strokeDasharray={`0.01 ${dotSpacing}`}
      >
        {floorPaths().map((d, index) => (
          <path key={`floor-${index}`} d={d} />
        ))}
        {CHAIR_CENTERS.flatMap((centerX) =>
          chairPaths(centerX).map((d, index) => <path key={`chair-${centerX}-${index}`} d={d} />),
        )}
        {PINGS.map((ping) => (
          <path
            key={`ping-${ping.x1}-${ping.y1}`}
            d={linePath(ping.x1, ping.y1, ping.x2, ping.y2)}
          />
        ))}
      </g>
    </svg>
  );
};

export default DottedSeatingIllustration;
