import ReactDOM from "react-dom";

function formatPhone(phone) {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export default function PrintView({
  volunteers,
  assignmentsByVolunteer,
  weekStarting,
}) {
  const weekLabel = weekStarting
    ? new Date(weekStarting + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const content = (
    <div className="church-care-print-view">
      <style>{`
        @media screen {
          .church-care-print-view { display: none; }
        }
        @media print {
          body > *:not(.church-care-print-view) { display: none !important; }
          .church-care-print-view {
            display: block;
            font-family: Georgia, serif;
            color: #000;
          }
          .print-page {
            padding: 0.6in 0.75in;
            page-break-after: always;
          }
          .print-page:last-child {
            page-break-after: avoid;
          }
          .print-header {
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 16px;
          }
          .print-title {
            font-size: 14px;
            font-weight: normal;
            margin: 0;
            color: #555;
          }
          .print-volunteer {
            font-size: 20px;
            font-weight: bold;
            margin: 4px 0 0;
          }
          .print-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-top: 8px;
          }
          .print-table th {
            text-align: left;
            padding: 5px 8px;
            font-weight: bold;
            border-bottom: 1px solid #999;
            background: #f5f5f5;
          }
          .print-table td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
            vertical-align: top;
          }
          .print-table tr:nth-child(even) td {
            background: #fafafa;
          }
          .print-notes-cell {
            min-width: 200px;
            min-height: 40px;
          }
        }
      `}</style>

      {volunteers.map((vol) => {
        const assignments = assignmentsByVolunteer[vol.id] ?? [];
        const ministry = vol.ministry
          ? vol.ministry.charAt(0).toUpperCase() + vol.ministry.slice(1)
          : null;

        return (
          <div key={vol.id} className="print-page">
            <div className="print-header">
              <p className="print-title">Church Care — Week of {weekLabel}</p>
              <h1 className="print-volunteer">
                {vol.full_name}
                {ministry && (
                  <span
                    style={{
                      fontWeight: "normal",
                      fontSize: "14px",
                      color: "#555",
                      marginLeft: "8px",
                    }}
                  >
                    {ministry}
                  </span>
                )}
              </h1>
            </div>

            {assignments.length === 0 ? (
              <p
                style={{ color: "#888", fontStyle: "italic", fontSize: "13px" }}
              >
                No contacts assigned this week.
              </p>
            ) : (
              <table className="print-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th>
                      Method
                      <br />
                      <span
                        style={{
                          fontWeight: "normal",
                          fontSize: "10px",
                          color: "#666",
                        }}
                      >
                        call / text / email / snail mail / in person
                      </span>
                    </th>
                    <th className="print-notes-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.members?.first_name} {a.members?.last_name}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {formatPhone(a.members?.phone)}
                      </td>
                      <td>{a.members?.email ?? "—"}</td>
                      <td>{a.members?.address ?? "—"}</td>
                      <td></td>
                      <td className="print-notes-cell"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}
