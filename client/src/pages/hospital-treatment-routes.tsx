import { TreatmentMasterDataManager } from "@/components/treatment-master-data-manager";

export default function HospitalTreatmentRoutesPage() {
  return (
    <TreatmentMasterDataManager
      title="Route of Administration"
      listEndpoint="/api/admin/routes-of-administration"
      createEndpoint="/api/admin/routes-of-administration"
      updateEndpointBase="/api/admin/routes-of-administration"
      deleteEndpointBase="/api/admin/routes-of-administration"
      moveEndpointBase="/api/admin/routes-of-administration"
      createPlaceholder="Optional full name (e.g. Intravenous)"
      secondaryFieldLabel="Abbreviation"
      secondaryFieldApiKey="abbreviation"
      secondaryFieldPlaceholder="Abbreviation (e.g. IV)"
      nameOptional
      searchPlaceholder="Search routes"
    />
  );
}
