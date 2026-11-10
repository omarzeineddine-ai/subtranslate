import { LANGUAGE_COUNT_LABEL } from "@/lib/languages";
import { SITE_HOST } from "@/lib/site";
import { ImageResponse } from "next/og";

export const alt = "Subtranslate — Translate SRT subtitles to any language";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const bg = "#0f1014";
const text = "#ffffff";
const textSecondary = "#a1a1aa";
const textMuted = "#71717a";
const ring = "rgba(255, 255, 255, 0.1)";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: bg,
          padding: "72px 88px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg
            width={40}
            height={40}
            fill="none"
            viewBox="0 0 24 24"
            stroke={text}
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
            />
          </svg>
          <div style={{ color: text, fontSize: 32, fontWeight: 600 }}>
            Subtranslate
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              color: text,
              fontSize: 24,
              padding: "8px 24px",
              borderRadius: 9999,
              border: `1px solid ${ring}`,
            }}
          >
            AI-powered subtitle translation
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 36,
              fontSize: 84,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            <div style={{ color: text }}>Translate SRT subtitles</div>
            <div style={{ color: textSecondary }}>to any language</div>
          </div>
          {/* One template string, not JSX text around an expression: Satori
              rejects a non-flex element with more than one child node. */}
          <div style={{ marginTop: 32, color: textMuted, fontSize: 30 }}>
            {`Natural, context-aware translation to ${LANGUAGE_COUNT_LABEL} languages.`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              backgroundColor: text,
              color: bg,
              fontSize: 26,
              fontWeight: 500,
              padding: "16px 40px",
              borderRadius: 9999,
            }}
          >
            Start translating →
          </div>
          <div style={{ color: textMuted, fontSize: 26 }}>{SITE_HOST}</div>
        </div>
      </div>
    ),
    size,
  );
}
