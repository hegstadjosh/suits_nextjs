import { ChatPanel } from "~/app/_components/ChatPanel";
import { StatusPanel } from "~/app/_components/StatusPanel";

export default async function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
          <ChatPanel />
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
          <StatusPanel />
        </div>
      </div>
    </main>
  );
}
