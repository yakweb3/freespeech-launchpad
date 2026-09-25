export function appOrigin() {
  if (process.env.APP_ORIGIN) return new URL(process.env.APP_ORIGIN).origin;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return "http://localhost:5175";
}
