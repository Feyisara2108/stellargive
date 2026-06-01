import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

export async function POST(request: Request) {
  try {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) {
      return NextResponse.json({ error: "Server IPFS config missing" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PNG/JPG files are allowed" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File must be 5MB or less" }, { status: 400 });
    }

    const pinataForm = new FormData();
    pinataForm.append("file", file, file.name);
    pinataForm.append("pinataMetadata", JSON.stringify({ name: file.name }));

    const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: pinataForm,
    });

    if (!pinataResponse.ok) {
      const body = await pinataResponse.text();
      return NextResponse.json({ error: `IPFS upload failed: ${body}` }, { status: 502 });
    }

    const payload = await pinataResponse.json();
    const cid = payload?.IpfsHash as string | undefined;
    if (!cid) {
      return NextResponse.json({ error: "IPFS upload succeeded without CID" }, { status: 502 });
    }

    return NextResponse.json({ cid, metadata_uri: `ipfs://${cid}` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown upload error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
