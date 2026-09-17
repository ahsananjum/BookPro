"use client";

import React, { useState, useEffect } from "react";

export interface Slot {
  startTime: string;
  endTime: string;
  formattedStartTime: string;
  formattedEndTime: string;
  presentationTimezone: string;
  staffId: string;
  staffName?: string;
  locationId: string;
  serviceId: string;
  availableCapacity: number;
}

export interface SlotSelectorProps {
  organizationId: string;
  locationId: string;
  serviceId: string;
  staffList?: { id: string; name: string }[];
  onSelectSlot?: (slot: Slot) => void;
}

export function SlotSelector({
  organizationId,
  locationId,
  serviceId,
  staffList = [],
  onSelectSlot,
}: SlotSelectorProps) {
  const todayStr = new Date().toISOString().split("T")[0];
  const nextWeekStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(nextWeekStr);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [timezone, setTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });
  const [partySize, setPartySize] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const fetchSlots = async () => {
    setLoading(true);
    setError(null);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
    try {
      const res = await fetch(`${apiBase}/availability/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          locationId,
          serviceId,
          startDate,
          endDate,
          staffId: selectedStaffId || undefined,
          presentationTimezone: timezone,
          partySize: Number(partySize),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Availability engine returned error (${res.status})`);
      }

      const data = await res.json();
      const rawSlots = data.slots || [];
      const nowMs = Date.now();
      const validSlots = rawSlots.filter(
        (s: Slot) => new Date(s.startTime).getTime() > nowMs
      );
      setSlots(validSlots);
    } catch (err: any) {
      setError(err.message || "Failed to retrieve live availability. Please check your connection or contact the business directly.");
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId && locationId && serviceId) {
      fetchSlots();
    }
  }, [organizationId, locationId, serviceId, startDate, endDate, selectedStaffId, timezone, partySize]);

  const handleSlotClick = (slot: Slot) => {
    setSelectedSlot(slot);
    if (onSelectSlot) {
      onSelectSlot(slot);
    }
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-6 shadow-2xl text-slate-100 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <span className="text-xs uppercase tracking-widest text-emerald-400 font-semibold font-mono">
            ENGINE // AVAILABILITY SEARCH
          </span>
          <h2 className="text-xl font-bold text-white tracking-tight mt-1">
            Select Appointment Slot
          </h2>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Timezone Switcher */}
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-mono text-slate-400">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="UTC">UTC (Coordinated Universal Time)</option>
              <option value="Asia/Karachi">Asia/Karachi (PKT UTC+5)</option>
              <option value="America/New_York">America/New_York (EDT UTC-4)</option>
              <option value="Europe/London">Europe/London (BST UTC+1)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (JST UTC+9)</option>
            </select>
          </div>

          {/* Party Size */}
          <div className="flex flex-col w-20">
            <label className="text-[10px] uppercase font-mono text-slate-400">Party Size</label>
            <input
              type="number"
              min={1}
              max={50}
              value={partySize}
              onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))}
              className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Staff Filter */}
          {staffList.length > 0 && (
            <div className="flex flex-col">
              <label className="text-[10px] uppercase font-mono text-slate-400">Staff</label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
              >
                <option value="">Any Qualified Staff</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Date Navigator */}
      <div className="flex items-center gap-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">FROM:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">TO:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
        <button
          onClick={fetchSlots}
          disabled={loading}
          className="ml-auto bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs uppercase px-4 py-2 rounded transition-all disabled:opacity-50 font-mono"
        >
          {loading ? "SEARCHING..." : "REFRESH SLOTS"}
        </button>
      </div>

      {/* Content Area */}
      <div className="mt-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-800/60 rounded-lg border border-slate-800"></div>
            ))}
          </div>
        ) : error ? (
          <div className="p-5 bg-red-950/40 border border-red-800/80 rounded-lg text-red-300 font-mono space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-red-400">
              <span>⚠️ Live Availability Unavailable</span>
            </div>
            <p className="text-xs text-slate-300">{error}</p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={fetchSlots}
                className="bg-red-900/60 hover:bg-red-800/80 text-red-100 text-xs px-3 py-1.5 rounded border border-red-700/60 transition-all font-semibold"
              >
                Retry Search
              </button>
              <span className="text-[11px] text-slate-400">
                Or contact the studio front desk for manual scheduling.
              </span>
            </div>
          </div>
        ) : slots.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-lg space-y-2">
            <div className="text-sm font-semibold text-slate-400 font-mono">
              NO AUTHORIZED OPENINGS FOUND
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              There are no available appointment slots matching the selected criteria. Try adjusting the date range or specialist preference.
            </p>
            <button
              onClick={fetchSlots}
              className="mt-3 inline-block text-xs text-emerald-400 hover:text-emerald-300 font-mono underline cursor-pointer"
            >
              Recheck Live Availability
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>AVAILABLE CANDIDATE SLOTS ({slots.length})</span>
              <span>DISPLAYING IN {timezone}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
              {slots.map((slot, index) => {
                const isSelected = selectedSlot?.startTime === slot.startTime && selectedSlot?.staffId === slot.staffId;
                return (
                  <button
                    key={`${slot.startTime}-${slot.staffId}-${index}`}
                    onClick={() => handleSlotClick(slot)}
                    className={`p-3 rounded-lg border text-left transition-all font-mono flex flex-col justify-between ${
                      isSelected
                        ? "bg-emerald-950/60 border-emerald-500 text-emerald-100 ring-1 ring-emerald-500"
                        : "bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 hover:border-slate-500 text-slate-200"
                    }`}
                  >
                    <div className="text-xs font-semibold text-white">
                      {slot.formattedStartTime}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                      <span>STAFF: {slot.staffName || "Staff"}</span>
                      <span className="text-emerald-400 font-bold">CAP: {slot.availableCapacity}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selected Slot Footer */}
      {selectedSlot && (
        <div className="mt-6 p-4 bg-emerald-950/40 border border-emerald-800/80 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4 font-mono">
          <div>
            <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">SELECTED SLOT</span>
            <div className="text-xs text-white mt-0.5">
              {selectedSlot.formattedStartTime} &rarr; {selectedSlot.formattedEndTime} ({selectedSlot.presentationTimezone})
            </div>
          </div>
          <button
            onClick={() => handleSlotClick(selectedSlot)}
            className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase px-5 py-2.5 rounded transition-all"
          >
            CONFIRM SELECTION
          </button>
        </div>
      )}
    </div>
  );
}

export default SlotSelector;
