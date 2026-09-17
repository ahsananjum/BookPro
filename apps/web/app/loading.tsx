import React from "react";

export default function Loading() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
      <div style={{ color: "#818cf8", fontSize: "1.25rem", fontWeight: 600 }}>
        Loading BookPro workspace...
      </div>
    </div>
  );
}
