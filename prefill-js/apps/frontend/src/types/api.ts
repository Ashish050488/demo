// The backend's response envelope: {data} on success, {error} on failure.
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: { missing?: string[]; invalid?: { field: string; reason: string }[] };
}

export interface ApiEnvelope<ResponseData> {
  data?: ResponseData;
  error?: ApiErrorBody;
}
