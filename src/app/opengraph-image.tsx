import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "WORKLEX Business – Dein digitales Unternehmensportal";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logo = await readFile(
    join(process.cwd(), "public/worklex-icon-glas.png")
  );

  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #202226 0%, #303238 100%)",
          color: "#f8f6f1",
          fontFamily: "Arial",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 55,
            top: 55,
            right: 55,
            bottom: 55,
            border: "1px solid #b99c70",
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 65,
          }}
        >
          <img
            src={logoSrc}
            width={270}
            height={270}
            style={{ objectFit: "contain" }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 76,
                fontWeight: 700,
                letterSpacing: 5,
              }}
            >
              WORKLEX
            </div>
            <div
              style={{
                width: 100,
                height: 3,
                background: "#c5a46d",
                marginTop: 24,
                marginBottom: 24,
              }}
            />
            <div
              style={{
                fontSize: 29,
                color: "#e6dfd3",
              }}
            >
              BUSINESS
            </div>
            <div
              style={{
                fontSize: 23,
                color: "#c5a46d",
                marginTop: 18,
              }}
            >
              Dein Unternehmen. Dein Überblick.
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
