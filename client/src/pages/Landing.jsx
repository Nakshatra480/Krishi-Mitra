import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import farmerHero from '../assets/farmer_hero.jpg';

export default function Landing() {
  const { user } = useAuth();
  const { theme } = useTheme();

  const isDark = theme === 'dark';

  return (
    <div className={`transition-colors duration-300 min-h-screen ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-white text-gray-900'}`} style={{ fontFamily: "'Poppins', sans-serif" }}>

      {/* ─── Hero Section ─── */}
      <section id="home" className="relative min-h-[88vh] flex items-center overflow-hidden py-12">
        {/* Background image covering full width, placed on the right */}
        <img
          src={farmerHero}
          alt="Smiling Indian Farmer in lush green crop field"
          className="absolute inset-0 w-full h-full object-cover object-right sm:object-center"
          style={{ filter: isDark ? 'brightness(0.5) saturate(1.0)' : 'brightness(1.05) saturate(1.15)' }}
        />

        {/* Dynamic gradient overlay that fades from white/dark-slate on the left to transparent on the right */}
        <div className={`absolute inset-0 bg-gradient-to-r ${isDark ? 'from-slate-950 via-slate-950/85 to-transparent' : 'from-white via-white/90 to-transparent'} w-full sm:w-[65%] z-0`} />
        <div className={`absolute inset-0 bg-gradient-to-t ${isDark ? 'from-slate-950/90 via-transparent to-slate-950/30' : 'from-white/60 via-transparent to-white/30'} z-0`} />

        {/* Hero Content */}
        <div className="relative z-10 px-6 sm:px-12 lg:px-20 max-w-7xl mx-auto w-full">
          <div className="max-w-xl">
            {/* Main Headline */}
            <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-5 tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Smarter Insights.
              <br />
              <span className="text-green-600">Better Yields.</span>
            </h1>

            {/* Subtext description matching screenshot exactly */}
            <p className={`text-base sm:text-lg leading-relaxed mb-8 max-w-md ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
              Al-powered crop insights, weather intelligence, yield prediction, and trusted farming recommendations — all in one place.
            </p>

            {/* Call to Actions */}
            <div className="flex flex-wrap items-center gap-4 mb-10">
              <Link
                to={user ? '/dashboard' : '/register'}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-green-700 hover:bg-green-600 text-white rounded-full font-semibold text-sm transition-all shadow-md shadow-green-700/20 active:scale-98"
              >
                Get Started
                <span className="text-lg">→</span>
              </Link>
              
              <a
                href="#how-it-works"
                className={`inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full font-semibold text-sm border transition-all shadow-xs active:scale-98 ${
                  isDark
                    ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-800'
                    : 'bg-white hover:bg-gray-50 text-gray-800 border-gray-300'
                }`}
              >
                {/* Play button icon in circular container */}
                <span className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white text-[10px] pl-0.5">
                  ▶
                </span>
                See How It Works
              </a>
            </div>


          </div>
        </div>
      </section>

      {/* ─── Feature Cards Row ─── */}
      <section id="features" className="relative -mt-16 z-20 px-4 sm:px-12 lg:px-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#2e7d32" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ),
              bgColor: '#e8f5e9',
              darkBgColor: 'rgba(46, 125, 50, 0.2)',
              title: 'Yield Prediction',
              desc: 'AI models predict your crop yield with high accuracy.',
            },
            {
              icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#0288d1" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              ),
              bgColor: '#e0f7fa',
              darkBgColor: 'rgba(2, 136, 209, 0.2)',
              title: 'Weather & GDD',
              desc: 'Real-time weather updates and Growing Degree Days tracking.',
            },
            {
              icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#2e7d32" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              ),
              bgColor: '#e8f5e9',
              darkBgColor: 'rgba(46, 125, 50, 0.2)',
              title: 'Crop Lifecycle',
              desc: 'Stage-wise guidance from sowing to harvest for better planning.',
            },
            {
              icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#f57c00" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              ),
              bgColor: '#fff3e0',
              darkBgColor: 'rgba(245, 124, 0, 0.2)',
              title: 'AI Krishi Assistant',
              desc: 'Get answers to your farming queries instantly with our AI assistant.',
            },
          ].map((card) => (
            <div
              key={card.title}
              className={`rounded-2xl p-6 border transition-all duration-300 group ${
                isDark
                  ? 'bg-slate-900 border-slate-800 shadow-xl shadow-slate-950/50 hover:bg-slate-850 hover:border-slate-700'
                  : 'bg-white border-gray-100 shadow-md shadow-gray-200/50 hover:shadow-lg hover:-translate-y-0.5'
              }`}
            >
              {/* Perfectly centered circle background for clean icons */}
              <div
                style={{ backgroundColor: isDark ? card.darkBgColor : card.bgColor }}
                className="w-14 h-14 rounded-full flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"
              >
                {card.icon}
              </div>
              <h3 className={`font-bold text-base mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{card.title}</h3>
              <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How It Works (Pipeline) Section ─── */}
      <section id="how-it-works" className="px-6 sm:px-12 lg:px-20 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-bold uppercase tracking-widest mb-4 dark:bg-green-950/20 dark:border-green-900 dark:text-green-400">
            OUR 4-STEP PROCESS
          </span>
          <h2 className={`text-3xl sm:text-4xl font-extrabold mb-3 tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            How KrishiMitra Works
          </h2>
          <p className={`text-sm max-w-lg mx-auto leading-relaxed ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            From farm data to actionable farming decisions — powered by AI and verified for safety.
          </p>
        </div>

        {/* Steps Grid with connect dots/lines */}
        <div className="grid md:grid-cols-4 gap-8 md:gap-6 relative">
          {/* Dotted connected line between steps for desktop — centered at 48px */}
          <div className="hidden md:block absolute top-[48px] left-[12%] right-[12%] border-t-2 border-dotted border-gray-300 dark:border-slate-700 z-0" />

          {[
            {
              step: '01',
              title: 'Know Your Field',
              desc: 'Tell us about your crop, location, soil, and cultivation details.',
              bgColor: '#e8f5e9',
              darkBgColor: 'rgba(46, 125, 50, 0.2)',
              iconColor: '#2e7d32',
              icon: (
                // Sprout/Plant icon
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="#2e7d32" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C12 8 8 10 3 10c0 6 4 8 9 8m0-16c0 6 4 8 9 8-5 0-9 2-9 8m0 0v4" />
                </svg>
              )
            },
            {
              step: '02',
              title: 'Understand Conditions',
              desc: 'We analyze weather, temperature, rainfall, and Growing Degree Days.',
              bgColor: '#e0f7fa',
              darkBgColor: 'rgba(2, 136, 209, 0.2)',
              iconColor: '#0288d1',
              icon: (
                // Rain cloud with drops
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="#0288d1" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 19v1m4-1v1m4-1v1" />
                </svg>
              )
            },
            {
              step: '03',
              title: 'Get AI Insights',
              desc: 'Our models predict yield and generate crop-specific recommendations.',
              bgColor: '#e8f5e9',
              darkBgColor: 'rgba(46, 125, 50, 0.2)',
              iconColor: '#2e7d32',
              icon: (
                // Growth chart trending up
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="#2e7d32" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l-4 4-3-3-3 3" />
                </svg>
              )
            },
            {
              step: '04',
              title: 'Verify Before You Act',
              desc: 'Recommendations are checked for risks before reaching the farmer.',
              bgColor: '#fff3e0',
              darkBgColor: 'rgba(245, 124, 0, 0.2)',
              iconColor: '#f57c00',
              icon: (
                // Shield check with plant
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="#f57c00" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )
            }
          ].map((item, idx) => (
            <div key={item.step} className="relative flex flex-col items-center text-center px-4 z-10 group">
              {/* Perfectly centered circle background for clean icons */}
              <div
                style={{ backgroundColor: isDark ? item.darkBgColor : item.bgColor }}
                className={`w-24 h-24 rounded-full flex items-center justify-center border shadow-sm transition-transform duration-300 group-hover:scale-105 ${
                  isDark ? 'border-slate-800' : 'border-gray-200'
                }`}
              >
                {item.icon}
                {/* Number indicator - positioned closer to the circle */}
                <span className={`absolute -top-2 -right-2 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shadow-sm ${
                  isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-gray-300 text-slate-700'
                }`}>
                  {item.step}
                </span>
              </div>

              {/* Connector arrow between steps - positioned exactly on the dotted line */}
              {idx < 3 && (
                <div className={`hidden md:flex absolute top-[48px] -translate-y-1/2 -right-[calc((100%-96px)/2)] w-6 h-6 rounded-full items-center justify-center z-20 ${
                  isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-gray-300'
                } shadow-sm`}>
                  <svg className={`w-3.5 h-3.5 ${isDark ? 'text-green-400' : 'text-green-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}

              <h3 className={`font-bold text-lg mt-6 mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.title}</h3>
              <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Interactive Dashboard Mockup Section ─── */}
      <section className="px-6 sm:px-12 lg:px-20 pb-24 max-w-7xl mx-auto w-full">
        {/* Dark container exactly matching mockup styling */}
        <div className="rounded-3xl overflow-hidden shadow-2xl bg-[#0b1424] border border-slate-800 text-white p-8 lg:p-12">
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            
            {/* Left side text column */}
            <div className="lg:col-span-4 space-y-6">
              <h2 className="text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight">
                Your Farm.
                <br />
                Your Data.
                <br />
                <span className="text-green-400">Your Decisions.</span>
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                KrishiMitra transforms weather, crop, and AI data into simple recommendations you can actually use.
              </p>

              {/* 4 Feature mini bullets */}
              <div className="space-y-4 pt-4">
                {[
                  { text: 'AI-Powered Insights', icon: '🌿' },
                  { text: 'Real-time Weather', icon: '⛅' },
                  { text: 'Verified Safety', icon: '🛡️' },
                  { text: 'Better Yields', icon: '📈' }
                ].map((bullet) => (
                  <div key={bullet.text} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-slate-800/80 flex items-center justify-center text-sm">{bullet.icon}</span>
                    <span className="text-sm font-semibold text-slate-200">{bullet.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side Dashboard visual simulation */}
            <div className="lg:col-span-8 bg-[#090d16]/95 border border-slate-800/60 rounded-2xl p-5 sm:p-6 shadow-inner space-y-6">
              
              {/* Stat cards grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* 1. Expected Yield */}
                <div className="bg-[#0e1726]/60 border border-slate-800/60 p-4 rounded-xl space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Expected Yield</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl sm:text-2xl font-extrabold text-white">4.8</span>
                    <span className="text-xs text-slate-400">tonnes/ha</span>
                  </div>
                  {/* Small line chart mockup */}
                  <svg className="w-full h-8 text-green-500" viewBox="0 0 100 30" fill="none">
                    <path d="M0 25c15-5 25-15 40-10s25-10 40-5 10-15 20-20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                  </svg>
                </div>

                {/* 2. Crop Health */}
                <div className="bg-[#0e1726]/60 border border-slate-800/60 p-4 rounded-xl space-y-2 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Crop Health</span>
                    <span className="text-xl sm:text-2xl font-extrabold text-white">72%</span>
                    <span className="text-xs text-green-400 ml-1 font-semibold">Healthy</span>
                  </div>
                  {/* Gauge circle SVG */}
                  <div className="flex justify-end -mt-2">
                    <svg className="w-9 h-9" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="16" fill="none" stroke="#1e293b" strokeWidth={4} />
                      <circle cx="18" cy="18" r="16" fill="none" stroke="#16a34a" strokeWidth={4} strokeDasharray="72 100" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                {/* 3. Temperature */}
                <div className="bg-[#0e1726]/60 border border-slate-800/60 p-4 rounded-xl space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Temperature</span>
                  <span className="text-xl sm:text-2xl font-extrabold text-white">28°C</span>
                  <span className="text-[10px] text-slate-400 block">Feels like 31°C</span>
                </div>

                {/* 4. Rainfall Forecast */}
                <div className="bg-[#0e1726]/60 border border-slate-800/60 p-4 rounded-xl space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Rainfall Forecast</span>
                  <span className="text-xl sm:text-2xl font-extrabold text-white">18 mm</span>
                  <span className="text-[10px] text-slate-400 block">Next 7 Days</span>
                </div>
              </div>

              {/* Middle Row Charts - Grid layout */}
              <div className="grid sm:grid-cols-12 gap-5">
                
                {/* Crop Growth Progress Chart */}
                <div className="sm:col-span-8 bg-[#0e1726]/40 border border-slate-850 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-200">Crop Growth Progress</span>
                    <span className="bg-green-600/30 text-green-400 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      72%
                    </span>
                  </div>
                  {/* Nice line chart representation */}
                  <div className="relative pt-6">
                    <svg className="w-full h-32 text-green-500" viewBox="0 0 300 100" fill="none">
                      <defs>
                        <linearGradient id="gradient-chart" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#16a34a" stopOpacity="0.25"/>
                          <stop offset="100%" stopColor="#16a34a" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      {/* Grid Lines */}
                      <line x1="0" y1="20" x2="300" y2="20" stroke="#1e293b" strokeDasharray="3 3"/>
                      <line x1="0" y1="50" x2="300" y2="50" stroke="#1e293b" strokeDasharray="3 3"/>
                      <line x1="0" y1="80" x2="300" y2="80" stroke="#1e293b" strokeDasharray="3 3"/>
                      {/* Chart Area */}
                      <path d="M0 90 Q 50 85, 100 68 T 200 45 T 270 28" stroke="#16a34a" strokeWidth={3} strokeLinecap="round"/>
                      <path d="M0 90 Q 50 85, 100 68 T 200 45 T 270 28 L 270 100 L 0 100 Z" fill="url(#gradient-chart)"/>
                      {/* Current point indicator */}
                      <circle cx="270" cy="28" r="5" fill="#16a34a"/>
                      <circle cx="270" cy="28" r="8" stroke="#16a34a" strokeWidth={2} className="animate-ping"/>
                    </svg>
                    {/* Months labels */}
                    <div className="flex justify-between text-[9px] text-slate-500 px-1 pt-2">
                      <span>May</span>
                      <span>Jun</span>
                      <span>Jul</span>
                      <span>Aug</span>
                      <span>Sep</span>
                      <span>Oct</span>
                    </div>
                  </div>
                </div>

                {/* Weather Overview Chart */}
                <div className="sm:col-span-4 bg-[#0e1726]/40 border border-slate-850 p-4 rounded-xl space-y-3">
                  <span className="text-xs font-bold text-slate-200 block">Weather Overview</span>
                  {/* Daily weather bars representation */}
                  <div className="flex justify-between items-end h-32 pt-2">
                    {[
                      { day: 'Mon', h: 'h-12', icon: '☀️' },
                      { day: 'Tue', h: 'h-16', icon: '⛅' },
                      { day: 'Wed', h: 'h-24', icon: '🌧️' },
                      { day: 'Thu', h: 'h-20', icon: '🌧️' },
                      { day: 'Fri', h: 'h-14', icon: '⛅' },
                      { day: 'Sat', h: 'h-18', icon: '☀️' },
                      { day: 'Sun', h: 'h-10', icon: '☀️' }
                    ].map((w, idx) => (
                      <div key={w.day} className="flex flex-col items-center gap-1.5 flex-1">
                        <span className="text-[10px]">{w.icon}</span>
                        <div className={`w-2.5 rounded-t-full bg-blue-500/80 ${w.h}`} />
                        <span className="text-[8px] text-slate-500 font-semibold">{w.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Row - Banner Alerts */}
              <div className="grid sm:grid-cols-2 gap-4">
                
                {/* 1. Today's Recommendation Banner */}
                <div className="bg-green-950/40 border border-green-800/40 p-4 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">🌱</span>
                    <div>
                      <span className="text-[9px] text-green-400 font-bold uppercase tracking-wider block">Today's Recommendation</span>
                      <p className="text-xs text-slate-200 font-medium leading-relaxed">
                        Rain is expected in the next 48 hours. Consider adjusting irrigation.
                      </p>
                    </div>
                  </div>
                  <button className="flex-shrink-0 text-[10px] font-bold text-green-450 hover:underline">
                    View Details
                  </button>
                </div>

                {/* 2. Risk Check Banner */}
                <div className="bg-[#0e1726]/60 border border-slate-800/60 p-4 rounded-xl flex items-center gap-3">
                  {/* Glowing Shield Check Icon */}
                  <div className="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Risk Check</span>
                    <span className="text-xs text-white font-extrabold block">Low Risk</span>
                    <span className="text-[10px] text-slate-400">No major risks detected</span>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      </section>

      {/* ─── Footer Section ─── */}
      <footer className={`border-t transition-colors duration-300 ${isDark ? 'bg-slate-950 border-slate-900' : 'bg-gray-50 border-gray-200'}`}>
        <div className="max-w-7xl mx-auto px-6 py-12 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-2xl">🌾</span>
            <span className="font-extrabold text-green-700 text-lg">KrishiMitra</span>
          </div>
          <p className={`italic text-sm max-w-xl mx-auto mb-4 leading-relaxed ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            "The LLM does not have authority. It identifies risks.<br />
            <strong className="text-green-700 not-italic">Deterministic code verifies evidence and makes the final decision.</strong>"
          </p>
          <p className="text-gray-400 text-xs mt-3">Smart India Hackathon · KrishiMitra Crop Intelligence</p>
        </div>
      </footer>
    </div>
  );
}
