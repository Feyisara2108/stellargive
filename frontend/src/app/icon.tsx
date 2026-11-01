import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f766e",
        borderRadius: 112,
      }}
    >
      <svg width="300" height="300" viewBox="0 0 300 300" fill="none">
        <path
          d="M150 254 49 157C-1 106 72 34 123 84l27 27 27-27c51-50 124 22 74 73l-101 97Z"
          fill="#f8faf5"
        />
        <path d="m235 35 8 19 20 8-20 8-8 20-8-20-20-8 20-8 8-19Z" fill="#f5cc55" />
      </svg>
    </div>,
    size,
  );
}
