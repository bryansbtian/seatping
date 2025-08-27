export async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    credentials: "include",
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    // Prefer server-provided error message; fall back to first validation issue if available
    let message = data?.error || `Request Failed: ${res.status}`;
    if (data?.issues?.fieldErrors) {
      const fieldErrors = data.issues.fieldErrors as Record<string, string[]>;
      const firstField = Object.keys(fieldErrors)[0];
      const firstMsg = firstField ? fieldErrors[firstField]?.[0] : undefined;
      if (firstMsg) message = firstMsg;
    }
    throw new Error(message);
  }
  return data;
}
