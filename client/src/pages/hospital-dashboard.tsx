import DashboardPage from "@/pages/dashboard";

export default function HospitalDashboardPage() {
  return (
    <DashboardPage
      scope="hospital"
      title="Hospital Analytics Dashboard"
      subtitle="Veterinary Teaching Hospital case analytics"
      backHref="/new-case"
    />
  );
}
