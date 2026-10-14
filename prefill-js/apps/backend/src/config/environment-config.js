// Values that change between machines. Defaults keep the demo local-only (loopback host).
export const APPLICATION_HOST = process.env.APPLICATION_HOST || "127.0.0.1";
export const APPLICATION_PORT = Number(process.env.APPLICATION_PORT) || 4500;
export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:3000";
export const ALLOWED_HOSTNAMES = (process.env.ALLOWED_HOSTNAMES || "127.0.0.1,localhost").split(",");
