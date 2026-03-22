import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🗺️</span>
          <span className="text-xl font-bold tracking-tight text-white">Planit</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/onboarding"
            className="text-sm px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          Powered by Gemini 2.0 Flash + LangGraph
        </div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white max-w-3xl leading-tight">
          Your AI travel sidekick that{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
            learns you
          </span>
        </h1>

        <p className="mt-6 text-lg text-zinc-400 max-w-xl leading-relaxed">
          Planit remembers your allergies, mobility needs, and vibes. It builds branching
          itineraries, finds accessible routes, and pivots your whole day when it rains —
          all through natural voice conversation.
        </p>

        <div className="flex items-center gap-4 mt-10">
          <Link
            href="/onboarding"
            className="px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-violet-500/20"
          >
            Start planning →
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-2xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-semibold text-sm transition-colors"
          >
            View demo
          </Link>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-20 max-w-3xl w-full text-left">
          {[
            {
              emoji: "🧠",
              title: "Persistent Memory",
              desc: "Remembers your allergies, mobility needs, and dislikes across every trip.",
            },
            {
              emoji: "🌿",
              title: "Branching Itineraries",
              desc: "Every activity has 2–3 alternatives. Switch paths with one tap.",
            },
            {
              emoji: "🎙️",
              title: "Gemini Live Voice",
              desc: "Talk to Planit like a local guide. Barge-in anytime to redirect.",
            },
            {
              emoji: "♿",
              title: "Accessibility Engine",
              desc: "Verifies elevator access, filters allergens, and tags quiet spaces.",
            },
            {
              emoji: "⛅",
              title: "Proactive Pivots",
              desc: "Detects rain and re-routes your afternoon before you even ask.",
            },
            {
              emoji: "🔗",
              title: "Deep Booking Links",
              desc: "Every spot has direct links: Uber, Booking.com, OpenTable, and more.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 transition-colors"
            >
              <span className="text-2xl">{f.emoji}</span>
              <h3 className="font-semibold text-white mt-3 mb-1">{f.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="text-center py-8 text-xs text-zinc-700 border-t border-zinc-900">
        Planit — Built for the AI Travel Sidekick Hackathon
      </footer>
    </div>
  );
}
