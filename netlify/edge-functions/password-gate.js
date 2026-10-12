// Optional password gate (HTTP Basic Auth) for the whole site.
// Enable by setting SITE_PASSWORD in Netlify → Site configuration → Environment variables.
// If SITE_PASSWORD is not set, the site stays public (good for a portfolio link).
export default async (request, context) => {
  const password = Netlify.env.get("SITE_PASSWORD");
  if (!password) return context.next();

  const header = request.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [, pass] = atob(encoded).split(":");
    if (pass === password) return context.next();
  }
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Road Works Dashboard"' },
  });
};

export const config = { path: "/*" };
