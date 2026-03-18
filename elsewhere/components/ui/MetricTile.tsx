import {
  VolumeX,
  Volume1,
  Volume2,
  Zap,
  Plug,
  BatteryMedium,
  Headphones,
  User,
  MessagesSquare,
} from "lucide-react";

type MetricType = "noise" | "vibes" | "tables" | "outlets";

interface MetricTileProps {
  type: MetricType;
  value: string | null;
  /** Optional class for icon/dots; default text-secondary per Figma */
  iconClassName?: string;
}

const LOW_DATA = "Not enough data";

const NOISE_LABELS: Record<string, string> = {
  Silent: "SILENT",
  Quiet: "QUIET",
  Vibrant: "VIBRANT",
};

const VIBE_LABELS: Record<string, string> = {
  Focused: "FOCUSED",
  Casual: "CASUAL",
  Social: "SOCIAL",
};

const TABLES_LABELS: Record<string, string> = {
  Limited: "LIMITED",
  Mixed: "MIXED",
  Ideal: "IDEAL",
};

/** Display labels per mockup: None → SCARCE, Limited → SOME, Ample → AMPLE */
const OUTLETS_LABELS: Record<string, string> = {
  None: "SCARCE",
  Limited: "SOME",
  Ample: "AMPLE",
};

const TYPE_OVERLINE: Record<MetricType, string> = {
  noise: "NOISE",
  vibes: "VIBES",
  tables: "TABLES",
  outlets: "OUTLETS",
};

type TileContent = {
  middle: React.ReactNode;
  bottomText: string;
  lowData: boolean;
};

function getNoiseContent(
  value: string | null,
  iconClassName: string,
): TileContent {
  if (value === null) {
    return { middle: null, bottomText: LOW_DATA, lowData: true };
  }
  const Icon =
    value === "Silent"
      ? VolumeX
      : value === "Quiet"
        ? Volume1
        : value === "Vibrant"
          ? Volume2
          : null;
  const label = NOISE_LABELS[value] ?? value.toUpperCase();
  return {
    middle: Icon ? (
      <Icon size={20} className={`shrink-0 ${iconClassName}`} aria-hidden />
    ) : null,
    bottomText: label,
    lowData: false,
  };
}

function getVibesContent(
  value: string | null,
  iconClassName: string,
): TileContent {
  if (value === null) {
    return { middle: null, bottomText: LOW_DATA, lowData: true };
  }
  const Icon =
    value === "Focused"
      ? Headphones
      : value === "Casual"
        ? User
        : value === "Social"
          ? MessagesSquare
          : null;
  const label = VIBE_LABELS[value] ?? value.toUpperCase();
  return {
    middle: Icon ? (
      <Icon size={20} className={`shrink-0 ${iconClassName}`} aria-hidden />
    ) : null,
    bottomText: label,
    lowData: false,
  };
}

function getTablesContent(
  value: string | null,
  _iconClassName: string,
): TileContent {
  if (value === null) {
    return { middle: null, bottomText: LOW_DATA, lowData: true };
  }
  const filled =
    value === "Limited" ? 1 : value === "Mixed" ? 3 : value === "Ideal" ? 5 : 0;
  const label = TABLES_LABELS[value] ?? value.toUpperCase();
  return {
    middle:
      filled > 0 ? (
        <span className="flex gap-0.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`rounded-full ${i <= filled ? "bg-accent" : "bg-surface"}`}
              style={{ width: "6px", height: "6px" }}
            />
          ))}
        </span>
      ) : null,
    bottomText: label,
    lowData: false,
  };
}

function getOutletsContent(
  value: string | null,
  iconClassName: string,
): TileContent {
  if (value === null) {
    return { middle: null, bottomText: LOW_DATA, lowData: true };
  }
  // Mockup: SCARCE = battery+lightning, SOME = plug, AMPLE = wider/double plug
  const Icon =
    value === "None"
      ? BatteryMedium
      : value === "Limited"
        ? Plug
        : value === "Ample"
          ? Zap
          : null;
  const label = OUTLETS_LABELS[value] ?? value.toUpperCase();
  return {
    middle: Icon ? (
      <Icon size={20} className={`shrink-0 ${iconClassName}`} aria-hidden />
    ) : null,
    bottomText: label,
    lowData: false,
  };
}

export function MetricTile({
  type,
  value,
  iconClassName = "text-accent",
}: MetricTileProps) {
  const content =
    type === "noise"
      ? getNoiseContent(value, iconClassName)
      : type === "vibes"
        ? getVibesContent(value, iconClassName)
        : type === "tables"
          ? getTablesContent(value, iconClassName)
          : getOutletsContent(value, iconClassName);

  return (
    <div className="flex min-w-0 w-full flex-col items-center justify-center rounded-radius-sm bg-surface-alt px-4 py-8 text-center">
      <span className="text-ui-overline text-text-secondary uppercase">
        {TYPE_OVERLINE[type]}
      </span>
      <div className="flex min-h-[20px] items-center justify-center">
        {content.middle}
      </div>
      <span
        className={
          content.lowData
            ? "text-ui-label-s font-bold uppercase text-text-tertiary"
            : "text-ui-label-s font-bold uppercase text-text-secondary"
        }
      >
        {content.bottomText}
      </span>
    </div>
  );
}
