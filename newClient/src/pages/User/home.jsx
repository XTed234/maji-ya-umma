import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import waterAccess from "../../assets/water-access.jpg";
import communitySupport from "../../assets/community-support.jpg";
import waterTracking from "../../assets/water-tracking.jpg";


const slides = [
  {
    title:"Maji ya Umma",
    subtitle: "Affordable, Clean Water for All",
    description:
      "MajiYaUmma ensures that every household has access to safe and affordable water.",
    image: waterAccess,
  },
  {
    title: "Empowering Communities",
    description:
      "We work with local leaders to build sustainable water solutions for the people.",
    image: communitySupport,
  },
  {
    title: "Convenient & Reliable",
    description:
      "Easily track water usage, pay bills, and find water points near you—all in one platform.",
    image: waterTracking,
  },
];

export default function HomePage() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={slides[current].title}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50"
        >
          <img
            src={slides[current].image}
            alt={slides[current].title}
            className="absolute inset-0 w-full h-full object-cover -z-10"
          />
          <div className="text-center text-gray px-6">
            <h1 className="text-4xl md:text-6xl font-bold mb-4">
              {slides[current].title}
            </h1>
            <p className="text-lg md:text-xl mb-6">
              {slides[current].description}
            </p>
            <Link to="/login">
            <Button className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg">
              Get Started
            </Button>
            </Link>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
