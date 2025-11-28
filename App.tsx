import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Trash2, Play, Pause, Radio, Loader2, FileText, Download, ArrowRight, Link as LinkIcon, ExternalLink, Settings, Gauge, Search, Newspaper, Sparkles, Globe, Mic, Cpu, Briefcase, Beaker, Heart, Trophy, Film, CheckCircle2, History, X, Clock, LogIn, ShieldCheck } from 'lucide-react';
import { Article, AppState, VoiceName, GroundingSource, Language, VoiceGender, LANGUAGES, CachedBriefing, HistoryItem } from './types';
import { generateBriefingScript, generateSpeech, generateCoverImage } from './services/gemini';
import { getAudioContext, createWavBlob } from './services/audioUtils';

export default function App() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // App State
  const [articles, setArticles] = useState<Article[]>([
    { id: '1', type: 'search', content: '' }
  ]);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [summary, setSummary] = useState<string>('');
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  
  // Settings
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('English');
  const [selectedGender, setSelectedGender] = useState<VoiceGender>('Female');
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Background Cache State
  const [cache, setCache] = useState<Record<string, CachedBriefing>>({});

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  
  // Position Tracking Refs
  const savedBufferOffsetRef = useRef<number>(0);
  const segmentStartTimeRef = useRef<number>(0);

  const QUICK_CATEGORIES = [
    { 
      id: 'tech', 
      label: 'Tech', 
      image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=60',
      icon: Cpu, 
      color: 'from-blue-500 to-cyan-400' 
    },
    { 
      id: 'biz', 
      label: 'Business', 
      image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=500&auto=format&fit=crop&q=60',
      icon: Briefcase, 
      color: 'from-emerald-500 to-teal-400' 
    },
    { 
      id: 'science', 
      label: 'Science', 
      image: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=500&auto=format&fit=crop&q=60',
      icon: Beaker, 
      color: 'from-purple-500 to-pink-400' 
    },
    { 
      id: 'health', 
      label: 'Health', 
      image: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=500&auto=format&fit=crop&q=60',
      icon: Heart, 
      color: 'from-rose-500 to-red-400' 
    },
    { 
      id: 'sports', 
      label: 'Sports', 
      image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=500&auto=format&fit=crop&q=60',
      icon: Trophy, 
      color: 'from-amber-500 to-orange-400' 
    },
    { 
      id: 'entertainment', 
      label: 'Cinema', 
      image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=60',
      icon: Film, 
      color: 'from-violet-500 to-fuchsia-400' 
    },
  ];

  // Auth Check Effect
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // If window.aistudio exists (AI Studio environment), use it
        if (window.aistudio) {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setIsAuthenticated(hasKey);
        } else {
          // Fallback for development/other environments: check if key is in env
          setIsAuthenticated(!!process.env.API_KEY);
        }
      } catch (e) {
        console.error("Auth check failed", e);
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  // Background Pre-fetching Logic (Optimized for Speed) - Only runs when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const startPreFetching = async () => {
      
      QUICK_CATEGORIES.forEach(async (cat) => {
         setCache(prev => ({
             ...prev,
             [cat.label]: { 
                 id: cat.label, 
                 status: 'pending', 
                 summary: '', 
                 sources: [], 
                 audioBuffer: null, 
                 imageUrl: null, 
                 timestamp: Date.now() 
             }
         }));

         try {
             // 1. Generate Script
             const topic = `Top 5 recent ${cat.label} headlines`;
             const dummyArticle: Article = { id: 'bg', type: 'search', content: topic };
             const result = await generateBriefingScript([dummyArticle], 'English'); 

             // 2. Start Asset Generation in Parallel
             const voiceName = getVoiceForGender('Female'); 
             const audioPromise = generateSpeech(result.script, voiceName);
             const imagePromise = generateCoverImage(result.script);

             // 3. OPTIMIZATION: Wait for Audio ONLY to mark as ready
             // This makes the card clickable much faster
             const buffer = await audioPromise;

             setCache(prev => ({
                 ...prev,
                 [cat.label]: {
                     id: cat.label,
                     status: 'ready', // It's ready to play!
                     summary: result.script,
                     sources: result.sources,
                     audioBuffer: buffer,
                     imageUrl: null, // Image might not be ready yet
                     timestamp: Date.now()
                 }
             }));

             // 4. Update with Image when it arrives
             imagePromise.then(img => {
                 setCache(prev => ({
                    ...prev,
                    [cat.label]: {
                        ...prev[cat.label],
                        imageUrl: img
                    }
                 }));
             });

         } catch (error) {
             console.error(`Background fetch failed for ${cat.label}`, error);
             setCache(prev => ({
                 ...prev,
                 [cat.label]: { ...prev[cat.label], status: 'error' }
             }));
         }
      });
    };

    startPreFetching();
  }, [isAuthenticated]); 

  // Helper to init audio context safely
  const initAudio = () => {
    const ctx = getAudioContext();
    audioContextRef.current = ctx;
  };

  // Map gender to specific Gemini voice
  const getVoiceForGender = (gender: VoiceGender): VoiceName => {
      // Mapping: Female -> Kore, Male -> Puck
      return gender === 'Female' ? VoiceName.Kore : VoiceName.Puck;
  };

  const handleLogin = async () => {
      if (window.aistudio) {
          try {
              await window.aistudio.openSelectKey();
              const hasKey = await window.aistudio.hasSelectedApiKey();
              setIsAuthenticated(hasKey);
          } catch (e) {
              console.error("Login failed", e);
          }
      } else {
          // Fallback or alert if not in supported env
          alert("Login is only supported in the Gemini AI Studio environment.");
      }
  };

  const addToHistory = (item: HistoryItem) => {
    setHistory(prev => {
        // Prevent generic/duplicate IDs if rapid clicking
        const exists = prev.find(i => i.id === item.id);
        if (exists) return prev;
        return [item, ...prev];
    });
  };

  const loadHistoryItem = (item: HistoryItem) => {
      // Pause current if playing
      if (appState === AppState.PLAYING) {
        pauseAudio();
      }

      // Resume context
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      initAudio();

      setSummary(item.summary);
      setSources(item.sources);
      setImageUrl(item.imageUrl);
      audioBufferRef.current = item.audioBuffer;
      savedBufferOffsetRef.current = 0;
      
      // Update inputs to reflect
      setArticles([{ id: 'history', type: 'search', content: item.topic }]);
      
      setAppState(AppState.READY);
      setShowHistory(false);
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setHistory(prev => prev.filter(i => i.id !== id));
  };

  const addArticle = () => {
    setArticles(prev => [
      ...prev,
      { id: Date.now().toString(), type: 'search', content: '' }
    ]);
  };

  const removeArticle = (id: string) => {
    setArticles(prev => prev.filter(a => a.id !== id));
  };

  const updateArticle = (id: string, updates: Partial<Article>) => {
    setArticles(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  // Standard Manual Generation (Optimized: Non-blocking Image)
  const performGeneration = async (targetArticles: Article[]) => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    initAudio();

    const validArticles = targetArticles.filter(a => a.content.trim().length > 0);
    if (validArticles.length === 0) {
      setErrorMessage("Please enter at least one search topic.");
      return;
    }

    setErrorMessage(null);
    setAppState(AppState.SUMMARIZING);
    setSummary('');
    setSources([]);
    setImageUrl(null);

    try {
      // 1. Generate Summary
      const result = await generateBriefingScript(validArticles, selectedLanguage);
      setSummary(result.script);
      setSources(result.sources);

      setAppState(AppState.SYNTHESIZING);

      // 2. Start both generations
      const voiceName = getVoiceForGender(selectedGender);
      const audioPromise = generateSpeech(result.script, voiceName);
      const imagePromise = generateCoverImage(result.script);

      // 3. Wait ONLY for Audio to enable playback
      // This is the key speed optimization
      const buffer = await audioPromise;
      audioBufferRef.current = buffer;
      savedBufferOffsetRef.current = 0;
      setAppState(AppState.READY);

      // 4. Handle Image when it arrives
      imagePromise.then((generatedImage) => {
          setImageUrl(generatedImage);
          // Add to History once we have the image (or could add earlier with null)
           const topic = validArticles.map(a => a.content).join(', ');
           addToHistory({
              id: Date.now().toString(),
              timestamp: Date.now(),
              topic: topic.length > 50 ? topic.substring(0, 50) + '...' : topic,
              summary: result.script,
              sources: result.sources,
              imageUrl: generatedImage,
              audioBuffer: buffer
          });
      });
      
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Something went wrong while generating the briefing.");
      setAppState(AppState.ERROR);
    }
  };

  const handleGenerate = () => {
    performGeneration(articles);
  };

  // Optimized Category Selection with Cache
  const handleCategorySelect = async (categoryLabel: string) => {
    const cachedData = cache[categoryLabel];

    // Check if Audio is ready (Image might still be null, which is fine)
    if (cachedData && cachedData.status === 'ready' && cachedData.audioBuffer) {
        
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        initAudio();

        setSummary(cachedData.summary);
        setSources(cachedData.sources);
        setImageUrl(cachedData.imageUrl); // Might be null initially
        audioBufferRef.current = cachedData.audioBuffer;
        savedBufferOffsetRef.current = 0;
        
        const topic = `Top 5 recent ${categoryLabel} headlines`;
        setArticles([{ id: 'cached', type: 'search', content: topic }]);
        
        // Add to History
        addToHistory({
            id: `${categoryLabel}-${cachedData.timestamp}`,
            timestamp: Date.now(),
            topic: topic,
            summary: cachedData.summary,
            sources: cachedData.sources,
            imageUrl: cachedData.imageUrl, // Will be null if clicked very fast
            audioBuffer: cachedData.audioBuffer
        });

        setAppState(AppState.READY);
        return;
    }

    if (cachedData && cachedData.status === 'pending') {
        setAppState(AppState.SUMMARIZING); 
    }

    // Fallback
    const topic = `Top 5 recent ${categoryLabel} headlines`;
    const newArticle: Article = { id: Date.now().toString(), type: 'search', content: topic };
    setArticles([newArticle]);
    performGeneration([newArticle]);
  };

  const commitProgress = (rate: number) => {
    if (audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      const elapsedRealTime = now - segmentStartTimeRef.current;
      const playedBufferTime = elapsedRealTime * rate;
      savedBufferOffsetRef.current += playedBufferTime;
      segmentStartTimeRef.current = now;
    }
  };

  const playAudio = useCallback(async () => {
    if (!audioBufferRef.current || !audioContextRef.current) return;
    
    const ctx = audioContextRef.current;
    
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }
    
    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.playbackRate.value = playbackRate;
    
    source.connect(ctx.destination);
    
    const startOffset = Math.max(0, savedBufferOffsetRef.current);
    
    try {
        source.start(0, startOffset);
    } catch (e) {
        console.error("Error starting audio source:", e);
        savedBufferOffsetRef.current = 0;
        source.start(0, 0);
    }
    
    segmentStartTimeRef.current = ctx.currentTime;
    sourceNodeRef.current = source;
    setAppState(AppState.PLAYING);

    source.onended = () => {
        setAppState(AppState.READY);
        savedBufferOffsetRef.current = 0;
    };
  }, [playbackRate]);

  const pauseAudio = useCallback(() => {
    if (sourceNodeRef.current && audioContextRef.current) {
      commitProgress(playbackRate);
      
      sourceNodeRef.current.onended = null; 
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {}
      
      setAppState(AppState.READY);
    }
  }, [playbackRate]); 

  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRate = parseFloat(e.target.value);
    
    if (appState === AppState.PLAYING && sourceNodeRef.current) {
        commitProgress(playbackRate);
        sourceNodeRef.current.playbackRate.value = newRate;
    }
    
    setPlaybackRate(newRate);
  };

  const handleDownload = () => {
    if (!audioBufferRef.current) return;
    const blob = createWavBlob(audioBufferRef.current);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `news-briefing-${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
      if (sourceNodeRef.current) {
          try { 
              sourceNodeRef.current.onended = null;
              sourceNodeRef.current.stop(); 
          } catch(e) {}
      }
      setAppState(AppState.IDLE);
      setSummary('');
      setSources([]);
      setImageUrl(null);
      audioBufferRef.current = null;
      savedBufferOffsetRef.current = 0;
  };

  // Auth Loading
  if (isAuthenticated === null) {
      return (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
      );
  }

  // Auth Login Screen
  if (!isAuthenticated) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center font-sans">
            <div className="max-w-md w-full space-y-8 animate-fade-in-up">
                
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <div className="p-6 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl shadow-2xl shadow-indigo-500/30 z-10 relative">
                            <Newspaper className="w-12 h-12 text-white" />
                        </div>
                        <div className="absolute -top-2 -right-2 bg-cyan-500 rounded-full p-2 border-4 border-slate-950 z-20">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-indigo-300 tracking-tight">
                            NewsBrief AI
                        </h1>
                        <p className="text-slate-400 text-lg">Your personalized global intelligence anchor.</p>
                    </div>
                </div>

                <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 shadow-xl">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 text-slate-300 text-sm bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                            <ShieldCheck className="w-10 h-10 text-emerald-400 flex-shrink-0" />
                            <p className="text-left">Securely connect your Google account to access Gemini's advanced news synthesis models.</p>
                        </div>

                        <button
                            onClick={handleLogin}
                            className="group relative w-full flex items-center justify-center gap-3 px-8 py-4 bg-white hover:bg-slate-50 text-slate-900 font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                        >
                            <LogIn className="w-5 h-5 text-indigo-600" />
                            <span>Connect with Google</span>
                        </button>
                    </div>
                    
                    <p className="mt-6 text-xs text-slate-500">
                        By connecting, you agree to use your own API key for generation.
                        <br />
                        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                            Billing Information
                        </a>
                    </p>
                </div>

            </div>
        </div>
      );
  }

  // Main App
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center font-sans overflow-x-hidden">
      
      {/* Header */}
      <header className="w-full max-w-4xl flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
        {/* Logo Section */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="p-3 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-xl shadow-indigo-500/20 z-10 relative">
              <Newspaper className="w-8 h-8 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 bg-cyan-500 rounded-full p-1 border-2 border-slate-950 z-20">
               <Sparkles className="w-3 h-3 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-indigo-300 tracking-tight">
              NewsBrief AI
            </h1>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">Global Intelligence</p>
          </div>
        </div>
        
        {/* Language & Voice Settings */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 p-2 rounded-xl border border-slate-800/50 backdrop-blur-sm">
           
           {/* Language Selector */}
           <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700">
             <Globe className="w-4 h-4 text-indigo-400" />
             <select 
               className="bg-transparent text-sm text-slate-200 focus:outline-none cursor-pointer"
               value={selectedLanguage}
               onChange={(e) => setSelectedLanguage(e.target.value as Language)}
               disabled={appState !== AppState.IDLE}
             >
               {LANGUAGES.map(lang => (
                 <option key={lang} value={lang} className="bg-slate-800">{lang}</option>
               ))}
             </select>
           </div>

           <div className="w-px h-6 bg-slate-700 mx-1"></div>

           {/* Voice Gender Selector */}
           <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
             <button
               onClick={() => setSelectedGender('Male')}
               disabled={appState !== AppState.IDLE}
               className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                 selectedGender === 'Male' 
                   ? 'bg-indigo-600 text-white shadow-md' 
                   : 'text-slate-400 hover:text-slate-200'
               }`}
             >
               <Mic className="w-3 h-3" />
               Male
             </button>
             <button
               onClick={() => setSelectedGender('Female')}
               disabled={appState !== AppState.IDLE}
               className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                 selectedGender === 'Female' 
                   ? 'bg-indigo-600 text-white shadow-md' 
                   : 'text-slate-400 hover:text-slate-200'
               }`}
             >
               <Mic className="w-3 h-3" />
               Female
             </button>
           </div>

           {/* History Toggle */}
           <button 
             onClick={() => setShowHistory(true)}
             className="ml-1 p-2 bg-slate-800 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
             title="View History"
           >
             <History className="w-4 h-4" />
           </button>
        </div>
      </header>

      <main className="w-full max-w-4xl space-y-6">
        
        {errorMessage && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg relative animate-fade-in" role="alert">
                <div className="flex gap-2 items-center">
                    <span className="font-bold">Error:</span>
                    <span>{errorMessage}</span>
                </div>
                <button onClick={() => setErrorMessage(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3 hover:text-white">
                    <span className="text-xl">&times;</span>
                </button>
            </div>
        )}

        {(appState === AppState.IDLE || appState === AppState.SUMMARIZING || appState === AppState.SYNTHESIZING) && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Quick Categories with Background Loading State */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {QUICK_CATEGORIES.map((cat) => {
                const status = cache[cat.label]?.status;
                const isReady = status === 'ready';
                const isPending = status === 'pending';

                return (
                    <button
                        key={cat.id}
                        onClick={() => handleCategorySelect(cat.label)}
                        disabled={appState !== AppState.IDLE}
                        className={`group relative h-28 overflow-hidden rounded-xl transition-all border ${isPending ? 'border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'border-slate-800 hover:-translate-y-1 hover:shadow-lg'}`}
                    >
                        {/* Background Image */}
                        <img 
                            src={cat.image} 
                            alt={cat.label} 
                            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${isPending ? 'opacity-30 scale-105' : 'opacity-50 group-hover:opacity-70'}`} 
                        />
                        
                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/50 to-transparent" />

                        {/* Pending Progress Bar */}
                        {isPending && (
                           <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-900/50">
                               <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 animate-pulse w-full origin-left"></div>
                           </div>
                        )}

                        {/* Content */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-2">
                             
                             {/* Status Indicators */}
                             <div className="mb-1 h-6 flex items-center justify-center">
                                 {isPending ? (
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-indigo-500/30 blur-lg rounded-full animate-pulse"></div>
                                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin drop-shadow-md relative z-10" />
                                    </div>
                                 ) : isReady ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-400 drop-shadow-md" />
                                 ) : (
                                    <cat.icon className="w-5 h-5 text-slate-300 group-hover:text-white drop-shadow-md transition-colors" />
                                 )}
                             </div>
                             
                             <span className="text-sm font-bold text-slate-100 drop-shadow-md tracking-wide group-hover:text-white transition-colors">{cat.label}</span>
                             
                             {isPending && (
                                 <span className="text-[10px] text-indigo-200 font-medium tracking-wider mt-1 animate-pulse">PREPARING</span>
                             )}
                        </div>
                    </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
                <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-400"/>
                    News Topics
                </h2>
                <button 
                  onClick={addArticle}
                  disabled={appState !== AppState.IDLE}
                  className="text-sm flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-3 py-1.5 rounded-full hover:bg-indigo-500/20 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> Add Topic
                </button>
            </div>

            <div className="grid gap-4">
              {articles.map((article, index) => (
                <div key={article.id} className="bg-slate-900 rounded-xl p-4 border border-slate-800 focus-within:border-indigo-500/50 transition-all shadow-sm hover:shadow-md hover:border-slate-700">
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                       Topic #{index + 1}
                    </div>
                    {articles.length > 1 && (
                      <button 
                        onClick={() => removeArticle(article.id)}
                        disabled={appState !== AppState.IDLE}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1"
                        title="Remove topic"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                      </div>
                      <input 
                        type="text"
                        disabled={appState !== AppState.IDLE}
                        className="w-full pl-10 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 placeholder-slate-600 disabled:opacity-50"
                        placeholder="Search Topic (e.g. 'SpaceX Starship launch details', 'Global Market trends')"
                        value={article.content}
                        onChange={(e) => updateArticle(article.id, { content: e.target.value })}
                      />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={appState !== AppState.IDLE}
                className="group relative inline-flex items-center justify-center px-8 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:-translate-y-0.5"
              >
                {appState === AppState.IDLE ? (
                    <>
                        <span>Generate Briefing</span>
                        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                ) : (
                    <>
                        <Loader2 className="mr-2 w-5 h-5 animate-spin" />
                        {appState === AppState.SUMMARIZING ? 'Gathering & Drafting...' : 'Recording Audio...'}
                    </>
                )}
              </button>
            </div>
          </div>
        )}

        {(appState === AppState.READY || appState === AppState.PLAYING) && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-fade-in-up">
                
                <div className="w-full h-48 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-center relative overflow-hidden shadow-2xl shadow-indigo-500/10 group">
                    
                    {imageUrl ? (
                        <img 
                            src={imageUrl} 
                            alt="Generated News Illustration" 
                            className="w-full h-full object-cover opacity-80 animate-fade-in"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-slate-600 relative">
                             {/* Loading Indicator specific for Image */}
                             <div className="absolute inset-0 flex items-center justify-center">
                                <div className="p-4 rounded-full bg-slate-900/80 backdrop-blur-sm border border-slate-800 shadow-lg flex flex-col items-center gap-2">
                                  <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                                  <span className="text-[10px] text-indigo-300 font-medium tracking-widest uppercase">Loading Visuals</span>
                                </div>
                             </div>
                             <Newspaper className="w-12 h-12 mb-2 opacity-10" />
                        </div>
                    )}
                    
                    {/* Overlay Badges */}
                    <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-950/50 backdrop-blur-sm text-indigo-300 border border-indigo-500/20">
                           {selectedLanguage}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border backdrop-blur-sm ${appState === AppState.PLAYING ? 'bg-red-950/50 text-red-400 border-red-500/20 animate-pulse' : 'bg-green-950/50 text-green-400 border-green-500/20'}`}>
                           {appState === AppState.PLAYING ? '● On Air' : 'Ready'}
                        </span>
                    </div>
                </div>

                <div className="w-full max-w-xs flex items-center gap-4 bg-slate-900/50 rounded-full px-4 py-2 border border-slate-800">
                    <Gauge className="w-4 h-4 text-slate-400" />
                    <div className="flex-1 flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-500 w-8">0.5x</span>
                        <input 
                            type="range" 
                            min="0.5" 
                            max="2.0" 
                            step="0.1"
                            value={playbackRate}
                            onChange={handleRateChange}
                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <span className="text-xs font-medium text-slate-500 w-8">2.0x</span>
                    </div>
                    <span className="text-xs font-bold text-indigo-400 min-w-[3rem] text-right">{playbackRate.toFixed(1)}x</span>
                </div>

                <div className="flex items-center gap-10">
                     <button 
                        onClick={reset}
                        className="text-slate-400 hover:text-white transition-colors flex flex-col items-center gap-2 text-xs font-medium group"
                     >
                        <div className="p-4 rounded-full bg-slate-800 group-hover:bg-slate-700 transition-colors border border-slate-700">
                            <FileText className="w-5 h-5" />
                        </div>
                        Edit
                     </button>

                     <button
                        onClick={appState === AppState.PLAYING ? pauseAudio : playAudio}
                        className="group relative flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-full shadow-2xl shadow-indigo-600/40 hover:scale-105 transition-all hover:shadow-indigo-600/60"
                     >
                         {appState === AppState.PLAYING ? (
                             <Pause className="w-8 h-8 text-white fill-current" />
                         ) : (
                             <Play className="w-8 h-8 text-white fill-current ml-1" />
                         )}
                     </button>
                     
                     <button
                        onClick={handleDownload}
                        className="text-slate-400 hover:text-white transition-colors flex flex-col items-center gap-2 text-xs font-medium group"
                     >
                        <div className="p-4 rounded-full bg-slate-800 group-hover:bg-slate-700 transition-colors border border-slate-700">
                             <Download className="w-5 h-5" />
                        </div>
                        Download
                     </button>
                </div>

                {sources.length > 0 && (
                    <div className="w-full max-w-2xl mt-4">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Sources Verified</h3>
                        <div className="flex flex-wrap gap-2">
                            {sources.map((source, idx) => (
                                <a 
                                    key={idx}
                                    href={source.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-xs text-indigo-400 hover:text-indigo-300 hover:border-indigo-500/50 transition-all hover:shadow-lg hover:shadow-indigo-900/20"
                                >
                                    <span className="truncate max-w-[200px]">{source.title || source.uri}</span>
                                    <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                <div className="w-full max-w-2xl">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Briefing Script</h3>
                    <div className="p-6 bg-slate-900 rounded-xl border border-slate-800 text-slate-300 leading-relaxed text-lg font-light max-h-60 overflow-y-auto shadow-inner">
                        {summary}
                    </div>
                </div>

            </div>
        )}

      </main>
      
      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div 
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
                onClick={() => setShowHistory(false)}
            ></div>
            <div className="relative w-full max-w-sm h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col transform transition-transform animate-slide-in-right">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 backdrop-blur-md sticky top-0 z-10">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <History className="w-5 h-5 text-indigo-400" />
                        Briefing History
                    </h2>
                    <button 
                        onClick={() => setShowHistory(false)}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                            <Clock className="w-12 h-12 opacity-20" />
                            <p className="text-sm">No history yet. Generate something!</p>
                        </div>
                    ) : (
                        history.map(item => (
                            <div 
                                key={item.id} 
                                onClick={() => loadHistoryItem(item)}
                                className="group bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/50 rounded-xl p-3 cursor-pointer transition-all flex gap-3 hover:shadow-lg hover:shadow-indigo-500/10"
                            >
                                <div className="w-16 h-16 rounded-lg bg-slate-900 overflow-hidden flex-shrink-0 border border-slate-700 group-hover:border-indigo-500/30">
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Newspaper className="w-6 h-6 text-slate-600" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                    <div>
                                        <p className="text-xs text-indigo-400 font-medium mb-0.5">
                                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        <h3 className="text-sm text-slate-200 font-medium truncate leading-tight group-hover:text-white transition-colors">
                                            {item.topic}
                                        </h3>
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                                            {item.sources.length} Sources
                                        </span>
                                        <button 
                                            onClick={(e) => deleteHistoryItem(e, item.id)}
                                            className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      )}

      <footer className="mt-auto py-8 text-center text-slate-600 text-xs font-medium">
        <p>Powered by Gemini 2.5 Flash & TTS</p>
      </footer>

    </div>
  );
}