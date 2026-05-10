import { TreatmentMasterDataManager } from "@/components/treatment-master-data-manager";

export default function HospitalTreatmentFrequenciesPage() {
  return (
    <TreatmentMasterDataManager
      title="Frequency Options"
      listEndpoint="/api/admin/frequencies"
      createEndpoint="/api/admin/frequencies"
      updateEndpointBase="/api/admin/frequencies"
      deleteEndpointBase="/api/admin/frequencies"
      moveEndpointBase="/api/admin/frequencies"
      createPlaceholder="Optional full name (e.g. Every 4 hours)"
      secondaryFieldLabel="Abbreviation"
      secondaryFieldApiKey="shortCode"
      secondaryFieldSearchKeys={["shortCode", "short_code"]}
      secondaryFieldPlaceholder="Abbreviation (e.g. Q4H)"
      nameOptional
      searchPlaceholder="Search frequencies"
    />
  );
}
