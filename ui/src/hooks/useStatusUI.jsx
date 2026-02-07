import React from 'react';
import { Wifi, WifiOff, RefreshCcw } from "lucide-react";

export const useStatusUI = (status) => {
  const getStatusColor = () => {
    switch (status) {
      case "connected": return "text-success";
      case "connecting": return "text-warning";
      case "error": return "text-error";
      case "no_seed": return "text-info";
      default: return "text-neutral";
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
