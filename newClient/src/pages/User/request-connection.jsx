import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

function RequestConnectionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Try to get the user email from localStorage or context
    // Assuming the email was saved during registration/login
    const email = localStorage.getItem("userEmail");
    
    // If we don't have the email, check if it came from registration
    // For demonstration, we'll assume it's available from localStorage
    if (!email) {
      setError("User information not found. Please try logging in again.");
      setIsLoading(false);
      return;
    }

    const requestConnection = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/request-connection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (response.ok) {
          // Store userRole in localStorage
          if (data.userRole) {
            localStorage.setItem("userRole", data.userRole);
          }
          
          // Navigate based on userRole
          setTimeout(() => {
            if (data.userRole === "admin") {
              navigate("/admin/dashboard");
            } else {
              navigate("/dashboard");
            }
          }, 1000); // Small delay to show success before redirect
        } else {
          // Handle error
          setError(data.message || "Failed to process your connection request.");
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error during connection request:", error);
        setError("Network error or server unavailable. Please try again later.");
        setIsLoading(false);
      }
    };

    // Start the connection request process
    requestConnection();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md p-8 space-y-4 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center text-gray-800">
          Processing Your Connection
        </h1>
        
        {isLoading ? (
          <div className="text-center space-y-4">
            <Loader2 className="animate-spin h-8 w-8 mx-auto text-blue-500" />
            <p className="text-gray-600">
              We're setting up your connection request...
            </p>
            <p className="text-sm text-gray-500">
              This will only take a moment.
            </p>
          </div>
        ) : error ? (
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold text-red-600">
              Connection request failed
            </h2>
            <p className="text-gray-600">{error}</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="mt-4 px-4 py-2 bg-[#1EBBD7] text-white rounded-md hover:bg-[#1EBBD7]/90"
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold text-green-600">
              Connection request successful!
            </h2>
            <p className="text-gray-600">
              Redirecting you to the dashboard...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestConnectionPage;