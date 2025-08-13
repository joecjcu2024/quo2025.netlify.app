
export const metadata = {
  title: "互動式報價系統",
  description: "Next.js + Tailwind 互動式報價系統",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
