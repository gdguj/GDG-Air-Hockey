"use client";

import dynamic from "next/dynamic";

const AirHockeyGame = dynamic(() => import("./AirHockeyGame"), { ssr: false });

export default function GamePage() {
  return (
    <main className="min-h-screen bg-black overflow-hidden relative font-sans">
      <AirHockeyGame />
    </main>
  );
}
