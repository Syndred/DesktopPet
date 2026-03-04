import { buildAppError, type AppError, type AppErrorCode } from "./errors.js";

export interface ApiSuccess<TData> {
  ok: true;
  requestId: string;
  data: TData;
}

export interface ApiFailure {
  ok: false;
  requestId: string;
  error: AppError;
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure;

export function ok<TData>(requestId: string, data: TData): ApiSuccess<TData> {
  return {
    ok: true,
    requestId,
    data
  };
}

export function fail(
  requestId: string,
  code: AppErrorCode,
  message?: string
): ApiFailure {
  return {
    ok: false,
    requestId,
    error: buildAppError(code, message)
  };
}

