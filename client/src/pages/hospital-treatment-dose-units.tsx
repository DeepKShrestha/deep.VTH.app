import { TreatmentMasterDataManager } from "@/components/treatment-master-data-manager";

export default function HospitalTreatmentDoseUnitsPage() {
  return (
    <TreatmentMasterDataManager
      title="Dose Units"
      listEndpoint="/api/admin/dose-units"
      createEndpoint="/api/admin/dose-units"
      updateEndpointBase="/api/admin/dose-units"
      deleteEndpointBase="/api/admin/dose-units"
      moveEndpointBase="/api/admin/dose-units"
      createPlaceholder="Add dose unit"
      searchPlaceholder="Search dose units"
    />
  );
}
