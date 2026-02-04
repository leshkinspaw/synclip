import React from 'react';
import { Wifi, WifiOff, RefreshCcw } from "lucide-react";

export const useStatusUI = (status) => {
  const getStatusColor = () => {
    switch (status) {
      case "connected": return "text-green-500";
      case "connecting": return "text-yellow-500";
      case "error": return "text-red-500";
      case "no_seed": return "text-blue-500";
      default: return "text-gray-500";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "connected": return <Wifi className="w-4 h-4" />;
      case "connecting": return <RefreshCcw className="w-4 h-4 animate-spin" />;
      default: return <WifiOff className="w-4 h-4" />;
    }
  };

  const getStatusLabel = () => {
    return status?.toUpperCase() || "UNKNOWN";
  };

  return { getStatusColor, getStatusIcon, getStatusLabel };
};
