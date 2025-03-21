import { useState, useEffect } from "react";
import axios from "axios";

const RequestConnectionPage = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Retrieve email from localStorage
    const storedEmail = localStorage.getItem("userEmail");
    if (storedEmail) {
      setEmail(storedEmail);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setMessage("User email not found. Please log in first.");
      return;
    }

    try {
      const res = await axios.post("http://localhost:5000/api/request-connection", { email });
      setMessage(res.data.message);
    } catch (error) {
      setMessage(error.response?.data?.message || "Request failed");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-6 rounded-lg shadow-md w-96">
        <h2 className="text-2xl font-semibold mb-4">Request Water Connection</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            readOnly
            className="w-full p-2 border rounded bg-gray-200"
          />
          <button type="submit" className="w-full bg-green-500 text-white p-2 rounded">Request Connection</button>
        </form>
        {message && <p className="mt-4 text-center text-sm text-gray-600">{message}</p>}
      </div>
    </div>
  );
};

export default RequestConnectionPage;
