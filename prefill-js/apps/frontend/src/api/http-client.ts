// Shared fetch wrapper: unwraps the {data} envelope, throws ApiRequestError with the server's code/message.
import type { ApiEnvelope, ApiErrorBody } from "@/types/api";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4500/api";

export class ApiRequestError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  readonly details: ApiErrorBody["details"];

  constructor(httpStatus: number, errorBody: ApiErrorBody) {
    super(errorBody.message);
    this.httpStatus = httpStatus;
    this.code = errorBody.code;
    this.details = errorBody.details;
  }
}

export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function requestJson<ResponseData>(path: string, init: RequestInit = {}): Promise<ResponseData> {
  const response = await fetch(buildApiUrl(path), init);
  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope<ResponseData>;
  if (!response.ok || envelope.error) {
    throw new ApiRequestError(response.status, envelope.error || { code: "HTTP_ERROR", message: `${response.status} ${response.statusText}` });
  }
  return envelope.data as ResponseData;
}

export function sendJson<ResponseData>(path: string, method: "POST" | "PUT" | "DELETE", requestBody?: unknown): Promise<ResponseData> {
  return requestJson<ResponseData>(path, {
    method,
    headers: requestBody === undefined ? undefined : { "Content-Type": "application/json" },
    body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
  });
}
