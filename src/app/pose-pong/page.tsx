import PosePongClientWrapper from "./PosePongClientWrapper";

export const metadata = {
  title: "GDG Air Hockey Game",
};

export default function PosePongPage() {
  return (
    <main className="min-h-screen bg-black overflow-hidden relative font-sans">
      <PosePongClientWrapper />
    </main>
  );
}
