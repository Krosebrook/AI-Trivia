
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GeminiService } from './services/geminiService';
import { GameStatus, HostPersonality, TriviaQuestion, TranscriptionItem, Difficulty, QuestionResult, LeaderboardEntry } from './types';
import { HOST_PERSONALITIES, TOPICS } from './constants';
import AudioVisualizer from './components/AudioVisualizer';
import TriviaCard from './components/TriviaCard';
import Leaderboard from './components/Leaderboard';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration } from '@google/genai';

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>(GameStatus.SETUP);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [selectedHost, setSelectedHost] = useState<HostPersonality>(HOST_PERSONALITIES[0]);
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [isHostSpeaking, setIsHostSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [hostReaction, setHostReaction] = useState<'neutral' | 'correct' | 'incorrect'>('neutral');
  const [gameHistory, setGameHistory] = useState<QuestionResult[]>([]);
  const [isProcessingAnswer, setIsProcessingAnswer] = useState(false);
  const [hasUsedHint, setHasUsedHint] = useState(false);
  
  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [hasSavedScore, setHasSavedScore] = useState(false);

  // Live API Refs
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);

  const gemini = new GeminiService();

  // Load leaderboard and best score on mount
  useEffect(() => {
    const savedBest = localStorage.getItem('trivia_best_score');
    if (savedBest) setBestScore(parseInt(savedBest, 10));

    const savedLeaderboard = localStorage.getItem('trivia_leaderboard');
    if (savedLeaderboard) {
      try {
        setLeaderboard(JSON.parse(savedLeaderboard));
      } catch (e) {
        console.error("Failed to parse leaderboard", e);
      }
    }
  }, []);

  // Reset host reaction after a delay
  useEffect(() => {
    if (hostReaction !== 'neutral') {
      const timer = setTimeout(() => {
        setHostReaction('neutral');
        setIsProcessingAnswer(false); // Re-enable interaction for next question
        setHasUsedHint(false); // Reset hint state for next question
      }, 5000); // 5 seconds to read explanation
      return () => clearTimeout(timer);
    }
  }, [hostReaction]);

  // Update best score when game ends
  useEffect(() => {
    if (status === GameStatus.FINISHED) {
      setHasSavedScore(false);
      if (score > bestScore) {
        setBestScore(score);
        localStorage.setItem('trivia_best_score', score.toString());
      }
    }
  }, [status, score, bestScore]);

  // Initialize Audio Contexts
  const initAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      const input = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const output = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = { input, output };
    }
    
    if (!micStreamRef.current) {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    
    return audioContextRef.current;
  }, []);

  const stopAudioPlayback = useCallback(() => {
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setIsHostSpeaking(false);
    nextStartTimeRef.current = 0;
  }, []);

  const stopGame = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    stopAudioPlayback();
    setStatus(GameStatus.SETUP);
    setIsHostSpeaking(false);
    setHostReaction('neutral');
    setIsProcessingAnswer(false);
    setHasUsedHint(false);
  }, [stopAudioPlayback]);

  // Save Score to Leaderboard
  const handleSaveScore = () => {
    if (!playerName.trim()) return;
    
    const newEntry: LeaderboardEntry = {
      name: playerName.trim(),
      score: score,
      topic: topic,
      date: new Date().toISOString()
    };
    
    const updatedLeaderboard = [...leaderboard, newEntry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Keep only top 5
      
    setLeaderboard(updatedLeaderboard);
    localStorage.setItem('trivia_leaderboard', JSON.stringify(updatedLeaderboard));
    setHasSavedScore(true);
    setShowLeaderboard(true); // Auto show leaderboard after saving
  };

  // Function to be called by the AI to sync score
  const updateScoreTool: FunctionDeclaration = {
    name: 'updateScore',
    parameters: {
      type: Type.OBJECT,
      description: 'Call this function after every user answer to update the game score and trigger visual feedback.',
      properties: {
        isCorrect: {
          type: Type.BOOLEAN,
          description: 'True if the user got the answer correct, false otherwise.',
        },
        currentScore: {
          type: Type.NUMBER,
          description: 'The updated total correct answers count.',
        }
      },
      required: ['isCorrect', 'currentScore'],
    },
  };

  // Handle Hint Request
  const handleHintRequest = async () => {
    if (isProcessingAnswer || hasUsedHint || !sessionRef.current) return;
    
    setHasUsedHint(true);
    stopAudioPlayback(); // Stop any current speech

    try {
      await sessionRef.current.send({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ 
              text: `I need a hint, ${selectedHost.name}. Please give me a subtle clue in your unique voice and style, but don't give away the answer!` 
            }]
          }],
          turnComplete: true
        }
      });
      setTranscriptions(prev => [...prev.slice(-10), { role: 'user', text: "(Requested a Hint)" }]);
    } catch (e) {
      console.error("Failed to request hint:", e);
      setHasUsedHint(false);
    }
  };

  // Handle manual option selection
  const handleOptionSelect = async (option: string) => {
    if (isProcessingAnswer || !sessionRef.current) return;
    
    setIsProcessingAnswer(true);
    stopAudioPlayback(); 

    try {
      await sessionRef.current.send({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text: `My answer is ${option}` }]
          }],
          turnComplete: true
        }
      });
      setTranscriptions(prev => [...prev.slice(-10), { role: 'user', text: `(Selected): ${option}` }]);
    } catch (e) {
      console.error("Failed to send text answer:", e);
      setIsProcessingAnswer(false);
    }
  };

  const startGame = async () => {
    try {
      setStatus(GameStatus.LOADING_QUESTIONS);
      setError(null);
      setScore(0);
      setCurrentQuestionIndex(0);
      setTranscriptions([]);
      setHostReaction('neutral');
      setGameHistory([]);
      setIsProcessingAnswer(false);
      setHasUsedHint(false);
      setPlayerName(''); // Reset player name for new game
      
      const newQuestions = await gemini.generateTriviaQuestions(topic, difficulty);
      if (newQuestions.length === 0) {
        throw new Error("Could not load questions. Check your API key or topic.");
      }
      setQuestions(newQuestions);

      const { input: inputCtx, output: outputCtx } = await initAudio();
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

      const systemInstruction = `
        ${selectedHost.prompt}
        GAME CONTEXT:
        Topic: "${topic}"
        Difficulty: "${difficulty}"
        Total Questions: 5
        You are hosting a 5-question trivia challenge. 
        Acknowledge the chosen difficulty level (${difficulty}) in your introduction.
        
        QUESTIONS TO ASK:
        ${newQuestions.map((q, i) => `${i + 1}. Q: ${q.question} | Options: ${q.options.join(', ')} | A: ${q.answer} | Explain: ${q.explanation}`).join('\n')}
        
        MANDATORY RULES:
        1. Welcome the player warmly in your persona.
        2. Ask questions one by one. Wait for a response.
        3. When a user answers, IMMEDIATELY call the 'updateScore' tool.
        4. Provide immediate feedback (correct/incorrect) and share the short explanation.
        5. If the user asks for a HINT, provide a subtle clue based on the question.
        6. After question 5, announce the final score.
        7. Once the summary is done, say "The show has ended. Goodbye!" to signal the end.
        8. Stay in character consistently!
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log('Live Session Connected');
            const source = inputCtx.createMediaStreamSource(micStreamRef.current!);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
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
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'updateScore') {
                  const { isCorrect, currentScore } = fc.args as { isCorrect: boolean, currentScore: number };
                  
                  setGameHistory(prev => {
                    const idx = prev.length;
                    const q = newQuestions[idx];
                    if (q) {
                      return [...prev, {
                        question: q.question,
                        correctAnswer: q.answer,
                        userWasCorrect: isCorrect,
                        hintUsed: hasUsedHint
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
              sourceNode.connect(outputCtx.destination);
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
            setError("Connection lost. Please try again.");
            stopGame();
          },
          onclose: () => {
            console.log('Session Closed');
            setStatus(GameStatus.FINISHED);
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

      sessionRef.current = await sessionPromise;
      setStatus(GameStatus.PLAYING);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start game.");
      setStatus(GameStatus.SETUP);
    }
  };

  const displayQuestionIndex = (hostReaction !== 'neutral' && currentQuestionIndex > 0) 
    ? currentQuestionIndex - 1 
    : currentQuestionIndex;
  
  const currentQuestion = questions[Math.min(displayQuestionIndex, questions.length - 1)];

  // Check if player qualifies for leaderboard
  const qualifiesForLeaderboard = score > 0 && (leaderboard.length < 5 || score > leaderboard[leaderboard.length - 1].score);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      {/* Global Leaderboard Modal */}
      {showLeaderboard && (
        <Leaderboard 
          entries={leaderboard} 
          onClose={() => setShowLeaderboard(false)} 
        />
      )}

      <header className="text-center mb-8 relative">
        <h1 className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-600 mb-2 italic drop-shadow-sm">
          AI TRIVIA NIGHT
        </h1>
        <p className="text-gray-400 uppercase tracking-widest text-sm font-semibold">Real-Time Host Personalities</p>
        
        {/* Header Stats */}
        <div className="absolute top-0 right-0 hidden md:flex flex-col items-end gap-2">
           {bestScore > 0 && (
             <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-gray-500">Personal Best</p>
                <p className="text-xl font-bold text-yellow-500">{bestScore} / 5</p>
             </div>
           )}
        </div>
      </header>

      {status === GameStatus.SETUP && (
        <div className="space-y-8 animate-fadeIn relative">
          
          {/* Main Menu Leaderboard Toggle */}
          <div className="absolute top-0 right-0 z-10">
            <button 
              onClick={() => setShowLeaderboard(true)}
              className="bg-gray-800 hover:bg-gray-700 text-yellow-500 px-4 py-2 rounded-full font-bold text-xs uppercase tracking-widest border border-gray-700 shadow-lg transition-all flex items-center gap-2"
            >
              <i className="fas fa-trophy"></i> Hall of Fame
            </button>
          </div>

          {/* Difficulty Picker */}
          <section className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl mt-10 md:mt-0">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <i className="fas fa-gauge-high text-red-500"></i> Set Difficulty
            </h2>
            <div className="flex gap-4">
              {Object.values(Difficulty).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-3 rounded-xl transition-all font-bold uppercase tracking-widest border-2 ${
                    difficulty === d 
                    ? 'bg-red-500/20 border-red-500 text-red-100 shadow-lg shadow-red-500/10' 
                    : 'bg-gray-700 border-transparent hover:bg-gray-600 text-gray-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </section>

          {/* Topic Picker */}
          <section className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <i className="fas fa-list text-yellow-500"></i> Themed Category
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  className={`px-4 py-3 rounded-xl transition-all font-medium text-xs md:text-sm ${
                    topic === t 
                    ? 'bg-yellow-500 text-black scale-105 shadow-lg shadow-yellow-500/20' 
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          {/* Host Picker */}
          <section className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <i className="fas fa-user-ninja text-orange-500"></i> Personality Archetype
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {HOST_PERSONALITIES.map((h) => (
                <div
                  key={h.id}
                  onClick={() => setSelectedHost(h)}
                  className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all hover:border-gray-500 group ${
                    selectedHost.id === h.id ? 'border-orange-500 bg-orange-500/5 ring-4 ring-orange-500/10' : 'border-transparent bg-gray-700'
                  }`}
                >
                  <div className="relative">
                    <img src={h.avatar} alt={h.name} className="w-16 h-16 rounded-full border-2 border-gray-600 group-hover:border-gray-400 transition-colors" />
                    {selectedHost.id === h.id && (
                      <div className="absolute -top-1 -right-1 bg-orange-500 text-[10px] p-1 rounded-full text-black">
                        <i className="fas fa-check"></i>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className={`font-bold text-lg ${selectedHost.id === h.id ? 'text-orange-400' : ''}`}>{h.name}</h3>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{h.description}</p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] uppercase font-bold text-orange-400/70">
                      <i className="fas fa-volume-high"></i> {h.voiceName} Voice
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <button
            onClick={startGame}
            className="w-full bg-gradient-to-r from-orange-500 to-red-600 py-6 rounded-2xl text-2xl font-black uppercase tracking-tighter hover:from-orange-400 hover:to-red-500 transition-all active:scale-[0.98] shadow-2xl shadow-orange-500/30"
          >
            Enter the Studio
          </button>
        </div>
      )}

      {status === GameStatus.LOADING_QUESTIONS && (
        <div className="text-center py-20 flex flex-col items-center animate-pulse">
          <div className="w-20 h-20 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-6 shadow-lg shadow-yellow-500/20"></div>
          <h2 className="text-2xl font-bold">Summoning {selectedHost.name}...</h2>
          <p className="text-gray-400 mt-2 uppercase tracking-widest text-xs">Generating {difficulty} level {topic} trivia</p>
        </div>
      )}

      {status === GameStatus.PLAYING && (
        <div className="space-y-6 animate-fadeIn">
          {/* HUD/Score Bar */}
          <div className="flex justify-between items-center bg-gray-800 p-4 rounded-2xl border border-gray-700 shadow-lg">
             <div className="flex items-center gap-4">
                <div className="text-center">
                   <p className="text-[10px] uppercase font-bold text-gray-500">Score</p>
                   <p className="text-2xl font-black text-yellow-500">{score}</p>
                </div>
                <div className="h-10 w-[1px] bg-gray-700"></div>
                <div className="text-center">
                   <p className="text-[10px] uppercase font-bold text-gray-500">Progress</p>
                   <p className="text-xl font-bold text-gray-300">{Math.min(displayQuestionIndex + 1, 5)} / 5</p>
                </div>
             </div>
             <div className="flex items-center gap-2 bg-black/30 px-4 py-2 rounded-xl">
                <i className="fas fa-brain text-orange-400"></i>
                <span className="text-xs font-bold uppercase tracking-widest">{topic}</span>
             </div>
          </div>

          <div className="bg-gray-800 rounded-3xl p-6 md:p-8 border border-gray-700 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-yellow-500 to-orange-500 animate-shimmer"></div>
            
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="relative group">
                <div className={`absolute -inset-2 rounded-full blur-xl transition-all duration-500 opacity-0 ${
                  hostReaction === 'correct' ? 'bg-green-500 opacity-40 scale-110' : 
                  hostReaction === 'incorrect' ? 'bg-indigo-500 opacity-40 scale-110' : ''
                }`}></div>
                
                {/* Floating Feedback Icons */}
                <div className="absolute -top-4 -right-4 z-30 pointer-events-none">
                  {hostReaction === 'correct' && (
                    <div className="text-5xl animate-bounce drop-shadow-[0_0_15px_rgba(74,222,128,0.8)] filter brightness-110">
                       ⭐
                    </div>
                  )}
                  {hostReaction === 'incorrect' && (
                    <div className="text-5xl animate-pulse drop-shadow-[0_0_15px_rgba(248,113,113,0.8)] filter brightness-110">
                       ⛈️
                    </div>
                  )}
                </div>

                <img 
                  src={selectedHost.avatar} 
                  alt={selectedHost.name} 
                  className={`w-32 h-32 md:w-40 md:h-40 rounded-full border-4 shadow-2xl transition-all duration-500 relative z-10 ${
                    hostReaction === 'correct' ? 'border-green-400 scale-105' : 
                    hostReaction === 'incorrect' ? 'border-indigo-400 grayscale-[40%] scale-95' : 
                    isHostSpeaking ? 'border-yellow-400 scale-105 shadow-yellow-400/40' : 'border-gray-600'
                  }`} 
                />
                
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 px-4 py-2 rounded-full border border-gray-700 shadow-lg z-20">
                  <AudioVisualizer isSpeaking={isHostSpeaking} color={hostReaction === 'correct' ? '#4ade80' : hostReaction === 'incorrect' ? '#818cf8' : '#eab308'} />
                </div>
              </div>

              <div className="flex-1 w-full text-center md:text-left">
                 <div className="flex justify-center md:justify-start items-center gap-2 mb-2">
                    <h2 className="text-2xl font-black">{selectedHost.name}</h2>
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest transition-colors ${
                      hostReaction === 'correct' ? 'bg-green-500/20 text-green-400' : 
                      hostReaction === 'incorrect' ? 'bg-indigo-500/20 text-indigo-400' : 
                      'bg-orange-500/20 text-orange-400'
                    }`}>
                      {hostReaction === 'neutral' ? 'LIVE' : hostReaction.toUpperCase()}
                    </span>
                 </div>
                 <p className="text-sm text-gray-400 italic line-clamp-1">{selectedHost.description}</p>
              </div>
            </div>
            
            {currentQuestion && (
              <TriviaCard 
                question={currentQuestion}
                questionNumber={Math.min(displayQuestionIndex + 1, 5)}
                totalQuestions={5}
                reaction={hostReaction}
                revealAnswer={hostReaction !== 'neutral'}
                onOptionSelect={handleOptionSelect}
                onHintRequest={handleHintRequest}
                isInteractionDisabled={isProcessingAnswer}
                hasUsedHint={hasUsedHint}
              />
            )}
          </div>

          <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700 max-h-40 overflow-y-auto shadow-inner">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 sticky top-0 bg-gray-800/95 py-1 z-10">Live Transcript</h3>
            <div className="space-y-3">
              {transcriptions.slice(-3).map((t, i) => (
                <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] px-3 py-2 rounded-xl text-xs ${
                    t.role === 'user' 
                    ? 'bg-orange-600/20 text-orange-200 rounded-br-none border border-orange-500/30' 
                    : 'bg-gray-700/50 text-gray-300 rounded-bl-none border border-white/5'
                  }`}>
                    <span className="font-bold opacity-50 mr-2 uppercase tracking-tighter">
                      {t.role === 'user' ? 'You' : 'Host'}:
                    </span>
                    {t.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center bg-black/40 p-5 rounded-2xl border border-white/5 gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isHostSpeaking ? 'bg-gray-600' : 'bg-green-500 animate-pulse ring-4 ring-green-500/20'}`}></div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {isHostSpeaking ? `${selectedHost.name} is speaking...` : 'Mic Open - Say your answer or Tap options'}
              </span>
            </div>
            <button 
              onClick={stopGame}
              className="w-full sm:w-auto px-8 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-500/20"
            >
              QUIT SHOW
            </button>
          </div>
        </div>
      )}

      {status === GameStatus.FINISHED && (
        <div className="space-y-6 animate-fadeIn">
          <div className="text-center bg-gray-800 rounded-3xl p-12 border border-gray-700 shadow-2xl relative overflow-hidden">
            <div className="w-24 h-24 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/30">
              <i className="fas fa-trophy text-4xl text-yellow-500"></i>
            </div>
            <h2 className="text-4xl font-black mb-2 uppercase italic tracking-tighter">Final Score</h2>
            <div className="text-7xl font-black text-yellow-500 mb-6 drop-shadow-lg">{score} <span className="text-2xl text-gray-500">/ 5</span></div>
            
            {score >= bestScore && score > 0 && (
               <div className="inline-block bg-yellow-500/20 text-yellow-500 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6 animate-bounce">
                  New Personal Best!
               </div>
            )}
            
            {/* Leaderboard Input Section */}
            {qualifiesForLeaderboard && !hasSavedScore ? (
              <div className="mt-6 mb-8 bg-black/30 p-6 rounded-2xl border border-yellow-500/30 animate-pulse-subtle">
                <h3 className="text-xl font-bold text-yellow-400 mb-2 uppercase">You made the Leaderboard!</h3>
                <div className="flex flex-col md:flex-row gap-3 justify-center items-center">
                   <input 
                     type="text" 
                     maxLength={12}
                     placeholder="Enter your name..." 
                     value={playerName}
                     onChange={(e) => setPlayerName(e.target.value)}
                     className="bg-gray-900 border border-gray-600 rounded-xl px-4 py-2 text-center text-white focus:border-yellow-500 focus:outline-none w-full md:w-auto"
                   />
                   <button 
                     onClick={handleSaveScore}
                     disabled={!playerName.trim()}
                     className="bg-yellow-500 text-black px-6 py-2 rounded-xl font-bold uppercase hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full md:w-auto"
                   >
                     Claim Spot
                   </button>
                </div>
              </div>
            ) : hasSavedScore && (
               <div className="mt-6 mb-8">
                 <span className="bg-green-500/20 text-green-400 px-6 py-2 rounded-full font-bold uppercase tracking-widest border border-green-500/30">
                    <i className="fas fa-check-circle"></i> Score Saved
                 </span>
               </div>
            )}

            <p className="text-gray-400 text-xl max-w-md mx-auto mb-8">
              {selectedHost.name} just finished your {difficulty} {topic} challenge.
            </p>
          </div>

          <div className="bg-gray-800 rounded-3xl p-8 border border-gray-700 shadow-xl">
             <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <i className="fas fa-history text-orange-500"></i> Question Summary
             </h3>
             <div className="space-y-4">
                {gameHistory.map((res, i) => (
                   <div key={i} className={`p-4 rounded-2xl border ${res.userWasCorrect ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                      <div className="flex items-start gap-3">
                         <div className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${res.userWasCorrect ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}`}>
                            {res.userWasCorrect ? <i className="fas fa-check"></i> : <i className="fas fa-times"></i>}
                         </div>
                         <div className="flex-1">
                            <p className="font-bold text-gray-200">{res.question}</p>
                            <p className="text-sm text-gray-400 mt-2">
                               <span className="text-xs uppercase font-bold tracking-widest text-gray-500 mr-2">Answer:</span> 
                               {res.correctAnswer}
                               {res.hintUsed && (
                                  <span className="ml-3 inline-block bg-indigo-500/20 text-indigo-400 text-[10px] px-2 py-0.5 rounded border border-indigo-500/30">
                                    <i className="fas fa-magic mr-1"></i> Hint Used
                                  </span>
                               )}
                            </p>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4">
            <button
              onClick={() => setShowLeaderboard(true)}
              className="flex-1 bg-gray-700 text-gray-300 py-6 rounded-2xl font-black uppercase text-xl hover:bg-gray-600 transition-all shadow-lg flex items-center justify-center gap-4"
            >
              <i className="fas fa-list-ol"></i> Leaderboard
            </button>
            <button
              onClick={() => setStatus(GameStatus.SETUP)}
              className="flex-[2] bg-yellow-500 text-black py-6 rounded-2xl font-black uppercase text-2xl hover:scale-[1.01] transition-all shadow-xl shadow-yellow-500/20 flex items-center justify-center gap-4"
            >
              <i className="fas fa-redo"></i> Play Another Show
            </button>
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
