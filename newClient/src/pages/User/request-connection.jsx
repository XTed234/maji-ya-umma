import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import { StatusBadge } from "../../Components/status-badge";
import { api, useApi } from "../../lib/api";
import { formatDate } from "./shared";

function RequestConnectionPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const requests = useApi("/api/me/connection-requests");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [useSameLocation, setUseSameLocation] = useState(true);
  const [formData, setFormData] = useState({ address: "", city: "", zipCode: "" });

  useEffect(() => {
    if (profile) setFormData({ address: profile.address, city: profile.city, zipCode: profile.zipCode });
  }, [profile]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const pending = (requests.data?.requests ?? []).find((r) => r.status === "pending");

  const handleRequestConnection = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      await api("/api/me/connection-requests", {
        method: "POST",
        body: useSameLocation ? { useProfileAddress: true } : { useProfileAddress: false, ...formData },
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Connection request failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => navigate("/dashboard"), 2000);
      return () => clearTimeout(timer);
    }
  }, [success, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-md">
        <h1 className="text-center text-2xl font-bold text-gray-800">Request a New Connection</h1>

        {requests.loading ? (
          <div className="space-y-4 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
            <p className="text-gray-600">Loading your details...</p>
          </div>
        ) : success ? (
          <div className="space-y-4 text-center">
            <h2 className="text-xl font-semibold text-green-600">Connection request submitted!</h2>
            <p className="text-gray-600">We'll email you once it is reviewed. Redirecting to dashboard...</p>
          </div>
        ) : (
          <div>
            <button
              onClick={() => navigate("/dashboard")}
              className="mb-4 rounded-md bg-[#1EBBD7] px-4 py-2 text-white hover:bg-[#1EBBD7]/90"
            >
              Go Back to the Dashboard
            </button>

            {(requests.data?.requests ?? []).length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="font-medium text-gray-700">Your requests</p>
                {requests.data.requests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm text-gray-800">
                    <span>
                      {r.address}, {r.city} · {formatDate(r.createdAt)}
                      {r.meterNumber && <> · meter {r.meterNumber}</>}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}

            {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}

            {pending ? (
              <p className="text-gray-700">Your request for {pending.address} is waiting for review. You can submit another once it has been handled.</p>
            ) : (
              <>
                <p className="font-medium text-gray-700">Is the new connection at this location?</p>
                <div className="rounded-md border bg-gray-100 p-3 text-gray-800">
                  <p><strong>Address:</strong> {profile?.address}</p>
                  <p><strong>City:</strong> {profile?.city}</p>
                  <p><strong>ZIP Code:</strong> {profile?.zipCode}</p>
                </div>

                <div className="mt-4">
                  <label className="flex items-center space-x-2 font-medium text-gray-800">
                    <input type="radio" name="locationChoice" checked={useSameLocation} onChange={() => setUseSameLocation(true)} className="accent-[#1EBBD7]" />
                    <span>Use this location</span>
                  </label>
                  <label className="mt-2 flex items-center space-x-2 font-medium text-gray-800">
                    <input type="radio" name="locationChoice" checked={!useSameLocation} onChange={() => setUseSameLocation(false)} className="accent-[#1EBBD7]" />
                    <span>Enter a different location</span>
                  </label>
                </div>

                {!useSameLocation && (
                  <div className="mt-4 space-y-3">
                    {[
                      ["address", "Address"],
                      ["city", "City"],
                      ["zipCode", "ZIP Code"],
                    ].map(([id, label]) => (
                      <div key={id}>
                        <label className="block font-medium text-black" htmlFor={id}>{label}</label>
                        <input id={id} type="text" className="w-full rounded-md border bg-white p-2 text-black" value={formData[id] ?? ""} onChange={handleChange} />
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleRequestConnection}
                  disabled={isSubmitting}
                  className="mt-6 w-full rounded-md bg-[#1EBBD7] px-4 py-2 text-white hover:bg-[#1EBBD7]/90 disabled:opacity-60"
                >
                  {isSubmitting ? "Submitting..." : "Submit Request"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestConnectionPage;
