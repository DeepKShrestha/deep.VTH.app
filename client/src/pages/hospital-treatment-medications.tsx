import { TreatmentMasterDataManager } from "@/components/treatment-master-data-manager";

export default function HospitalTreatmentMedicationsPage() {
  return (
    <TreatmentMasterDataManager
      title="Medication Database"
      listEndpoint="/api/admin/medications"
      createEndpoint="/api/admin/medications"
      updateEndpointBase="/api/admin/medications"
      deleteEndpointBase="/api/admin/medications"
      moveEndpointBase="/api/admin/medications"
      createPlaceholder="Add medication name"
      searchPlaceholder="Search medications"
    />
  );
}
