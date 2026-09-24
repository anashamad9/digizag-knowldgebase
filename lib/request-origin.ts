// Keep the development UI and API allowlists in sync.
export const developmentHosts = ["192.168.0.132"];

export function isAllowedOrigin(
  request: Request,
  appUrl: string | undefined,
  development: boolean,
) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const target = new URL(request.url);
  if (origin === target.origin || origin === appUrl) return true;
  if (!development) return false;
  try {
    const source = new URL(origin);
    return (
      source.origin === origin &&
      source.protocol === target.protocol &&
      source.port === target.port &&
      developmentHosts.includes(source.hostname)
    );
  } catch {
    return false;
  }
}
