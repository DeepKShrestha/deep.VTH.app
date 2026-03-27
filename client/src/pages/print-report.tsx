import { useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Case } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Printer } from "lucide-react";
import { formatBsDate, formatAdDate } from "@/lib/nepali-date";

interface AstRow {
  antibiotic: string;
  symbol?: string;
  discContent?: string;
  sensitivity: "S" | "I" | "R";
  zoneSize?: string;
}

export default function PrintReport() {
  const params = useParams<{ id: string }>();

  const { data: caseData, isLoading } = useQuery<Case>({
    queryKey: ["/api/cases", params.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/cases/${params.id}`);
      return res.json();
    },
  });

  const handlePrint = () => window.print();

  const astResults: AstRow[] = useMemo(() => {
    if (!caseData?.astResults) return [];
    try { return JSON.parse(caseData.astResults); } catch { return []; }
  }, [caseData]);

  const recommendations = useMemo(() => {
    return astResults
      .filter((r) => r.sensitivity === "S" && r.zoneSize && parseFloat(r.zoneSize) > 0)
      .sort((a, b) => parseFloat(b.zoneSize || "0") - parseFloat(a.zoneSize || "0"))
      .slice(0, 3);
  }, [astResults]);

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-4 py-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!caseData) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4"><p className="text-muted-foreground">Case not found.</p><Link href="/cases"><Button variant="outline">Back to Cases</Button></Link></div>;
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/cases/${caseData.id}`}>
            <Button variant="ghost" size="icon" data-testid="button-back"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <span className="text-sm font-medium">Print Preview</span>
        </div>
        <Button onClick={handlePrint} size="sm" className="gap-1.5" data-testid="button-print">
          <Printer className="w-3.5 h-3.5" />Print / Save PDF
        </Button>
      </div>

      {/* Printable Report */}
      <div className="max-w-[210mm] mx-auto bg-white text-black p-8 sm:p-12 my-4 sm:my-8 print:m-0 print:p-0 print:max-w-none">
        {/* Header */}
        <div className="text-center border-b-2 border-black pb-4 mb-6">
          <h1 className="text-xl font-bold uppercase tracking-wide text-black">Veterinary Teaching Hospital</h1>
          <p className="text-sm text-gray-700 mt-1">Antibiotic Sensitivity Test (AST) Report</p>
        </div>

        {/* Case Info Row */}
        <div className="flex justify-between items-start mb-2 text-sm">
          <div><span className="font-semibold text-black">Case No: </span><span className="text-black">{caseData.caseNumber}</span></div>
          <div className="text-right">
            <div><span className="font-semibold text-black">Date (BS): </span><span className="text-black">{formatBsDate(caseData.date)}</span></div>
            {caseData.dateAd && <div className="text-xs text-gray-500">AD: {formatAdDate(caseData.dateAd)}</div>}
          </div>
        </div>
        <div className="flex justify-between items-start mb-2 text-sm">
          {caseData.billNumber && (
            <div><span className="font-semibold text-black">Bill/Reg No: </span><span className="text-black">{caseData.billNumber}</span></div>
          )}
          <div className="flex gap-6">
            {caseData.dailyNumber && <span className="text-black"><span className="font-semibold">Daily #: </span>{caseData.dailyNumber}</span>}
            {caseData.monthlyNumber && <span className="text-black"><span className="font-semibold">Monthly #: </span>{caseData.monthlyNumber}</span>}
          </div>
        </div>

        <div className="mb-6" />

        {/* Details Table */}
        <div className="border border-gray-400 mb-6">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-400">
                <td className="py-2 px-3 font-semibold bg-gray-50 w-40 text-black">Owner Name</td>
                <td className="py-2 px-3 text-black">{caseData.ownerName}</td>
              </tr>
              <tr className="border-b border-gray-400">
                <td className="py-2 px-3 font-semibold bg-gray-50 text-black">Address</td>
                <td className="py-2 px-3 text-black">{caseData.ownerAddress}</td>
              </tr>
              <tr className="border-b border-gray-400">
                <td className="py-2 px-3 font-semibold bg-gray-50 text-black">Phone No.</td>
                <td className="py-2 px-3 text-black">{caseData.ownerPhone}</td>
              </tr>
              <tr className="border-b border-gray-400">
                <td className="py-2 px-3 font-semibold bg-gray-50 text-black">Species</td>
                <td className="py-2 px-3 text-black">{caseData.species}</td>
              </tr>
              <tr className="border-b border-gray-400">
                <td className="py-2 px-3 font-semibold bg-gray-50 text-black">Breed</td>
                <td className="py-2 px-3 text-black">{caseData.breed}</td>
              </tr>
              {caseData.animalName && <tr className="border-b border-gray-400"><td className="py-2 px-3 font-semibold bg-gray-50 text-black">Animal Name</td><td className="py-2 px-3 text-black">{caseData.animalName}</td></tr>}
              {caseData.age && <tr className="border-b border-gray-400"><td className="py-2 px-3 font-semibold bg-gray-50 text-black">Age</td><td className="py-2 px-3 text-black">{caseData.age}</td></tr>}
              {caseData.sex && <tr className="border-b border-gray-400"><td className="py-2 px-3 font-semibold bg-gray-50 text-black">Sex</td><td className="py-2 px-3 text-black">{caseData.sex}</td></tr>}
              {caseData.sampleType && <tr className="border-b border-gray-400"><td className="py-2 px-3 font-semibold bg-gray-50 text-black">Sample Type</td><td className="py-2 px-3 text-black">{caseData.sampleType}</td></tr>}
              {caseData.sampleDate && <tr className="border-b border-gray-400"><td className="py-2 px-3 font-semibold bg-gray-50 text-black">Collection Date</td><td className="py-2 px-3 text-black">{formatBsDate(caseData.sampleDate)}{caseData.sampleDateAd && <span className="text-xs text-gray-500 ml-2">(AD: {formatAdDate(caseData.sampleDateAd)})</span>}</td></tr>}
              {caseData.cultureResult && <tr><td className="py-2 px-3 font-semibold bg-gray-50 text-black">Organism Isolated</td><td className="py-2 px-3 font-semibold text-black">{caseData.cultureResult}</td></tr>}
            </tbody>
          </table>
        </div>

        {/* AST Results */}
        {astResults.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase mb-3 text-black">Antibiotic Sensitivity Test Results</h2>
            <table className="w-full text-sm border border-gray-400">
              <thead>
                <tr className="bg-gray-100">
                  <th className="py-2 px-3 text-left border border-gray-400 font-semibold w-12 text-black">S.N.</th>
                  <th className="py-2 px-3 text-left border border-gray-400 font-semibold text-black">Antibiotic</th>
                  <th className="py-2 px-3 text-center border border-gray-400 font-semibold w-20 text-black">Disc</th>
                  <th className="py-2 px-3 text-center border border-gray-400 font-semibold w-28 text-black">Zone (mm)</th>
                  <th className="py-2 px-3 text-center border border-gray-400 font-semibold w-32 text-black">Sensitivity</th>
                </tr>
              </thead>
              <tbody>
                {astResults.map((row, i) => (
                  <tr key={i}>
                    <td className="py-1.5 px-3 border border-gray-400 text-center text-black">{i + 1}</td>
                    <td className="py-1.5 px-3 border border-gray-400 text-black">{row.antibiotic}{row.symbol ? ` (${row.symbol})` : ""}</td>
                    <td className="py-1.5 px-3 border border-gray-400 text-center text-gray-600">{row.discContent || "—"}</td>
                    <td className="py-1.5 px-3 border border-gray-400 text-center text-black">{row.zoneSize || "—"}</td>
                    <td className="py-1.5 px-3 border border-gray-400 text-center font-bold text-black">
                      <span className={row.sensitivity === "S" ? "text-green-700" : row.sensitivity === "R" ? "text-red-700" : "text-amber-700"}>
                        {row.sensitivity === "S" ? "Sensitive (S)" : row.sensitivity === "I" ? "Intermediate (I)" : "Resistant (R)"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex gap-6 text-xs text-gray-600">
              <span><strong className="text-green-700">S</strong> = Sensitive</span>
              <span><strong className="text-amber-700">I</strong> = Intermediate</span>
              <span><strong className="text-red-700">R</strong> = Resistant</span>
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase mb-2 text-black">Recommended Antibiotics</h2>
            <div className="border border-gray-300 p-3 rounded">
              <p className="text-xs text-gray-600 mb-2">Based on sensitivity results, ranked by zone of inhibition:</p>
              {recommendations.map((rec, i) => (
                <p key={i} className="text-sm text-black">
                  <strong>{i + 1}. {rec.antibiotic}{rec.symbol ? ` (${rec.symbol})` : ""}</strong> — zone: {rec.zoneSize} mm
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Remarks */}
        {caseData.remarks && (
          <div className="mb-8">
            <h2 className="text-sm font-bold uppercase mb-2 text-black">Remarks</h2>
            <p className="text-sm border border-gray-300 p-3 rounded whitespace-pre-wrap text-black">{caseData.remarks}</p>
          </div>
        )}

        {/* Signature Area */}
        <div className="mt-16 flex justify-between items-end text-sm">
          <div className="text-center"><div className="border-t border-gray-400 pt-1 px-8"><p className="font-semibold text-black">Laboratory Technician</p></div></div>
          <div className="text-center"><div className="border-t border-gray-400 pt-1 px-8"><p className="font-semibold text-black">Veterinarian</p></div></div>
        </div>

        {/* Footer */}
                    <div className="mt-8 pt-3 border-t border-gray-300 text-center text-xs text-gray-500">
        <p>
          This report is generated by the Veterinary Teaching Hospital AST Report System.
        </p>

        {caseData.lastUpdatedBy && caseData.updatedAt && (
          <p className="mt-1">
            Last updated by{" "}
            {caseData.lastUpdatedByName || `User ID ${caseData.lastUpdatedBy}`}{" "}
            on {new Date(caseData.updatedAt).toLocaleString()}
          </p>
        )}

        <p className="mt-1">
          Report generated on {formatBsDate(caseData.date, "long")} (
          {formatAdDate(caseData.dateAd || "")})
        </p>
      </div>
      </div>
    </div>
  );
}
