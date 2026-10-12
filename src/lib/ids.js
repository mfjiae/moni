// Stable record ids, shared by every device.
export function newUid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// A bank row gets the same id on every device, derived from its import key.
export const csvUid = (importKey) => `csv|${importKey}`;
