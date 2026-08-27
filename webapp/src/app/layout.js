import "./globals.css";

export const metadata = {
  title: "CAMT TA Timesheet",
  description: "ระบบบันทึกเวลาทำงานผู้ช่วยสอน CAMT",
  // Tell Chrome/Google Translate not to auto-translate. In-browser translation
  // rewrites text nodes (wrapping them in <font> tags), which then breaks React's
  // DOM reconciliation and crashes the page ("insertBefore ... NotFoundError").
  // The app already renders English for non-Thai users, so we opt out entirely.
  other: { google: "notranslate" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" translate="no">
      <body className="notranslate">{children}</body>
    </html>
  );
}
