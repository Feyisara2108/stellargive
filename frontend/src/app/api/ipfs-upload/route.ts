import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_UPLOADS_PER_WINDOW = 10;
const uploadAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (
    request.headers.get("x-real-ip")?.trim() ||
    forwardedFor?.split(",")[0]?.trim() ||
    null
  );
}

function isRateLimited(ip: string, now = Date.now()): boolean {
  for (const [key, attempt] of uploadAttempts) {
    if (attempt.resetAt <= now) uploadAttempts.delete(key);
  }

  const attempt = uploadAttempts.get(ip);
  if (!attempt || attempt.resetAt <= now) {
    uploadAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (attempt.count >= MAX_UPLOADS_PER_WINDOW) return true;

  attempt.count += 1;
  return false;
}

function hasValidImageSignature(bytes: Uint8Array): boolean {
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return isPng || isJpeg;
}

function sanitizeFileName(name: string): string {
  const baseName = name.split(/[\\/]/).pop() ?? "";
  const sanitized = baseName
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 100);
  return sanitized || "upload";
}

export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Upload must be 5MB or less" }, { status: 413 });
    }

    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Upload request not allowed" }, { status: 403 });
    }

    const ip = getClientIp(request);
    if (!ip) {
      return NextResponse.json({ error: "Upload request not allowed" }, { status: 403 });
    }
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 });
    }

    const jwt = process.env.PINATA_JWT;
    if (!jwt) {
      return NextResponse.json({ error: "Server IPFS config missing" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File must be 5MB or less" }, { status: 400 });
    }

    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (!hasValidImageSignature(signature)) {
      return NextResponse.json({ error: "Only PNG/JPG files are allowed" }, { status: 400 });
    }

    const fileName = sanitizeFileName(file.name);
    const pinataForm = new FormData();
    pinataForm.append("file", file, fileName);
    pinataForm.append("pinataMetadata", JSON.stringify({ name: fileName }));

    const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: pinataForm,
    });

    if (!pinataResponse.ok) {
      const body = await pinataResponse.text();
      console.error("[ipfs-upload] Pinata upload failed", {
        status: pinataResponse.status,
        body,
      });
      return NextResponse.json({ error: "IPFS upload failed. Please try again." }, { status: 502 });
    }

    const payload = await pinataResponse.json();
    const cid = payload?.IpfsHash as string | undefined;
    if (!cid) {
      return NextResponse.json({ error: "IPFS upload succeeded without CID" }, { status: 502 });
    }

    return NextResponse.json({ cid, metadata_uri: `ipfs://${cid}` });
  } catch (error: unknown) {
    console.error("[ipfs-upload] Upload failed", error);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
