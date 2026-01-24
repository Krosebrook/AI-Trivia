
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GeminiService } from './services/geminiService';
import { PCM_WORKLET_CODE, SFXService } from './services/audioUtils';
import { GameStatus, HostPersonality, TriviaQuestion, TranscriptionItem, Difficulty, QuestionResult, LeaderboardEntry, AppSettings, GameHistoryEntry, LiveStats } from './types';
import { HOST_PERSONALITIES, TOPICS } from './constants';
import AudioVisualizer from './components/AudioVisualizer';
import TriviaCard from './components/TriviaCard';
import Leaderboard from './components/Leaderboard';
import SettingsModal from './components/SettingsModal';
import HistoryModal from './components/HistoryModal';
import TutorialOverlay from './components/TutorialOverlay';
import CreateHostModal from './components/CreateHostModal';
import InGameStats from './components/InGameStats';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration } from '@google/genai';

const DEFAULT_SETTINGS: AppSettings = {
  hostVolume: 1.0,
  sfxVolume: 0.5,
  defaultHostId: HOST_PERSONALITIES[0].id,
  hasSeenTutorial: false,
  showInGameStats: true
};

const App: React.FC = () => {
  // --- Persistent State Initialization ---
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('trivia_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [gameHistoryState, setGameHistoryState] = useState<GameHistoryEntry[]>(() => {
    const saved = localStorage.getItem('trivia_game_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [customHosts, setCustomHosts] = useState<HostPersonality[]>(() => {
    const saved = localStorage.getItem('trivia_custom_hosts');
    return saved ? JSON.parse(saved) : [];
  });

  // --- Game State ---
  const [status, setStatus] = useState<GameStatus>(GameStatus.SETUP);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  
  // Merge default hosts with custom hosts for selection
  const allHosts = [...HOST_PERSONALITIES, ...customHosts];
  
  const [selectedHost, setSelectedHost] = useState<HostPersonality>(() => {
    return allHosts.find(h => h.id === settings.defaultHostId) || allHosts[0];
  });
  
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [isHostSpeaking, setIsHostSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [hostReaction, setHostReaction] = useState<'neutral' | 'correct' | 'incorrect'>('neutral');
  const [gameResultHistory, setGameResultHistory] = useState<QuestionResult[]>([]);
  const [isProcessingAnswer, setIsProcessingAnswer] = useState(false);
  const [hasUsedHint, setHasUsedHint] = useState(false);
  
  // --- Live Stats State ---
  const [liveStats, setLiveStats] = useState<LiveStats>({
    currentStreak: 0,
    longestStreak: 0,
    avgResponseTime: 0,
    totalQuestionsAnswered: 0
  });
  
  // --- UI Toggles ---
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTutorial, setShowTutorial] = useState(!settings.hasSeenTutorial);
  const [showCreateHost, setShowCreateHost] = useState(false);
  
  // --- Leaderboard & Player ---
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [hasSavedScore, setHasSavedScore] = useState(false);

  // --- Refs ---
  const hasUsedHintRef = useRef(false);
  const currentQuestionIndexRef = useRef(0);
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const hostGainNodeRef = useRef<GainNode | null>(null);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isCleanDisconnectRef = useRef(false);
  
  // Stats refs
  const questionStartTimeRef = useRef<number>(0);
  const currentStreakRef = useRef(0);
  const totalResponseTimeRef = useRef(0);
  const totalAnsweredRef = useRef(0);
  const longestStreakRef = useRef(0);

  // --- Services ---
  const gemini = new GeminiService();
  const sfx = useRef(new SFXService());

  // --- Effects ---

  useEffect(() => {
    hasUsedHintRef.current = hasUsedHint;
  }, [hasUsedHint]);

  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  useEffect(() => {
    localStorage.setItem('trivia_settings', JSON.stringify(settings));
    sfx.current.setVolume(settings.sfxVolume);
    if (hostGainNodeRef.current) {
      hostGainNodeRef.current.gain.setValueAtTime(settings.hostVolume, 0);
    }
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('trivia_game_history', JSON.stringify(gameHistoryState));
  }, [gameHistoryState]);
  
  useEffect(() => {
    localStorage.setItem('trivia_custom_hosts', JSON.stringify(customHosts));
  }, [customHosts]);

  useEffect(() => {
    const savedBest = localStorage.getItem('trivia_best_score');
    if (savedBest) setBestScore(parseInt(savedBest, 10));

    const savedLeaderboard = localStorage.getItem('trivia_leaderboard');
    if (savedLeaderboard) {
      try {
        setLeaderboard(JSON.parse(savedLeaderboard));
      } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== GameStatus.PLAYING || isProcessingAnswer) return;
      const key = e.key.toLowerCase();
      const currentQ = questions[Math.min(displayQuestionIndex, questions.length - 1)];
      if (!currentQ) return;

      if (['1', '2', '3', '4'].includes(key)) {
        const index = parseInt(key) - 1;
        if (currentQ.options[index]) {
          sfx.current.playClick();
          handleOptionSelect(currentQ.options[index]);
        }
      } else if (key === 'h' && !hasUsedHintRef.current) {
        sfx.current.playPing();
        handleHintRequest();
      } else if (key === ' ' && isHostSpeaking) {
         e.preventDefault();
         stopAudioPlayback();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, isProcessingAnswer, questions, currentQuestionIndex, isHostSpeaking]);

  useEffect(() => {
    if (hostReaction !== 'neutral') {
      const timer = setTimeout(() => {
        setHostReaction('neutral');
        setIsProcessingAnswer(false); 
        setHasUsedHint(false); 
        // Reset timestamp for next question if applicable, though usually done in onOptionSelect logic or tool call
        questionStartTimeRef.current = Date.now();
      }, 5000); 
      return () => clearTimeout(timer);
    }
  }, [hostReaction]);

  // --- Logic ---
  
  const getVisualizerMode = (hostId: string): 'bars' | 'wave' | 'orb' => {
     if (hostId.startsWith('custom')) return 'orb';
     switch(hostId) {
        case 'professor':
        case 'detective':
           return 'bars';
        case 'enthusiast':
        case 'artist':
        case 'time-traveler':
           return 'orb';
        default:
           return 'wave';
     }
  };

  const initAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      const input = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const output = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const gain = output.createGain();
      gain.gain.value = settings.hostVolume;
      gain.connect(output.destination);
      hostGainNodeRef.current = gain;

      try {
        const blob = new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await input.audioWorklet.addModule(workletUrl);
      } catch (e) {
        console.error("Failed to load AudioWorklet", e);
      }

      audioContextRef.current = { input, output };
    }
    
    if (audioContextRef.current.input.state === 'suspended') await audioContextRef.current.input.resume();
    if (audioContextRef.current.output.state === 'suspended') await audioContextRef.current.output.resume();
    
    if (!micStreamRef.current) {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    
    return audioContextRef.current;
  }, [settings.hostVolume]);

  const stopAudioPlayback = useCallback(() => {
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setIsHostSpeaking(false);
    nextStartTimeRef.current = 0;
  }, []);

  const stopGame = useCallback(() => {
    isCleanDisconnectRef.current = true;
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    stopAudioPlayback();
    
    // Save to History
    if (status === GameStatus.PLAYING || status === GameStatus.FINISHED) {
      if (score > 0 || currentQuestionIndex > 0) {
        const entry: GameHistoryEntry = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          topic,
          difficulty,
          score,
          hostName: selectedHost.name
        };
        setGameHistoryState(prev => [...prev, entry]);
      }
    }

    setStatus(GameStatus.SETUP);
    setIsHostSpeaking(false);
    setHostReaction('neutral');
    setIsProcessingAnswer(false);
    setHasUsedHint(false);
    reconnectAttemptsRef.current = 0;
  }, [stopAudioPlayback, status, score, currentQuestionIndex, topic, difficulty, selectedHost]);

  // Update Score Tool
  const updateScoreTool: FunctionDeclaration = {
    name: 'updateScore',
    parameters: {
      type: Type.OBJECT,
      description: 'Call this function after every user answer.',
      properties: {
        isCorrect: { type: Type.BOOLEAN },
        currentScore: { type: Type.NUMBER }
      },
      required: ['isCorrect', 'currentScore'],
    },
  };

  const connectSession = async (ai: GoogleGenAI, inputCtx: AudioContext, systemInstruction: string, activeQuestions: TriviaQuestion[]) => {
    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          console.log('Live Session Connected');
          setError(null);
          reconnectAttemptsRef.current = 0;
          // Set initial start time for first question roughly now
          questionStartTimeRef.current = Date.now() + 5000; // Buffer for intro

          const source = inputCtx.createMediaStreamSource(micStreamRef.current!);
          const workletNode = new AudioWorkletNode(inputCtx, 'pcm-processor');
          workletNode.port.onmessage = (event) => {
            const inputData = event.data as Float32Array;
            const l = inputData.length;
            const int16 = new Int16Array(l);
            for (let i = 0; i < l; i++) {
              int16[i] = inputData[i] * 32768;
            }
            const pcmBlob = {
              data: GeminiService.encodeBase64(new Uint8Array(int16.buffer)),
              mimeType: 'audio/pcm;rate=16000',
            };
            sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
          };

          source.connect(workletNode);
          workletNode.connect(inputCtx.destination);
          audioWorkletNodeRef.current = workletNode;
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              if (fc.name === 'updateScore') {
                const { isCorrect, currentScore } = fc.args as { isCorrect: boolean, currentScore: number };
                
                // --- Update Stats ---
                const now = Date.now();
                const responseTime = Math.max(0, now - questionStartTimeRef.current);
                totalResponseTimeRef.current += responseTime;
                totalAnsweredRef.current += 1;
                
                if (isCorrect) {
                  currentStreakRef.current += 1;
                  longestStreakRef.current = Math.max(longestStreakRef.current, currentStreakRef.current);
                  sfx.current.playCorrect();
                } else {
                  currentStreakRef.current = 0;
                  sfx.current.playIncorrect();
                }

                setLiveStats({
                  currentStreak: currentStreakRef.current,
                  longestStreak: longestStreakRef.current,
                  avgResponseTime: totalResponseTimeRef.current / totalAnsweredRef.current,
                  totalQuestionsAnswered: totalAnsweredRef.current
                });
                // ---------------------

                setGameResultHistory(prev => {
                  const idx = prev.length;
                  const q = activeQuestions[idx];
                  if (q) {
                    return [...prev, {
                      question: q.question,
                      correctAnswer: q.answer,
                      userWasCorrect: isCorrect,
                      hintUsed: hasUsedHintRef.current,
                      responseTime
                    }];
                  }
                  return prev;
                });

                setScore(currentScore);
                setCurrentQuestionIndex(prev => prev + 1);
                setHostReaction(isCorrect ? 'correct' : 'incorrect');
                
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: [{
                    id: fc.id,
                    name: fc.name,
                    response: { result: "Score updated" }
                  }]
                }));
              }
            }
          }

          const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audioData) {
            setIsHostSpeaking(true);
            const { output: outputCtx } = audioContextRef.current!;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
            const buffer = await GeminiService.decodeAudioData(
              GeminiService.decodeBase64(audioData),
              outputCtx,
              24000,
              1
            );
            const sourceNode = outputCtx.createBufferSource();
            sourceNode.buffer = buffer;
            
            if (hostGainNodeRef.current) {
               sourceNode.connect(hostGainNodeRef.current);
            } else {
               sourceNode.connect(outputCtx.destination);
            }

            sourceNode.addEventListener('ended', () => {
              sourcesRef.current.delete(sourceNode);
              if (sourcesRef.current.size === 0) setIsHostSpeaking(false);
            });
            sourceNode.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(sourceNode);
          }

          if (message.serverContent?.interrupted) {
            stopAudioPlayback();
          }

          if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            setTranscriptions(prev => [...prev.slice(-10), { role: 'user', text }]);
          }
          if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            setTranscriptions(prev => [...prev.slice(-10), { role: 'model', text }]);
          }

          const lastText = message.serverContent?.outputTranscription?.text || "";
          if (lastText.toLowerCase().includes("goodbye") || lastText.toLowerCase().includes("show has ended")) {
             setTimeout(() => setStatus(GameStatus.FINISHED), 3000);
          }
        },
        onerror: (e) => {
          console.error('Session Error:', e);
          attemptReconnect(ai, inputCtx, systemInstruction, activeQuestions);
        },
        onclose: () => {
          if (!isCleanDisconnectRef.current) {
            attemptReconnect(ai, inputCtx, systemInstruction, activeQuestions);
          }
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction,
        tools: [{ functionDeclarations: [updateScoreTool] }],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedHost.voiceName } }
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      }
    });

    return sessionPromise;
  };

  const attemptReconnect = (ai: GoogleGenAI, inputCtx: AudioContext, systemInstruction: string, activeQuestions: TriviaQuestion[]) => {
    if (reconnectAttemptsRef.current < 3 && status === GameStatus.PLAYING) {
      reconnectAttemptsRef.current += 1;
      const delay = 1000 * reconnectAttemptsRef.current;
      setError(`Connection lost. Reconnecting (${reconnectAttemptsRef.current}/3)...`);
      
      setTimeout(async () => {
        try {
          const newSession = await connectSession(ai, inputCtx, systemInstruction, activeQuestions);
          sessionRef.current = newSession;
        } catch (e) {
          attemptReconnect(ai, inputCtx, systemInstruction, activeQuestions);
        }
      }, delay);
    } else if (reconnectAttemptsRef.current >= 3) {
      setError("Connection lost. Unable to reconnect.");
      stopGame();
    }
  };

  const handleHintRequest = async () => {
    if (isProcessingAnswer || hasUsedHint || !sessionRef.current) return;
    setHasUsedHint(true);
    sfx.current.playPing();
    stopAudioPlayback();
    try {
      await sessionRef.current.send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: `I need a hint, ${selectedHost.name}.` }] }],
          turnComplete: true
        }
      });
      setTranscriptions(prev => [...prev.slice(-10), { role: 'user', text: "(Requested a Hint)" }]);
    } catch (e) { console.error(e); }
  };

  const handleOptionSelect = async (option: string) => {
    if (isProcessingAnswer || !sessionRef.current) return;
    setIsProcessingAnswer(true);
    stopAudioPlayback(); 
    try {
      await sessionRef.current.send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: `My answer is ${option}` }] }],
          turnComplete: true
        }
      });
      setTranscriptions(prev => [...prev.slice(-10), { role: 'user', text: `(Selected): ${option}` }]);
    } catch (e) { setIsProcessingAnswer(false); }
  };

  const startGame = async () => {
    try {
      sfx.current.playClick();
      setStatus(GameStatus.LOADING_QUESTIONS);
      setError(null);
      setScore(0);
      setCurrentQuestionIndex(0);
      setTranscriptions([]);
      setHostReaction('neutral');
      setGameResultHistory([]);
      setIsProcessingAnswer(false);
      setHasUsedHint(false);
      setPlayerName(''); 
      isCleanDisconnectRef.current = false;
      
      // Reset Stats
      currentStreakRef.current = 0;
      longestStreakRef.current = 0;
      totalResponseTimeRef.current = 0;
      totalAnsweredRef.current = 0;
      setLiveStats({ currentStreak: 0, longestStreak: 0, avgResponseTime: 0, totalQuestionsAnswered: 0 });

      const newQuestions = await gemini.generateTriviaQuestions(topic, difficulty);
      if (newQuestions.length === 0) throw new Error("Could not load questions.");
      setQuestions(newQuestions);

      const { input: inputCtx } = await initAudio();
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

      const systemInstruction = `
        IDENTITY:
        ${selectedHost.prompt}

        GAME SETTINGS:
        Current Topic: "${topic}"
        Difficulty Level: "${difficulty}"
        Question Count: 5

        DYNAMIC ADAPTATION PROTOCOLS:
        1. **Topic Resonance**: You MUST weave vocabulary, metaphors, and idioms related to "${topic}" into your dialogue.
        2. **Performance Tracking**:
           - **Winning Streak**: If the user answers correctly multiple times, ramp up your intensity/enthusiasm/sarcasm.
           - **Struggling**: If the user misses answers, switch to a supportive or gently guiding tone.
        3. **Pacing**: Keep the energy moving. Be concise but full of character.

        THE QUIZ CONTENT:
        ${newQuestions.map((q, i) => `
        [QUESTION ${i + 1}]
        Q: "${q.question}"
        Options: [${q.options.join(', ')}]
        Correct Answer: "${q.answer}"
        Explanation: "${q.explanation}"
        `).join('\n')}

        RUN OF SHOW:
        1. **Intro**: Welcome the player. Announce the topic and difficulty.
        2. **The Loop**:
           - Read the Question and Options clearly.
           - Wait for user input.
           - **ACTION**: Call 'updateScore({ isCorrect, currentScore })' immediately upon hearing an answer.
           - **Feedback**: Give the result (Correct/Incorrect) and the Explanation.
           - Transition to the next question.
        3. **Hints**: If requested, give a subtle clue.
        4. **Outro**: After Question 5, summarize the performance and say "The show has ended. Goodbye!".
      `;

      sessionRef.current = await connectSession(ai, inputCtx, systemInstruction, newQuestions);
      setStatus(GameStatus.PLAYING);
      
      // We assume the host speaks intro for ~5 seconds
      questionStartTimeRef.current = Date.now() + 5000;
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start game.");
      setStatus(GameStatus.SETUP);
    }
  };

  const handleSaveScore = () => {
    if (!playerName.trim()) return;
    sfx.current.playCorrect();
    const newEntry: LeaderboardEntry = {
      name: playerName.trim(),
      score: score,
      topic: topic,
      date: new Date().toISOString()
    };
    const updated = [...leaderboard, newEntry].sort((a, b) => b.score - a.score).slice(0, 5);
    setLeaderboard(updated);
    localStorage.setItem('trivia_leaderboard', JSON.stringify(updated));
    setHasSavedScore(true);
    setShowLeaderboard(true); 
  };

  const handleSaveCustomHost = (host: HostPersonality) => {
    setCustomHosts(prev => [...prev, host]);
  };

  const displayQuestionIndex = (hostReaction !== 'neutral' && currentQuestionIndex > 0) ? currentQuestionIndex - 1 : currentQuestionIndex;
  const currentQuestion = questions[Math.min(displayQuestionIndex, questions.length - 1)];
  const qualifiesForLeaderboard = score > 0 && (leaderboard.length < 5 || score > leaderboard[leaderboard.length - 1].score);

  // Animation Class Lookup
  const getHostAnimation = (id: string) => {
    if (status !== GameStatus.PLAYING) return '';
    if (hostReaction !== 'neutral') return 'scale-105';
    if (!isHostSpeaking) return '';
    
    switch(id) {
      case 'professor': return 'animate-personality-nod';
      case 'comedian': return 'animate-personality-bounce';
      case 'enthusiast': return 'animate-personality-shake';
      case 'detective': return 'animate-personality-sway';
      case 'artist': return 'animate-personality-float';
      default: return 'animate-pulse';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      {/* Modals */}
      {showLeaderboard && <Leaderboard entries={leaderboard} onClose={() => setShowLeaderboard(false)} />}
      {showSettings && <SettingsModal settings={settings} onUpdate={setSettings} onClose={() => setShowSettings(false)} />}
      {showHistory && <HistoryModal history={gameHistoryState} onClose={() => setShowHistory(false)} onClear={() => setGameHistoryState([])} />}
      {showTutorial && <TutorialOverlay onComplete={() => {
        setSettings(s => ({ ...s, hasSeenTutorial: true }));
        setShowTutorial(false);
      }} />}
      {showCreateHost && <CreateHostModal onSave={handleSaveCustomHost} onClose={() => setShowCreateHost(false)} />}

      <header className="text-center mb-8 relative">
        <h1 className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-600 mb-2 italic drop-shadow-sm">
          AI TRIVIA NIGHT
        </h1>
        <p className="text-gray-400 uppercase tracking-widest text-sm font-semibold">Real-Time Host Personalities</p>
      </header>

      {status === GameStatus.SETUP && (
        <div className="space-y-8 animate-fadeIn relative">
          
          <div className="absolute top-0 right-0 z-10 flex gap-2">
            <button onClick={() => { sfx.current.playClick(); setShowHistory(true); }} className="bg-gray-800 text-blue-400 p-2 rounded-full border border-gray-700 hover:bg-gray-700 relative group">
                <i className="fas fa-clock-rotate-left"></i>
                <div className="absolute top-full right-0 mt-2 w-32 bg-black text-xs p-2 rounded hidden group-hover:block z-50">History</div>
            </button>
            <button onClick={() => { sfx.current.playClick(); setShowSettings(true); }} className="bg-gray-800 text-gray-300 p-2 rounded-full border border-gray-700 hover:bg-gray-700 relative group">
                <i className="fas fa-gear"></i>
                <div className="absolute top-full right-0 mt-2 w-32 bg-black text-xs p-2 rounded hidden group-hover:block z-50">Settings</div>
            </button>
            <button onClick={() => { sfx.current.playClick(); setShowLeaderboard(true); }} className="bg-gray-800 text-yellow-500 px-4 py-2 rounded-full font-bold text-xs uppercase border border-gray-700 flex items-center gap-2 relative group">
                <i className="fas fa-trophy"></i> Fame
                <div className="absolute top-full right-0 mt-2 w-32 bg-black text-xs p-2 rounded hidden group-hover:block z-50 text-white font-normal text-center">View Leaderboard</div>
            </button>
          </div>

          <section className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl mt-12 md:mt-0">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><i className="fas fa-gauge-high text-red-500"></i> Set Difficulty</h2>
            <div className="flex gap-4">
              {Object.values(Difficulty).map((d) => (
                <button key={d} onClick={() => { sfx.current.playClick(); setDifficulty(d); }} className={`flex-1 py-3 rounded-xl font-bold uppercase border-2 ${difficulty === d ? 'bg-red-500/20 border-red-500 text-red-100' : 'bg-gray-700 border-transparent text-gray-400'}`}>{d}</button>
              ))}
            </div>
          </section>

          <section className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl">
             <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><i className="fas fa-list text-yellow-500"></i> Themed Category</h2>
              <button onClick={() => { sfx.current.playClick(); setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]); }} className="text-xs bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full uppercase font-bold"><i className="fas fa-random mr-1"></i> Surprise Me</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TOPICS.map((t) => (
                <button key={t} onClick={() => { sfx.current.playClick(); setTopic(t); }} className={`px-4 py-3 rounded-xl font-medium text-xs md:text-sm ${topic === t ? 'bg-yellow-500 text-black scale-105' : 'bg-gray-700 text-gray-300'}`}>{t}</button>
              ))}
            </div>
          </section>

          <section className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl">
            <div className="flex justify-between items-center mb-4">
               <h2 className="text-xl font-bold flex items-center gap-2"><i className="fas fa-user-ninja text-orange-500"></i> Personality</h2>
               <button onClick={() => { sfx.current.playClick(); setShowCreateHost(true); }} className="text-xs bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full uppercase font-bold border border-purple-500/50 hover:bg-purple-500/40"><i className="fas fa-plus mr-1"></i> Create Custom</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allHosts.map((h) => (
                <div key={h.id} onClick={() => { sfx.current.playClick(); setSelectedHost(h); }} className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedHost.id === h.id ? 'border-orange-500 bg-orange-500/5' : 'border-transparent bg-gray-700'}`}>
                  <div className="relative">
                     <img src={h.avatar} alt={h.name} className="w-16 h-16 rounded-full border-2 border-gray-600" />
                     {h.isCustom && <div className="absolute -top-1 -right-1 bg-purple-500 text-white text-[8px] px-1 rounded-sm uppercase font-bold">Custom</div>}
                  </div>
                  <div><h3 className={`font-bold text-lg ${selectedHost.id === h.id ? 'text-orange-400' : ''}`}>{h.name}</h3><p className="text-xs text-gray-400 mt-1 line-clamp-2">{h.description}</p></div>
                </div>
              ))}
            </div>
          </section>

          <button onClick={startGame} className="w-full bg-gradient-to-r from-orange-500 to-red-600 py-6 rounded-2xl text-2xl font-black uppercase tracking-tighter hover:from-orange-400 hover:to-red-500 transition-all shadow-2xl">Enter the Studio</button>
        </div>
      )}

      {status === GameStatus.LOADING_QUESTIONS && (
        <div className="text-center py-20 flex flex-col items-center animate-pulse">
          <div className="w-20 h-20 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-2xl font-bold">Summoning {selectedHost.name}...</h2>
        </div>
      )}

      {status === GameStatus.PLAYING && (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Bar */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 flex justify-between items-center bg-gray-800 p-4 rounded-2xl border border-gray-700 shadow-lg">
               <div className="flex items-center gap-4">
                  <div className="text-center"><p className="text-[10px] uppercase font-bold text-gray-500">Score</p><p className="text-2xl font-black text-yellow-500">{score}</p></div>
                  <div className="h-10 w-[1px] bg-gray-700"></div>
                  <div className="text-center"><p className="text-[10px] uppercase font-bold text-gray-500">Progress</p><p className="text-xl font-bold text-gray-300">{Math.min(displayQuestionIndex + 1, 5)} / 5</p></div>
               </div>
               <div className="flex items-center gap-2 bg-black/30 px-4 py-2 rounded-xl"><i className="fas fa-brain text-orange-400"></i><span className="text-xs font-bold uppercase">{topic}</span></div>
            </div>
            
            {/* Live Stats */}
            {settings.showInGameStats && <InGameStats stats={liveStats} />}
          </div>

          <div className="bg-gray-800 rounded-3xl p-6 md:p-8 border border-gray-700 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-yellow-500 to-orange-500 animate-shimmer"></div>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="relative group">
                <img src={selectedHost.avatar} alt={selectedHost.name} 
                  className={`w-32 h-32 md:w-40 md:h-40 rounded-full border-4 shadow-2xl transition-all duration-500 relative z-10 
                  ${hostReaction === 'correct' ? 'border-green-400' : hostReaction === 'incorrect' ? 'border-indigo-400 grayscale-[40%]' : 'border-gray-600'}
                  ${getHostAnimation(selectedHost.id)}
                  `} 
                />
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 px-4 py-2 rounded-full border border-gray-700 shadow-lg z-20">
                  <AudioVisualizer 
                    isSpeaking={isHostSpeaking} 
                    color={hostReaction === 'correct' ? '#4ade80' : hostReaction === 'incorrect' ? '#818cf8' : '#eab308'} 
                    mode={getVisualizerMode(selectedHost.id)}
                  />
                </div>
              </div>

              <div className="flex-1 w-full text-center md:text-left">
                 <h2 className="text-2xl font-black mb-1">{selectedHost.name}</h2>
                 <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${hostReaction === 'correct' ? 'bg-green-500/20 text-green-400' : hostReaction === 'incorrect' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-orange-500/20 text-orange-400'}`}>{hostReaction === 'neutral' ? 'LIVE' : hostReaction.toUpperCase()}</span>
                 
                 {/* Tooltip for Voice Input (Interactive Tutorial) */}
                 {currentQuestionIndex === 0 && !isHostSpeaking && !isProcessingAnswer && (
                    <div className="mt-2 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/50 p-2 rounded-lg inline-block animate-pulse">
                       <i className="fas fa-arrow-up mr-2"></i> Hint: Speak your answer clearly now!
                    </div>
                 )}
              </div>
            </div>
            
            {currentQuestion && (
              <TriviaCard 
                question={currentQuestion}
                questionNumber={Math.min(displayQuestionIndex + 1, 5)}
                totalQuestions={5}
                reaction={hostReaction}
                revealAnswer={hostReaction !== 'neutral'}
                onOptionSelect={(opt) => { sfx.current.playClick(); handleOptionSelect(opt); }}
                onHintRequest={handleHintRequest}
                isInteractionDisabled={isProcessingAnswer}
                hasUsedHint={hasUsedHint}
              />
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-center bg-black/40 p-5 rounded-2xl border border-white/5 gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isHostSpeaking ? 'bg-gray-600' : 'bg-green-500 animate-pulse ring-4 ring-green-500/20'}`}></div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{isHostSpeaking ? `${selectedHost.name} is speaking...` : 'Mic Open - Say answer or tap 1-4'}</span>
                {isHostSpeaking && <span className="text-[10px] text-gray-600 mt-1">Press SPACE to skip</span>}
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {isHostSpeaking && <button onClick={stopAudioPlayback} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold text-xs uppercase transition-all"><i className="fas fa-forward mr-2"></i>Skip</button>}
              <button onClick={stopGame} className="flex-1 sm:flex-none px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg">Quit</button>
            </div>
          </div>
        </div>
      )}

      {status === GameStatus.FINISHED && (
        <div className="space-y-6 animate-fadeIn">
          <div className="text-center bg-gray-800 rounded-3xl p-12 border border-gray-700 shadow-2xl">
            <h2 className="text-4xl font-black mb-2 uppercase italic">Final Score</h2>
            <div className="text-7xl font-black text-yellow-500 mb-6 drop-shadow-lg">{score} <span className="text-2xl text-gray-500">/ 5</span></div>
            
            {score >= bestScore && score > 0 && <div className="inline-block bg-yellow-500/20 text-yellow-500 px-4 py-1 rounded-full text-xs font-bold uppercase mb-6 animate-bounce">New Personal Best!</div>}
            
            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto mb-8 bg-gray-900/50 p-4 rounded-xl border border-gray-700">
               <div className="text-center">
                  <p className="text-[10px] uppercase text-gray-500">Avg Time</p>
                  <p className="font-bold">{(liveStats.avgResponseTime / 1000).toFixed(1)}s</p>
               </div>
               <div className="text-center">
                  <p className="text-[10px] uppercase text-gray-500">Best Streak</p>
                  <p className="font-bold text-orange-400">{liveStats.longestStreak}</p>
               </div>
            </div>

            {qualifiesForLeaderboard && !hasSavedScore ? (
              <div className="mt-6 mb-8 bg-black/30 p-6 rounded-2xl border border-yellow-500/30 animate-pulse-subtle">
                <h3 className="text-xl font-bold text-yellow-400 mb-2 uppercase">You made the Leaderboard!</h3>
                <div className="flex flex-col md:flex-row gap-3 justify-center items-center">
                   <input type="text" maxLength={12} placeholder="Enter your name..." value={playerName} onChange={(e) => setPlayerName(e.target.value)} className="bg-gray-900 border border-gray-600 rounded-xl px-4 py-2 text-center text-white focus:border-yellow-500 outline-none w-full md:w-auto" />
                   <button onClick={handleSaveScore} disabled={!playerName.trim()} className="bg-yellow-500 text-black px-6 py-2 rounded-xl font-bold uppercase hover:bg-yellow-400 disabled:opacity-50 transition-colors w-full md:w-auto">Claim Spot</button>
                </div>
              </div>
            ) : hasSavedScore && (
               <div className="mt-6 mb-8"><span className="bg-green-500/20 text-green-400 px-6 py-2 rounded-full font-bold uppercase border border-green-500/30"><i className="fas fa-check-circle"></i> Score Saved</span></div>
            )}
            <p className="text-gray-400 text-xl max-w-md mx-auto mb-8">{selectedHost.name} just finished your {difficulty} {topic} challenge.</p>
          </div>

          <div className="bg-gray-800 rounded-3xl p-8 border border-gray-700 shadow-xl">
             <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><i className="fas fa-history text-orange-500"></i> Question Summary</h3>
             <div className="space-y-4">
                {gameResultHistory.map((res, i) => (
                   <div key={i} className={`p-4 rounded-2xl border ${res.userWasCorrect ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                      <div className="flex items-start gap-3">
                         <div className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${res.userWasCorrect ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}`}>{res.userWasCorrect ? <i className="fas fa-check"></i> : <i className="fas fa-times"></i>}</div>
                         <div className="flex-1">
                            <p className="font-bold text-gray-200">{res.question}</p>
                            <p className="text-sm text-gray-400 mt-2"><span className="text-xs uppercase font-bold tracking-widest text-gray-500 mr-2">Answer:</span> {res.correctAnswer}</p>
                            <p className="text-[10px] text-gray-500 mt-2 flex gap-4">
                               <span><i className="fas fa-stopwatch mr-1"></i> {(res.responseTime / 1000).toFixed(1)}s</span>
                               {res.hintUsed && <span className="text-indigo-400"><i className="fas fa-magic mr-1"></i> Hint Used</span>}
                            </p>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4">
            <button onClick={() => { sfx.current.playClick(); setShowLeaderboard(true); }} className="flex-1 bg-gray-700 text-gray-300 py-6 rounded-2xl font-black uppercase text-xl hover:bg-gray-600 transition-all shadow-lg flex items-center justify-center gap-4"><i className="fas fa-list-ol"></i> Leaderboard</button>
            <button onClick={() => { sfx.current.playClick(); stopGame(); }} className="flex-[2] bg-yellow-500 text-black py-6 rounded-2xl font-black uppercase text-2xl hover:scale-[1.01] transition-all shadow-xl shadow-yellow-500/20 flex items-center justify-center gap-4"><i className="fas fa-redo"></i> Play Another Show</button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-8 bg-red-500/20 border border-red-500 text-red-200 p-6 rounded-2xl text-center font-bold shadow-xl animate-shake">
          <div className="text-3xl mb-2">Oops!</div>
          <p className="text-sm opacity-90">{error}</p>
          <button onClick={() => setStatus(GameStatus.SETUP)} className="mt-4 px-4 py-1 bg-red-500/40 rounded-lg text-xs hover:bg-red-500/60 transition-all">Reset Studio</button>
        </div>
      )}

      <footer className="mt-12 py-8 text-center text-gray-600 text-[10px] md:text-xs border-t border-gray-800/50">
        <p>© 2025 AI TRIVIA NIGHT • DYNAMIC HOST ARCHETYPES • MULTI-LEVEL CHALLENGES</p>
      </footer>
    </div>
  );
};

export default App;
