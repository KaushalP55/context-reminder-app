"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

type Trigger = { type: string; value: string };
type ReminderRow = {
  id: string;
  raw_text: string;
  title: string;
  status: string;
  created_at: string;
  parsed: { title?: string; triggers?: Trigger[] } | any;
  scheduled_for: string | null;
};
type EventRow = { id: string; event_type: string; payload: any; created_at: string };
type LocationData = { lat: number; lng: number; address?: string };
type AppInfo = { name: string; icon: string };

function norm(s: string) {
  return (s || "").trim().toLowerCase();
}

function triggerMatches(trigger: Trigger, eventType: string, eventValue: string) {
  const tType = norm(trigger.type);
  const tVal = norm(trigger.value);
  const eType = norm(eventType);
  const eVal = norm(eventValue);
  if (tType !== eType) return false;
  if (!tVal || !eVal) return false;
  return tVal === eVal || tVal.includes(eVal) || eVal.includes(tVal);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [text, setText] = useState("");
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggerType, setTriggerType] = useState("time");
  const [timeValue, setTimeValue] = useState("");
  const [websiteValue, setWebsiteValue] = useState("");
  const [appValue, setAppValue] = useState("");
  const [locationMode, setLocationMode] = useState<"current" | "choose">("current");
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [addressInput, setAddressInput] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [triggered, setTriggered] = useState<ReminderRow[]>([]);
  const [notice, setNotice] = useState<string>("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const userId = session?.user?.id;

  // App picker popup state
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [availableApps, setAvailableApps] = useState<AppInfo[]>([]);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [tempSelectedApps, setTempSelectedApps] = useState<string[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);

  const pageWrap: React.CSSProperties = {
    maxWidth: 860,
    margin: "60px auto",
    padding: 16,
    fontFamily: "system-ui",
  };

  const card: React.CSSProperties = {
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid #ccc",
    backgroundColor: "#ffffff",
    color: "#000000",
    outline: "none",
  };

  const primaryBtn: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 10,
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  };

  const neutralBtn: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    color: "#000000",
    border: "1px solid #ccc",
    fontWeight: 700,
    cursor: "pointer",
  };

  const disabledBtn: React.CSSProperties = {
    opacity: 0.55,
    cursor: "not-allowed",
  };

  const deleteBtn: React.CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "1px solid #ccc",
    backgroundColor: "#ffffff",
    color: "#dc2626",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "default") {
        Notification.requestPermission().then((permission) => {
          setNotificationPermission(permission);
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => console.error("Geolocation error:", error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!showMap || !mapContainerRef.current || !mapCenter) return;
    const timeoutId = setTimeout(() => {
      import("leaflet").then((L) => {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        if (mapContainerRef.current) {
          mapContainerRef.current.style.height = "400px";
          mapContainerRef.current.style.width = "100%";
        }
        const map = L.map(mapContainerRef.current!, {
          preferCanvas: false,
          fadeAnimation: false,
        }).setView([mapCenter.lat, mapCenter.lng], 15);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
          tileSize: 256,
        }).addTo(map);
        const marker = L.marker([mapCenter.lat, mapCenter.lng], {
          draggable: true,
        }).addTo(map);
        markerRef.current = marker;
        marker.on("dragend", () => {
          const position = marker.getLatLng();
          setSelectedLocation({
            lat: position.lat,
            lng: position.lng,
            address: `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`,
          });
        });
        map.on("click", (e: any) => {
          const { lat, lng } = e.latlng;
          marker.setLatLng([lat, lng]);
          setSelectedLocation({
            lat,
            lng,
            address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          });
        });
        mapRef.current = map;
        setTimeout(() => {
          map.invalidateSize();
        }, 100);
        setTimeout(() => {
          map.invalidateSize();
        }, 300);
        setTimeout(() => {
          map.invalidateSize();
        }, 500);
      });
    }, 50);
    return () => {
      clearTimeout(timeoutId);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [showMap, mapCenter]);

  async function loadReminders(uid: string) {
    const { data, error } = await supabase
      .from("reminders")
      .select("id, raw_text, title, status, created_at, parsed, scheduled_for")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) {
      alert(error.message);
      return;
    }
    setReminders((data as any) ?? []);
  }

  useEffect(() => {
    if (!userId) return;
    loadReminders(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const checkDueReminders = async () => {
      const now = new Date();
      const dueReminders = reminders.filter((r) => {
        if (!r.scheduled_for || r.status !== "active") return false;
        const scheduledTime = new Date(r.scheduled_for);
        return scheduledTime <= now;
      });
      for (const reminder of dueReminders) {
        if (Notification.permission === "granted") {
          new Notification("Reminder", {
            body: reminder.raw_text,
            icon: "/favicon.ico",
            tag: reminder.id,
          });
        }
        await supabase.from("reminders").update({ status: "completed" }).eq("id", reminder.id);
      }
      if (dueReminders.length > 0) {
        await loadReminders(userId);
        setNotice(`${dueReminders.length} reminder${dueReminders.length === 1 ? "" : "s"} triggered! 🔔`);
        window.setTimeout(() => setNotice(""), 3000);
      }
    };
    checkDueReminders();
    const interval = setInterval(checkDueReminders, 500);
    return () => clearInterval(interval);
  }, [userId, reminders]);

  useEffect(() => {
    if (!userId || !currentPosition) return;
    const checkLocationReminders = async () => {
      const nearbyReminders = reminders.filter((r) => {
        const triggers = r?.parsed?.triggers ?? [];
        const locationTrigger = triggers.find((t: Trigger) => t.type === "location");
        if (!locationTrigger || r.status !== "active") return false;
        try {
          const locationData = JSON.parse(locationTrigger.value) as LocationData;
          const distance = calculateDistance(
            currentPosition.lat,
            currentPosition.lng,
            locationData.lat,
            locationData.lng
          );
          return distance <= 200;
        } catch {
          return false;
        }
      });
      for (const reminder of nearbyReminders) {
        if (Notification.permission === "granted") {
          new Notification("Location Reminder", {
            body: reminder.raw_text,
            icon: "/favicon.ico",
            tag: reminder.id,
          });
        }
        await supabase.from("reminders").update({ status: "completed" }).eq("id", reminder.id);
      }
      if (nearbyReminders.length > 0) {
        await loadReminders(userId);
        setNotice(
          `${nearbyReminders.length} location reminder${nearbyReminders.length === 1 ? "" : "s"} triggered! 📍`
        );
        window.setTimeout(() => setNotice(""), 3000);
      }
    };
    checkLocationReminders();
    const interval = setInterval(checkLocationReminders, 2000);
    return () => clearInterval(interval);
  }, [userId, reminders, currentPosition]);

  async function getCurrentLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: LocationData = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: "Current Location",
        };
        setSelectedLocation(location);
        setMapCenter({ lat: location.lat, lng: location.lng });
      },
      (error) => {
        alert("Unable to get your location: " + error.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function searchAddress() {
    if (!addressInput.trim()) {
      alert("Please enter an address");
      return;
    }
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressInput)}`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const location: LocationData = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          address: data[0].display_name,
        };
        setSelectedLocation(location);
        setMapCenter({ lat: location.lat, lng: location.lng });
        setShowMap(true);
      } else {
        alert("Address not found. Please try a different address.");
      }
    } catch (error) {
      alert("Error searching for address. Please try again.");
    }
  }

  function openMapPicker() {
    if (currentPosition) {
      setMapCenter(currentPosition);
      setSelectedLocation({
        lat: currentPosition.lat,
        lng: currentPosition.lng,
        address: `${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)}`,
      });
      setShowMap(true);
    } else {
      getCurrentLocation();
    }
  }

  // App picker functions
  async function fetchAvailableApps() {
    setAppsLoading(true);
    setAppsError(null);
    try {
      const response = await fetch("http://localhost:3001/running-apps");
      if (!response.ok) throw new Error("Failed to fetch apps");
      const apps = await response.json();
      setAvailableApps(apps);
    } catch (error) {
      setAppsError("Could not fetch apps. Make sure the desktop companion app is running.");
      setAvailableApps([]);
    } finally {
      setAppsLoading(false);
    }
  }

  function openAppPicker() {
    setTempSelectedApps([...selectedApps]);
    setShowAppPicker(true);
    fetchAvailableApps();
  }

  function toggleTempAppSelection(appName: string) {
    setTempSelectedApps((prev) =>
      prev.includes(appName) ? prev.filter((name) => name !== appName) : [...prev, appName]
    );
  }

  function confirmAppSelection() {
    setSelectedApps(tempSelectedApps);
    setShowAppPicker(false);
  }

  function cancelAppSelection() {
    setTempSelectedApps([]);
    setShowAppPicker(false);
  }

  function getCurrentTriggerValue(): string {
    switch (triggerType) {
      case "time":
        return timeValue;
      case "location":
        if (locationMode === "current" && currentPosition) {
          return JSON.stringify({
            lat: currentPosition.lat,
            lng: currentPosition.lng,
            address: "Current Location",
          });
        } else if (selectedLocation) {
          return JSON.stringify(selectedLocation);
        }
        return "";
      case "website":
        return websiteValue;
      case "app":
        // Return comma-separated string to avoid double-encoding
        return selectedApps.length > 0 ? selectedApps.join(",") : "";
      default:
        return "";
    }
  }

  function isTriggerFilled(): boolean {
    const val = getCurrentTriggerValue();
    return val.trim().length > 0;
  }

  async function createReminder() {
    if (!userId) return;
    if (!text.trim()) return;
    if (!isTriggerFilled()) {
      alert("Please fill in the trigger value");
      return;
    }
    setLoading(true);
    const triggerValue = getCurrentTriggerValue();
    const trigger: Trigger = { type: triggerType, value: triggerValue };
    const scheduledFor = triggerType === "time" ? new Date(timeValue).toISOString() : null;
    const parsed = { title: text.trim().slice(0, 40), triggers: [trigger] };
    const { error } = await supabase.from("reminders").insert({
      user_id: userId,
      raw_text: text.trim(),
      title: text.trim().slice(0, 40),
      parsed,
      status: "active",
      scheduled_for: scheduledFor,
    });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    setText("");
    setTimeValue("");
    setWebsiteValue("");
    setAppValue("");
    setSelectedApps([]);
    setSelectedLocation(null);
    setAddressInput("");
    setShowMap(false);
    await loadReminders(userId);
    setNotice("Reminder saved ✅");
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function deleteReminder(id: string, title: string) {
    const confirmed = window.confirm(`Are you sure you want to delete this reminder?\n\n"${title}"`);
    if (!confirmed) return;
    const { error } = await supabase.from("reminders").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadReminders(userId!);
    setNotice("Reminder deleted 🗑️");
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function requestNotificationPermission() {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  }

  const triggeredIds = useMemo(() => new Set(triggered.map((r) => r.id)), [triggered]);

  return (
    <main style={pageWrap}>
      <h1>Context Reminders</h1>
      {!session ? (
        <>
          <p>This app will remind you based on context, not just time.</p>
          <Link href="/login">Sign in</Link>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div>
              <div>Signed in as: {session.user.email}</div>
              <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                User ID: {userId}{" "}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(userId || "");
                    setNotice("User ID copied! 📋");
                    window.setTimeout(() => setNotice(""), 1800);
                  }}
                  style={{ ...neutralBtn, padding: "2px 6px", fontSize: 11, marginLeft: 6 }}
                >
                  Copy
                </button>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut()} style={{ ...neutralBtn, padding: "6px 12px" }}>
              Sign out
            </button>
            {notice ? (
              <div
                style={{
                  marginLeft: "auto",
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #ddd",
                  background: "#ffffff",
                  color: "#000000",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {notice}
              </div>
            ) : (
              <div style={{ marginLeft: "auto" }} />
            )}
          </div>

          {notificationPermission !== "granted" && (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                backgroundColor: "#fef3c7",
                border: "1px solid #fbbf24",
                marginBottom: 14,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ Notifications disabled</div>
              <div style={{ fontSize: 14, marginBottom: 8 }}>
                Enable notifications to receive alerts for time and location-based reminders.
              </div>
              <button onClick={requestNotificationPermission} style={primaryBtn}>
                Enable notifications
              </button>
            </div>
          )}

          <div style={{ ...card, marginTop: 0 }}>
            <h2 style={{ marginTop: 0 }}>Create a reminder</h2>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Type a reminder..."
              style={inputStyle}
            />

            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6 }}>
                Choose trigger type
              </label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                style={{ ...inputStyle, fontWeight: 700 }}
              >
                <option value="time">Time</option>
                <option value="location">Location</option>
                <option value="website">Website</option>
                <option value="app">App</option>
              </select>
            </div>

            <div style={{ marginTop: 10 }}>
              {triggerType === "time" && (
                <>
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6 }}>
                    Select date and time
                  </label>
                  <input
                    type="datetime-local"
                    value={timeValue}
                    onChange={(e) => setTimeValue(e.target.value)}
                    style={inputStyle}
                  />
                </>
              )}

              {triggerType === "location" && (
                <>
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6 }}>
                    Location mode
                  </label>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <button
                      onClick={() => {
                        setLocationMode("current");
                        setSelectedLocation(null);
                        setShowMap(false);
                      }}
                      style={{
                        ...neutralBtn,
                        ...(locationMode === "current"
                          ? { backgroundColor: "#2563eb", color: "#ffffff" }
                          : {}),
                      }}
                    >
                      Current Location
                    </button>
                    <button
                      onClick={() => setLocationMode("choose")}
                      style={{
                        ...neutralBtn,
                        ...(locationMode === "choose"
                          ? { backgroundColor: "#2563eb", color: "#ffffff" }
                          : {}),
                      }}
                    >
                      Choose Location
                    </button>
                  </div>
                  {locationMode === "current" && (
                    <div
                      style={{
                        padding: 10,
                        backgroundColor: "#f0f9ff",
                        borderRadius: 8,
                        border: "1px solid #bfdbfe",
                      }}
                    >
                      <div style={{ fontSize: 14, color: "#1e40af" }}>
                        📍 Will trigger when you're within 200m of your current location
                      </div>
                      {currentPosition && (
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                          Current: {currentPosition.lat.toFixed(6)}, {currentPosition.lng.toFixed(6)}
                        </div>
                      )}
                    </div>
                  )}
                  {locationMode === "choose" && (
                    <>
                      <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6 }}>
                        Enter address or pick on map
                      </label>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <input
                          type="text"
                          value={addressInput}
                          onChange={(e) => setAddressInput(e.target.value)}
                          placeholder='e.g. "123 Main St, City"'
                          style={{ ...inputStyle, flex: 1 }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              searchAddress();
                            }
                          }}
                        />
                        <button onClick={searchAddress} style={primaryBtn}>
                          Search
                        </button>
                      </div>
                      <button
                        onClick={openMapPicker}
                        style={{ ...neutralBtn, width: "100%", marginBottom: 10 }}
                      >
                        📍 Pick location on map
                      </button>
                      {selectedLocation && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: 10,
                            backgroundColor: "#f0fdf4",
                            borderRadius: 8,
                            border: "1px solid #86efac",
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>
                            Selected Location:
                          </div>
                          <div style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>
                            {selectedLocation.address ||
                              `${selectedLocation.lat.toFixed(6)}, ${selectedLocation.lng.toFixed(6)}`}
                          </div>
                        </div>
                      )}
                      {showMap && (
                        <div
                          style={{
                            marginTop: 10,
                            border: "2px solid #2563eb",
                            borderRadius: 8,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              padding: 8,
                              backgroundColor: "#dbeafe",
                              fontSize: 12,
                              color: "#1e40af",
                              fontWeight: 600,
                            }}
                          >
                            🗺️ Click anywhere on the map or drag the marker to select a location
                          </div>
                          <div
                            ref={mapContainerRef}
                            style={{ height: "400px", width: "100%", position: "relative", zIndex: 0 }}
                          />
                          <div
                            style={{
                              padding: 8,
                              backgroundColor: "#f3f4f6",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div style={{ fontSize: 11, color: "#6b7280" }}>
                              Reminder will trigger within 200m of this location
                            </div>
                            <button
                              onClick={() => setShowMap(false)}
                              style={{ ...neutralBtn, padding: "4px 8px", fontSize: 12 }}
                            >
                              Close Map
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {triggerType === "website" && (
                <>
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6 }}>
                    Enter website domain
                  </label>
                  <input
                    type="text"
                    value={websiteValue}
                    onChange={(e) => setWebsiteValue(e.target.value)}
                    placeholder='e.g. "canvas.tamu.edu", "gmail.com"'
                    style={inputStyle}
                  />
                </>
              )}

              {triggerType === "app" && (
                <>
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6 }}>
                    Select apps to trigger this reminder
                  </label>
                  <button onClick={openAppPicker} style={{ ...neutralBtn, width: "100%" }} type="button">
                    📱 Pick Apps
                  </button>
                  {selectedApps.length > 0 && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        backgroundColor: "#f0fdf4",
                        borderRadius: 8,
                        border: "1px solid #86efac",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
                        Selected Apps ({selectedApps.length}):
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {selectedApps.map((app) => (
                          <span
                            key={app}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "4px 8px",
                              backgroundColor: "#dcfce7",
                              borderRadius: 6,
                              fontSize: 12,
                              color: "#166534",
                            }}
                          >
                            {app}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 12,
                      color: "#666",
                      marginTop: 8,
                      padding: 8,
                      background: "#f0f9ff",
                      borderRadius: 6,
                      border: "1px solid #bfdbfe",
                    }}
                  >
                    💡 <strong>Tip:</strong> Install the desktop companion app to enable app-based
                    reminders.
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              <button
                disabled={loading || !text.trim() || !isTriggerFilled()}
                onClick={createReminder}
                style={{
                  ...primaryBtn,
                  ...(loading || !text.trim() || !isTriggerFilled() ? disabledBtn : null),
                }}
              >
                {loading ? "Saving..." : "Save reminder"}
              </button>
            </div>
            <p style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
              Each reminder requires a trigger (time, location, website, or app).
            </p>
          </div>

          <div style={{ marginTop: 18 }}>
            <h2>Your reminders</h2>
            {reminders.length === 0 ? (
              <p>No reminders yet.</p>
            ) : (
              reminders.map((r) => {
                const isTriggered = triggeredIds.has(r.id);
                const locationTrigger = r?.parsed?.triggers?.find(
                  (t: Trigger) => t.type === "location"
                );
                const appTrigger = r?.parsed?.triggers?.find((t: Trigger) => t.type === "app");
                let locationDisplay = "";
                let appDisplay = "";
                if (locationTrigger) {
                  try {
                    const loc = JSON.parse(locationTrigger.value) as LocationData;
                    locationDisplay =
                      loc.address || `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
                  } catch {}
                }
                if (appTrigger) {
                  // Handle both comma-separated and JSON array formats
                  try {
                    const apps = JSON.parse(appTrigger.value);
                    appDisplay = Array.isArray(apps) ? apps.join(", ") : appTrigger.value;
                  } catch {
                    // It's a comma-separated string
                    appDisplay = appTrigger.value;
                  }
                }
                return (
                  <div
                    key={r.id}
                    style={{
                      padding: 12,
                      borderBottom: "1px solid #eee",
                      borderLeft: isTriggered ? "4px solid #2563eb" : "4px solid transparent",
                      paddingLeft: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800 }}>
                        {isTriggered ? "⚡ " : ""}
                        {r.title}
                      </div>
                      <div style={{ color: "#555" }}>{r.raw_text}</div>
                      <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                      {r.scheduled_for && (
                        <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                          Scheduled: {new Date(r.scheduled_for).toLocaleString()}
                        </div>
                      )}
                      {locationDisplay && (
                        <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                          📍 Location: {locationDisplay}
                        </div>
                      )}
                      {appDisplay && (
                        <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                          📱 Apps: {appDisplay}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
                        Triggers: {(r.parsed?.triggers ?? []).map((t: Trigger) => t.type).join(", ") || "(none)"}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteReminder(r.id, r.title)}
                      style={deleteBtn}
                      title="Delete reminder"
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* App Picker Popup Modal */}
      {showAppPicker && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelAppSelection();
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 16,
              padding: 20,
              width: "90%",
              maxWidth: 600,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 18 }}>📱 Select Apps</h3>
              <button
                onClick={cancelAppSelection}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: "#666",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {tempSelectedApps.length > 0 && (
              <div
                style={{
                  marginBottom: 12,
                  padding: 10,
                  backgroundColor: "#f0fdf4",
                  borderRadius: 8,
                  border: "1px solid #86efac",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
                  Selected ({tempSelectedApps.length}):
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tempSelectedApps.map((app) => (
                    <span
                      key={app}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 8px",
                        backgroundColor: "#dcfce7",
                        borderRadius: 6,
                        fontSize: 12,
                        color: "#166534",
                      }}
                    >
                      {app}
                      <button
                        onClick={() => toggleTempAppSelection(app)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 14,
                          color: "#166534",
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
              {appsLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
                  Loading apps...
                </div>
              ) : appsError ? (
                <div
                  style={{
                    padding: 20,
                    backgroundColor: "#fef2f2",
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
                  <div style={{ fontSize: 14, color: "#991b1b", marginBottom: 12 }}>{appsError}</div>
                  <button onClick={fetchAvailableApps} style={neutralBtn}>
                    Retry
                  </button>
                </div>
              ) : availableApps.length === 0 ? (
                <div
                  style={{
                    padding: 20,
                    backgroundColor: "#f0f9ff",
                    borderRadius: 8,
                    border: "1px solid #bfdbfe",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
                  <div style={{ fontSize: 14, color: "#1e40af", marginBottom: 12 }}>
                    No apps found. Make sure the desktop companion app is running.
                  </div>
                  <button onClick={fetchAvailableApps} style={neutralBtn}>
                    Refresh
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
                    gap: 10,
                  }}
                >
                  {availableApps.map((app) => {
                    const isSelected = tempSelectedApps.includes(app.name);
                    const isEmoji = !app.icon.startsWith("data:");
                    return (
                      <div
                        key={app.name}
                        onClick={() => toggleTempAppSelection(app.name)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          padding: 10,
                          borderRadius: 10,
                          cursor: "pointer",
                          border: isSelected ? "2px solid #2563eb" : "2px solid #e5e7eb",
                          backgroundColor: isSelected ? "#eff6ff" : "#f9fafb",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {isEmoji ? (
                          <div
                            style={{
                              width: 48,
                              height: 48,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 28,
                              backgroundColor: "#e5e7eb",
                              borderRadius: 10,
                            }}
                          >
                            {app.icon}
                          </div>
                        ) : (
                          <img
                            src={app.icon}
                            alt={app.name}
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: 10,
                              objectFit: "contain",
                            }}
                          />
                        )}
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 11,
                            textAlign: "center",
                            color: "#374151",
                            wordBreak: "break-word",
                            lineHeight: 1.2,
                            maxWidth: "100%",
                          }}
                        >
                          {app.name.length > 12 ? app.name.slice(0, 12) + "..." : app.name}
                        </div>
                        {isSelected && (
                          <div
                            style={{
                              marginTop: 4,
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              backgroundColor: "#2563eb",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={cancelAppSelection} style={neutralBtn}>
                Cancel
              </button>
              <button
                onClick={confirmAppSelection}
                style={{
                  ...primaryBtn,
                  ...(tempSelectedApps.length === 0 ? disabledBtn : {}),
                }}
                disabled={tempSelectedApps.length === 0}
              >
                Confirm ({tempSelectedApps.length} selected)
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}