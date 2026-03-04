export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayWorkArea {
  width: number;
  height: number;
}

export interface PetWindowConfig {
  width: number;
  height: number;
  transparent: boolean;
  frame: boolean;
  alwaysOnTop: boolean;
  skipTaskbar: boolean;
  resizable: boolean;
  hasShadow: boolean;
  backgroundColor: string;
}

export interface TrayMenuItem {
  id: "toggle-visibility" | "settings" | "pause-interaction" | "quit";
  label: string;
}

const DEFAULT_WINDOW_SIZE = 320;

export function createPetWindowConfig(): PetWindowConfig {
  return {
    width: DEFAULT_WINDOW_SIZE,
    height: DEFAULT_WINDOW_SIZE,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    backgroundColor: "#00000000"
  };
}

export function buildTrayMenuModel(): TrayMenuItem[] {
  return [
    { id: "toggle-visibility", label: "Show / Hide" },
    { id: "settings", label: "Settings" },
    { id: "pause-interaction", label: "Pause Interaction" },
    { id: "quit", label: "Quit" }
  ];
}

export function computeSnapPosition(
  bounds: WindowBounds,
  workArea: DisplayWorkArea,
  margin = 12
): WindowBounds {
  let nextX = bounds.x;
  let nextY = bounds.y;

  if (bounds.x < margin) nextX = margin;
  if (bounds.y < margin) nextY = margin;

  const rightOverflow = bounds.x + bounds.width > workArea.width - margin;
  if (rightOverflow) nextX = Math.max(margin, workArea.width - margin - bounds.width);

  const bottomOverflow = bounds.y + bounds.height > workArea.height - margin;
  if (bottomOverflow) {
    nextY = Math.max(margin, workArea.height - margin - bounds.height);
  }

  return { ...bounds, x: nextX, y: nextY };
}

export function serializeWindowBounds(bounds: WindowBounds): string {
  return JSON.stringify(bounds);
}

export function parseWindowBounds(raw: string): WindowBounds | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WindowBounds>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }
    return {
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height
    };
  } catch {
    return null;
  }
}

