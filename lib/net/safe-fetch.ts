// A deliberately narrow HTTP(S) downloader for the study-material URL importer.
// The server fetches a URL an admin typed in, so it must not be usable to reach
// the server's own network (SSRF). Rules, all enforced here rather than in the UI:
//   - https only, default port only, no credentials embedded in the URL;
//   - the destination is checked when the connection is made (a custom `lookup`),
//     not just up front, so a hostname that later resolves to a private address
//     (DNS rebinding) is refused too;
//   - loopback, private, link-local (incl. cloud metadata), CGNAT, multicast and
//     reserved ranges are refused, for IPv4 and IPv6 (and v4-mapped IPv6);
//   - redirects are followed manually (max 3) and every hop is re-validated;
//   - a hard byte cap and a hard time limit; the body is streamed, never trusted
//     to be small because a header said so.
// Errors carry messages that are safe to show to the admin.
import "server-only";
import https from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved + broadcast
  );
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateV4(mapped[1]);
    // The same IPv4-mapped address written in hex (::ffff:7f00:1 is 127.0.0.1).
    const mappedHex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    // Transition ranges that can embed an internal IPv4 address (NAT64, 6to4, Teredo) and site-local.
    if (v.startsWith("64:ff9b:") || v.startsWith("2002:") || v.startsWith("2001:0:") || v.startsWith("fec") || v.startsWith("fed") || v.startsWith("fee") || v.startsWith("fef")) return true;
    return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
  }
  return true; // not an IP at all - never trust it
}

// Runs at connect time: the address actually dialed is the one that was checked.
function safeLookup(hostname: string, options: unknown, callback: (...args: unknown[]) => void) {
  const wantAll = typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(new ImportError("That address is not allowed."));
    }
    return wantAll ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family);
  });
}

export function validateImportUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError("Enter a valid web address.");
  }
  if (url.protocol !== "https:") throw new ImportError("Only secure (https) addresses can be imported.");
  if (url.username || url.password) throw new ImportError("Addresses with a username or password are not allowed.");
  if (url.port !== "") throw new ImportError("Only standard web addresses (no custom port) can be imported.");
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0) throw new ImportError("Use a website address, not an IP address.");
  if (url.hostname === "localhost" || !url.hostname.includes(".")) throw new ImportError("That address is not allowed.");
  return url;
}

function download(url: URL, maxBytes: number, timeoutMs: number): Promise<{ status: number; location?: string; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        lookup: safeLookup as never,
        timeout: timeoutMs,
        headers: { "User-Agent": "mAITeacher-material-importer/1.0", Accept: "application/pdf" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : undefined;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location, contentType, body: Buffer.alloc(0) });
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > maxBytes) {
          req.destroy();
          return reject(new ImportError("That file is too large to import."));
        }
        const chunks: Buffer[] = [];
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) {
            req.destroy();
            return reject(new ImportError("That file is too large to import."));
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, location, contentType, body: Buffer.concat(chunks) }));
        res.on("error", () => reject(new ImportError("The download was interrupted.")));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new ImportError("The website took too long to respond."));
    });
    req.on("error", (e) => reject(e instanceof ImportError ? e : new ImportError(e.message === "That address is not allowed." ? e.message : "Could not reach that address.")));
  });
}

/** Downloads a single PDF from a public https URL, following at most 3 validated redirects. */
export async function fetchPublicPdf(rawUrl: string, opts: { maxBytes: number; timeoutMs?: number }): Promise<{ bytes: Buffer; finalUrl: string }> {
  let url = validateImportUrl(rawUrl);
  for (let hop = 0; hop <= 3; hop++) {
    const res = await download(url, opts.maxBytes, opts.timeoutMs ?? 20000);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new ImportError("The website redirected without saying where.");
      url = validateImportUrl(new URL(res.location, url).toString()); // every hop is re-validated
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new ImportError("That resource requires permission or a sign-in. Download it yourself and upload the file instead.");
    if (res.status !== 200) throw new ImportError(`The website answered with an error (${res.status}).`);
    // Trust the content itself, not the label: a real PDF starts with %PDF-.
    if (res.body.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ImportError("That address is not a PDF file.");
    return { bytes: res.body, finalUrl: url.toString() };
  }
  throw new ImportError("Too many redirects.");
}
