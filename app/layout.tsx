export const metadata = { title: "Kick Ass Commerce Checkout" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
