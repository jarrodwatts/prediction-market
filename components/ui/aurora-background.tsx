import React from "react";

export const AuroraBackground = () => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute -top-[10%] -left-[10%] w-[70rem] h-[70rem] bg-blue-200 rounded-full mix-blend-multiply filter blur-[160px] opacity-20 dark:mix-blend-screen dark:bg-blue-600/20 dark:opacity-15"></div>
      <div className="absolute top-[10%] -right-[10%] w-[70rem] h-[70rem] bg-red-200 rounded-full mix-blend-multiply filter blur-[160px] opacity-20 dark:mix-blend-screen dark:bg-red-600/20 dark:opacity-15"></div>
    </div>
  );
};
