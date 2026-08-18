"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Zap, MessageCircle, Monitor, Sparkles, ArrowRight, ArrowUpRight, Crown } from 'lucide-react';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) {
    return <div className="h-screen" style={{ background: '#07080d' }}></div>;
  }
  return <HomeContent />;
}

function HomeContent() {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const router = useRouter();

  const [particles, setParticles] = useState<any[]>([]);

  useEffect(() => {
    // Generate particles on client only to avoid SSR hydration mismatch
    const newParticles = [...Array(15)].map((_, i) => ({
      left: `${Math.random() * 100}%`,
      animationDuration: `${15 + Math.random() * 15}s`,
      animationDelay: `-${Math.random() * 20}s`,
      width: `${2 + Math.random() * 3}px`,
      height: `${2 + Math.random() * 3}px`,
      background: i % 3 === 0 ? 'rgba(236, 72, 153, 0.4)' : i % 2 === 0 ? 'rgba(99, 102, 241, 0.4)' : 'rgba(168, 85, 247, 0.4)'
    }));
    setParticles(newParticles);
  }, []);

  const handleCreate = () => {
    if (!name.trim()) return alert("Please enter your name");
    const newRoomId = Math.random().toString(36).substring(2, 9);
    localStorage.setItem('watch_party_username', name);
    router.push(`/room/${newRoomId}`);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert("Please enter your name");
    if (!roomId.trim()) return alert("Please enter a room ID");
    localStorage.setItem('watch_party_username', name);
    router.push(`/room/${roomId}`);
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center min-h-screen relative overflow-x-hidden overflow-y-auto">
      {/* ─── Animated Premium Background ─── */}
      <div className="bg-mesh pointer-events-none">
        <div className="bg-orb bg-orb-1" style={{ width: '800px', height: '800px', top: '-20%', left: '-20%', opacity: 0.15 }}></div>
        <div className="bg-orb bg-orb-2" style={{ width: '700px', height: '700px', bottom: '-20%', right: '-10%', opacity: 0.12 }}></div>
        <div className="bg-orb bg-orb-3" style={{ width: '900px', height: '900px', top: '30%', left: '40%', opacity: 0.1 }}></div>
      </div>
      <div className="bg-grid opacity-30"></div>
      
      {/* Particles */}
      <div className="particles pointer-events-none">
        {particles.map((style, i) => (
          <div key={i} className="particle" style={style}></div>
        ))}
      </div>

      {/* ─── Main Content ─── */}
      <div className="relative z-10 w-full max-w-[1200px] px-4 md:px-8 py-12 flex flex-col xl:flex-row items-center justify-center gap-16 xl:gap-24">
        
        {/* Left Column: Hero Copy */}
        <div 
          className="flex-1 text-center xl:text-left flex flex-col items-center xl:items-start"
          style={{ animation: 'fadeInScale 1s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
        >
          {/* Logo icon floating */}
          <div className="relative inline-flex items-center justify-center mb-8">
            <div 
              className="absolute w-32 h-32 rounded-full opacity-60"
              style={{ 
                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.6), transparent 70%)',
                animation: 'pulse-ring 3s ease-out infinite'
              }}
            ></div>
            <div 
              className="w-24 h-24 rounded-[2rem] flex items-center justify-center relative shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #db2777)',
                boxShadow: '0 10px 40px rgba(99, 102, 241, 0.5), inset 0 2px 0 rgba(255,255,255,0.3)',
                animation: 'float 6s ease-in-out infinite'
              }}
            >
              <Play className="text-white w-12 h-12 ml-2" fill="currentColor" />
            </div>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tighter leading-tight drop-shadow-2xl">
            <span className="gradient-text">Watch</span> Party
          </h1>
          <p className="text-gray-300 text-lg md:text-xl max-w-lg mb-8 leading-relaxed">
            Watch <strong className="text-white">YouTube</strong> & <strong className="text-white">Netflix</strong> in perfect sync with your friends, wherever they are.
          </p>

          {/* Platform badges */}
          <div className="flex flex-wrap items-center justify-center xl:justify-start gap-4 mb-12">
            <div className="glass-panel px-5 py-2.5 rounded-full flex items-center gap-2 shadow-lg border border-red-500/20 hover:border-red-500/50 transition-colors">
              <svg viewBox="0 0 24 24" fill="#ef4444" width="20" height="20">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/>
                <path d="M9.545 15.568V8.432L15.818 12z" fill="white"/>
              </svg>
              <span className="font-semibold text-gray-200">YouTube</span>
            </div>
            <div className="glass-panel px-5 py-2.5 rounded-full flex items-center gap-2 shadow-lg border border-red-600/20 hover:border-red-600/50 transition-colors">
              <svg viewBox="0 0 24 24" fill="#e50914" width="20" height="20">
                <path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24h-4.715z"/>
              </svg>
              <span className="font-semibold text-gray-200">Netflix</span>
            </div>
          </div>

          {/* Feature Cards inline */}
          <div className="grid grid-cols-3 gap-4 w-full max-w-lg">
            <div className="flex flex-col items-center xl:items-start gap-2 group">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all">
                <Zap size={20} className="text-indigo-400" />
              </div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Zero Delay</span>
            </div>
            <div className="flex flex-col items-center xl:items-start gap-2 group">
              <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center group-hover:scale-110 group-hover:bg-pink-500/20 transition-all">
                <MessageCircle size={20} className="text-pink-400" />
              </div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Live Chat</span>
            </div>
            <div className="flex flex-col items-center xl:items-start gap-2 group">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center group-hover:scale-110 group-hover:bg-purple-500/20 transition-all">
                <Monitor size={20} className="text-purple-400" />
              </div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">HD Sync</span>
            </div>
          </div>
        </div>

        {/* Right Column: Join/Create Panel */}
        <div 
          className="w-full max-w-[420px]"
          style={{ animation: 'fadeInScale 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards', opacity: 0 }}
        >
          <div className="glass-panel-glow p-8 md:p-10 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-500/20 blur-3xl rounded-full"></div>
            
            <div className="relative z-10">
              <h2 className="text-2xl font-bold mb-8 text-white flex items-center gap-2">
                <Sparkles className="text-purple-400" /> Let's get started
              </h2>

              {/* Name Input */}
              <div className="mb-8 group">
                <label className="block text-sm font-medium mb-3 text-gray-300">
                  What's your name?
                </label>
                <div className="relative">
                  <input 
                    type="text" 
                    className="w-full bg-black/40 border-white/10 text-lg py-3 px-4 focus:bg-black/60 transition-all placeholder:text-gray-600 rounded-xl"
                    placeholder="e.g. John Doe" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <div className="absolute inset-0 rounded-xl border border-indigo-500/0 group-focus-within:border-indigo-500/50 pointer-events-none transition-colors"></div>
                </div>
              </div>

              {/* Create Room */}
              <button 
                className="w-full flex justify-center items-center gap-3 text-lg py-4 rounded-xl shadow-[0_0_40px_rgba(99,102,241,0.4)] hover:shadow-[0_0_60px_rgba(99,102,241,0.6)]"
                onClick={handleCreate}
              >
                <Crown size={20} />
                Create New Room
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Divider */}
              <div className="relative flex py-8 items-center">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink-0 mx-4 text-gray-500 text-xs uppercase tracking-widest font-bold">or join existing</span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              {/* Join Room */}
              <form onSubmit={handleJoin} className="flex gap-3">
                <input 
                  type="text" 
                  className="flex-1 bg-black/40 border-white/10 py-3 px-4 rounded-xl placeholder:text-gray-600"
                  placeholder="Paste Room ID..." 
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                />
                <button type="submit" className="btn-secondary whitespace-nowrap px-6 rounded-xl font-semibold flex items-center gap-2">
                  Join
                  <ArrowUpRight size={16} />
                </button>
              </form>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-gray-500 text-xs font-medium tracking-wide">
            <span className="opacity-70">Crafted with ❤️ by </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-pink-400 font-bold text-sm ml-1">KTECH</span>
          </div>
        </div>

      </div>
    </main>
  );
}
