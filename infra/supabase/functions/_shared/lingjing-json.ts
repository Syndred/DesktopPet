export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const result = JSON.stringify(value); if (result === undefined || typeof value === "number" && !Number.isFinite(value)) throw new Error("NON_JSON_DOCUMENT");
    return result;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
export async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
export function equalHex(first: string,second: string) {
  if(first.length!==second.length)return false; let diff=0; for(let i=0;i<first.length;i++)diff|=first.charCodeAt(i)^second.charCodeAt(i); return diff===0;
}
