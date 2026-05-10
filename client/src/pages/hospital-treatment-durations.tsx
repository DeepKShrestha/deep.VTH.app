import { TreatmentMasterDataManager } from "@/components/treatment-master-data-manager";

export default function HospitalTreatmentDurationsPage() {
  return (
    <TreatmentMasterDataManager
      title="Duration / Day Options"
      listEndpoint="/api/admin/durations"
      createEndpoint="/api/admin/durations"
      updateEndpointBase="/api/admin/durations"
      deleteEndpointBase="/api/admin/durations"
      createPlaceholder="Add duration/day option"
      searchPlaceholder="Search durations"
    />
  );
}
