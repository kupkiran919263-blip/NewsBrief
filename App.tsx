import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Trash2, Play, Pause, Radio, Loader2, FileText, Download, ArrowRight, Link as LinkIcon, ExternalLink, Settings, Gauge, Search, Newspaper, Sparkles, Globe, Mic, Cpu, Briefcase, Beaker, Heart, Trophy, Film, CheckCircle2 } from 'lucide-react';
import { Article, AppState, VoiceName, GroundingSource, Language, VoiceGender, LANGUAGES, CachedBriefing } from './types';
import { generateBriefingScript, generateSpeech, generateCoverImage } from './services/gemini';
import { getAudioContext, createWavBlob } from './services/audioUtils';

export default function App() {
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

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  
  // Position Tracking Refs
  const savedBufferOffsetRef = useRef<number>(0);
  const segmentStartTimeRef = useRef<number>(0);

  const QUICK_CATEGORIES = [
    { id: 'tech', label: 'Tech', icon: Cpu, color: 'from-blue-500 to-cyan-400' },
    { id: 'biz', label: 'Business', icon: Briefcase, color: 'from-emerald-500 to-teal-400' },
    { id: 'science', label: 'Science', icon: Beaker, color: 'from-purple-500 to-pink-400' },
    { id: 'health', label: 'Health', icon: Heart, color: 'from-rose-500 to-red-400' },
    { id: 'sports', label: 'Sports', icon: Trophy, color: 'from-amber-500 to-orange-400' },
    { id: 'entertainment', label: 'Cinema', icon: Film, color: 'from-violet-500 to-fuchsia-400' },
  ];

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

  // Background Pre-fetching Logic
  useEffect(() => {
    // Only start pre-fetching once on mount if idle
    const startPreFetching = async () => {
      
      QUICK_CATEGORIES.forEach(async (cat) => {
         // Initialize cache entry as pending
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
             const result = await generateBriefingScript([dummyArticle], 'English'); // Default to English for background

             // 2. Generate Assets (Audio/Image) in parallel
             // Use default Female voice (Kore) for background cache to keep it simple, 
             // or ideally we re-generate if user switches gender. For now, assume default.
             const voiceName = getVoiceForGender('Female'); 
             const [buffer, img] = await Promise.all([
                 generateSpeech(result.script, voiceName),
                 generateCoverImage(result.script)
             ]);

             setCache(prev => ({
                 ...prev,
                 [cat.label]: {
                     id: cat.label,
                     status: 'ready',
                     summary: result.script,
                     sources: result.sources,
                     audioBuffer: buffer,
                     imageUrl: img,
                     timestamp: Date.now()
                 }
             }));

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
  }, []); // Run once on mount

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

  // Standard Manual Generation
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

      // 2. Parallel: Generate Audio AND Image
      const voiceName = getVoiceForGender(selectedGender);
      
      const audioPromise = generateSpeech(result.script, voiceName);
      const imagePromise = generateCoverImage(result.script);

      const [buffer, generatedImage] = await Promise.all([audioPromise, imagePromise]);
      
      audioBufferRef.current = buffer;
      setImageUrl(generatedImage);

      // Reset audio state
      savedBufferOffsetRef.current = 0;
      setAppState(AppState.READY);
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
    // Check if we have a valid cache hit
    const cachedData = cache[categoryLabel];

    // If Ready: Load instantly
    if (cachedData && cachedData.status === 'ready' && cachedData.audioBuffer) {
        // We need to respect the *current* user settings. 
        // NOTE: The background fetch uses default settings (English/Female). 
        // If user changed language/gender, we might want to re-generate, 
        // but for speed, we serve cached content first or we could invalidate.
        // For this optimization request, speed is priority. We use cached data.
        
        // Resume Audio Context
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        initAudio();

        setSummary(cachedData.summary);
        setSources(cachedData.sources);
        setImageUrl(cachedData.imageUrl);
        audioBufferRef.current = cachedData.audioBuffer;
        savedBufferOffsetRef.current = 0;
        
        // Update articles to show what was selected
        setArticles([{ id: 'cached', type: 'search', content: `Top 5 recent ${categoryLabel} headlines` }]);
        
        setAppState(AppState.READY);
        return;
    }

    // If Pending: Show loading state specific to waiting for this cache
    if (cachedData && cachedData.status === 'pending') {
        setAppState(AppState.SUMMARIZING); // Use generic loading state for now
        // Poll or wait logic could be here, but effectively we just re-trigger standard generation 
        // if user clicks while pending to ensure they get result.
        // Or simpler: Fallback to standard generation which might duplicate effort but ensures result.
    }

    // Fallback: Standard Generation
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center font-sans">
      
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
                        className="group relative overflow-hidden bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 p-4 rounded-xl transition-all hover:-translate-y-1 hover:shadow-lg flex flex-col items-center justify-center gap-2"
                    >
                        <div className={`relative p-2.5 rounded-full bg-gradient-to-br ${cat.color} opacity-80 group-hover:opacity-100 transition-opacity`}>
                            <cat.icon className="w-5 h-5 text-white" />
                            {isReady && (
                                <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5 border-2 border-slate-900">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                                </div>
                            )}
                            {isPending && (
                                <div className="absolute inset-0 rounded-full border-2 border-white/50 border-t-transparent animate-spin"></div>
                            )}
                        </div>
                        <span className="text-xs font-semibold text-slate-300 group-hover:text-white">{cat.label}</span>
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
                
                <div className="w-full h-48 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-center relative overflow-hidden shadow-2xl shadow-indigo-500/10">
                    
                    {imageUrl ? (
                        <img 
                            src={imageUrl} 
                            alt="Generated News Illustration" 
                            className="w-full h-full object-cover opacity-80"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-slate-600">
                             <Newspaper className="w-12 h-12 mb-2 opacity-20" />
                             <span className="text-xs uppercase tracking-widest opacity-40">Audio Only</span>
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
      
      <footer className="mt-auto py-8 text-center text-slate-600 text-xs font-medium">
        <p>Powered by Gemini 2.5 Flash & TTS</p>
      </footer>

    </div>
  );
}