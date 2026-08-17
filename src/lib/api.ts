function extractError(data: any, status: number): string {
  let message = data?.error || `Request Failed: ${status}`;
  if (data?.issues?.fieldErrors) {
    const fieldErrors = data.issues.fieldErrors as Record<string, string[]>;
    const firstField = Object.keys(fieldErrors)[0];
    let firstMsg: string | undefined;
    if (firstField) {
      firstMsg = fieldErrors[firstField]?.[0];
    } else {
      firstMsg = undefined;
    }
    if (firstMsg) {
      message = firstMsg;
    }
  }
  return message;
}

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
    throw new Error(extractError(data, res.status));
  }
  return data;
}

export async function apiUpload(
  path: string,
  formData: FormData,
  method: string = "POST",
) {
  const res = await fetch(path, {
    method,
    body: formData,
    credentials: "include",
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    throw new Error(extractError(data, res.status));
  }
  return data;
}
