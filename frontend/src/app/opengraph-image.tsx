import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "72px 84px",
          color: "#f8faf5",
          background: "linear-gradient(128deg, #123f3b 0%, #0f766e 62%, #18a58e 100%)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 48 }}>
            <div
              style={{
                width: 54,
                height: 54,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 18,
                background: "#f5cc55",
                color: "#123f3b",
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              s
            </div>
            <div style={{ fontSize: 30, fontWeight: 700 }}>stellarGive</div>
          </div>
          <div style={{ fontSize: 66, lineHeight: 1.08, fontWeight: 700, letterSpacing: -2 }}>
            Every gift moves
            <br />
            a campaign forward.
          </div>
          <div style={{ marginTop: 28, fontSize: 25, color: "#d3eee3" }}>
            Transparent relief campaigns on Stellar
          </div>
        </div>
        <div
          style={{
            width: 290,
            height: 290,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 145,
            background: "rgba(248, 250, 245, 0.12)",
            border: "2px solid rgba(248, 250, 245, 0.3)",
          }}
        >
          <svg width="180" height="180" viewBox="0 0 300 300" fill="none">
            <path
              d="M150 254 49 157C-1 106 72 34 123 84l27 27 27-27c51-50 124 22 74 73l-101 97Z"
              fill="#f8faf5"
            />
            <path d="m235 35 8 19 20 8-20 8-8 20-8-20-20-8 20-8 8-19Z" fill="#f5cc55" />
          </svg>
        </div>
      </div>
    ),
    size,
  );
}