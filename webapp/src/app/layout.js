import "./globals.css";

export const metadata = {
  title: "CAMT TA Timesheet",
  description: "ระบบบันทึกเวลาทำงานผู้ช่วยสอน CAMT",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
