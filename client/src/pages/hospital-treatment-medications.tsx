import { TreatmentMasterDataManager } from "@/components/treatment-master-data-manager";
import { MedicationImportPanel } from "@/components/medication-import-panel";

export default function HospitalTreatmentMedicationsPage() {
  return (
    <TreatmentMasterDataManager
      title="Medication Database"
      listEndpoint="/api/admin/medications"
      createEndpoint="/api/admin/medications"
      updateEndpointBase="/api/admin/medications"
      deleteEndpointBase="/api/admin/medications"
      moveEndpointBase="/api/admin/medications"
      createPlaceholder="Medication name"
      searchPlaceholder="Search by name or therapeutic class"
      secondaryFieldLabel="Therapeutic class"
      secondaryFieldApiKey="medicationClass"
      secondaryFieldPlaceholder="e.g. Antibiotic"
      secondaryFieldSearchKeys={["medicationClass", "medication_class"]}
      secondaryFieldOptional
      prependBody={<MedicationImportPanel />}
    />
  );
}
