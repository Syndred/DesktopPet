export const APP_ERROR_CODES = {
  AUTH_UNAUTHORIZED: "AUTH_UNAUTHORIZED",
  AUTH_FORBIDDEN: "AUTH_FORBIDDEN",
  VALIDATION_INVALID_PAYLOAD: "VALIDATION_INVALID_PAYLOAD",
  BATTLE_INVALID_ACTION: "BATTLE_INVALID_ACTION",
  BATTLE_ROOM_NOT_FOUND: "BATTLE_ROOM_NOT_FOUND",
  TERRITORY_CONFLICT: "TERRITORY_CONFLICT",
  SYSTEM_INTERNAL_ERROR: "SYSTEM_INTERNAL_ERROR"
} as const;

export type AppErrorCode =
  (typeof APP_ERROR_CODES)[keyof typeof APP_ERROR_CODES];

export interface AppError {
  code: AppErrorCode;
  message: string;
  recoverable: boolean;
  httpStatus: number;
}

const ERROR_META: Record<AppErrorCode, Pick<AppError, "recoverable" | "httpStatus">> =
  {
    AUTH_UNAUTHORIZED: { recoverable: true, httpStatus: 401 },
    AUTH_FORBIDDEN: { recoverable: false, httpStatus: 403 },
    VALIDATION_INVALID_PAYLOAD: { recoverable: true, httpStatus: 400 },
    BATTLE_INVALID_ACTION: { recoverable: true, httpStatus: 422 },
    BATTLE_ROOM_NOT_FOUND: { recoverable: true, httpStatus: 404 },
    TERRITORY_CONFLICT: { recoverable: true, httpStatus: 409 },
    SYSTEM_INTERNAL_ERROR: { recoverable: false, httpStatus: 500 }
  };

export function isAppErrorCode(value: string): value is AppErrorCode {
  return Object.values(APP_ERROR_CODES).includes(value as AppErrorCode);
}

export function buildAppError(code: AppErrorCode, message?: string): AppError {
  const meta = ERROR_META[code];
  return {
    code,
    message: message ?? code,
    recoverable: meta.recoverable,
    httpStatus: meta.httpStatus
  };
}

