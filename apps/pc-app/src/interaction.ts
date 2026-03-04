export interface HitBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PointerPosition {
  x: number;
  y: number;
}

export interface InteractionStateInput {
  pointer: PointerPosition;
  modelBounds: HitBounds;
}

export function isPointerInsideModel(
  pointer: PointerPosition,
  bounds: HitBounds
): boolean {
  const inX = pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width;
  const inY = pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
  return inX && inY;
}

export function shouldIgnoreMouseEvents(input: InteractionStateInput): boolean {
  return !isPointerInsideModel(input.pointer, input.modelBounds);
}

export function selectRenderFps(options: {
  isInteracting: boolean;
  isAnimating: boolean;
  lowPowerMode?: boolean;
}): number {
  if (options.isInteracting) return 60;
  if (options.isAnimating) return options.lowPowerMode ? 24 : 30;
  return 10;
}

