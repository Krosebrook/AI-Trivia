
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GeminiService } from './services/geminiService';
import { GameStatus, HostPersonality, TriviaQuestion, TranscriptionItem, Difficulty, QuestionResult } from './types';
import { HOST_PERSONALITIES, TOPICS } from './constants';
import AudioVisualizer from './components/AudioVisualizer';
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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [hostReaction, setHostReaction] = useState<'neutral' | 'correct' | 'incorrect'>('neutral');
  const [gameHistory, setGameHistory] = useState<QuestionResult[]>([]);

  // Live API Refs
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);

  const gemini = new GeminiService();

  // Reset host reaction after a delay
  useEffect(() => {
    if (hostReaction !== 'neutral') {
      const timer = setTimeout(() => setHostReaction('neutral'), 3000);
      return () => clearTimeout(timer);
    }
  }, [hostReaction]);

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

  const stopGame = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setStatus(GameStatus.SETUP);
    setIsHostSpeaking(false);
    setHostReaction('neutral');
  }, []);

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

  const startGame = async () => {
    try {
      setStatus(GameStatus.LOADING_QUESTIONS);
      setError(null);
      setScore(0);
      setCurrentQuestionIndex(0);
      setTranscriptions([]);
      setHostReaction('neutral');
      setGameHistory([]);
      
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
        4. Provide immediate, character-appropriate feedback (correct/incorrect) and share the short explanation provided.
        5. After question 5, announce the final score in a way that fits your personality.
        6. Once the summary is done, say "The show has ended. Goodbye!" which signals the end.
        7. Stay in character consistently! Use your specific voice and style.
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
                  
                  // Update history state
                  setGameHistory(prev => {
                    const idx = prev.length;
                    const q = newQuestions[idx];
                    if (q) {
                      return [...prev, {
                        question: q.question,
                        correctAnswer: q.answer,
                        userWasCorrect: isCorrect
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
                      response: { result: "Score and history updated" }
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
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsHostSpeaking(false);
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

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-600 mb-2 italic drop-shadow-sm">
          AI TRIVIA NIGHT
        </h1>
        <p className="text-gray-400 uppercase tracking-widest text-sm font-semibold">Real-Time Host Personalities</p>
      </header>

      {status === GameStatus.SETUP && (
        <div className="space-y-8 animate-fadeIn">
          {/* Difficulty Picker */}
          <section className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl">
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
                   <p className="text-xl font-bold text-gray-300">{Math.min(currentQuestionIndex + 1, 5)} / 5</p>
                </div>
             </div>
             <div className="flex items-center gap-2 bg-black/30 px-4 py-2 rounded-xl">
                <i className="fas fa-brain text-orange-400"></i>
                <span className="text-xs font-bold uppercase tracking-widest">{topic}</span>
             </div>
          </div>

          <div className="bg-gray-800 rounded-3xl p-8 border border-gray-700 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-yellow-500 to-orange-500 animate-shimmer"></div>
            
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="relative group">
                <div className={`absolute -inset-2 rounded-full blur-xl transition-all duration-500 opacity-0 ${
                  hostReaction === 'correct' ? 'bg-green-500 opacity-40 scale-110' : 
                  hostReaction === 'incorrect' ? 'bg-indigo-500 opacity-40 scale-110' : ''
                }`}></div>
                
                <img 
                  src={selectedHost.avatar} 
                  alt={selectedHost.name} 
                  className={`w-40 h-40 md:w-56 md:h-56 rounded-full border-4 shadow-2xl transition-all duration-500 relative z-10 ${
                    hostReaction === 'correct' ? 'border-green-400 scale-105 animate-bounce' : 
                    hostReaction === 'incorrect' ? 'border-indigo-400 grayscale-[20%] animate-pulse' : 
                    isHostSpeaking ? 'border-yellow-400 scale-105 shadow-yellow-400/40' : 'border-gray-600'
                  }`} 
                />
                
                {hostReaction === 'correct' && (
                  <div className="absolute top-0 right-0 z-20 bg-green-500 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg animate-[bounce_1s_infinite]">
                    <i className="fas fa-smile text-2xl"></i>
                  </div>
                )}
                {hostReaction === 'incorrect' && (
                  <div className="absolute top-0 right-0 z-20 bg-indigo-600 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg animate-[pulse_1.5s_infinite]">
                    <i className="fas fa-lightbulb text-2xl"></i>
                  </div>
                )}

                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 px-4 py-2 rounded-full border border-gray-700 shadow-lg z-20">
                  <AudioVisualizer isSpeaking={isHostSpeaking} color={hostReaction === 'correct' ? '#4ade80' : hostReaction === 'incorrect' ? '#818cf8' : '#eab308'} />
                </div>
              </div>

              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-3">
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest transition-colors ${
                    hostReaction === 'correct' ? 'bg-green-500/20 text-green-400' : 
                    hostReaction === 'incorrect' ? 'bg-indigo-500/20 text-indigo-400' : 
                    'bg-orange-500/20 text-orange-400'
                  }`}>
                    {hostReaction === 'neutral' ? 'LIVE SESSION' : hostReaction.toUpperCase()}
                  </span>
                  <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                    {difficulty}
                  </span>
                </div>
                <h2 className="text-3xl font-black mb-1">{selectedHost.name}</h2>
                
                <div className={`bg-black/40 rounded-2xl p-6 min-h-[140px] flex items-center justify-center text-center backdrop-blur-sm border transition-all duration-300 ${
                  hostReaction === 'correct' ? 'border-green-500/30 bg-green-950/20' : 
                  hostReaction === 'incorrect' ? 'border-indigo-500/30 bg-indigo-950/20' : 
                  'border-white/5'
                }`}>
                  <p className="text-xl md:text-2xl font-medium leading-relaxed text-gray-100">
                    {transcriptions.length > 0 
                      ? transcriptions[transcriptions.length - 1].text 
                      : `Welcome to the show! We're doing ${topic} on ${difficulty} difficulty.`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700 max-h-60 overflow-y-auto shadow-inner">
            <h3 className="text-sm font-bold text-gray-500 uppercase mb-4 sticky top-0 bg-gray-800/95 py-1 z-10">Live Transcription</h3>
            <div className="space-y-4">
              {transcriptions.map((t, i) => (
                <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2 rounded-2xl text-sm ${
                    t.role === 'user' 
                    ? 'bg-orange-600/20 text-orange-200 rounded-br-none border border-orange-500/30' 
                    : 'bg-gray-700/50 text-gray-300 rounded-bl-none border border-white/5'
                  }`}>
                    <span className="text-[10px] block opacity-50 mb-1 uppercase font-bold tracking-tighter">
                      {t.role === 'user' ? 'You' : selectedHost.name}
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
                {isHostSpeaking ? `${selectedHost.name} is speaking...` : 'Listening for your answer...'}
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
                            </p>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </div>
          
          <button
            onClick={() => setStatus(GameStatus.SETUP)}
            className="w-full bg-yellow-500 text-black py-6 rounded-2xl font-black uppercase text-2xl hover:scale-[1.01] transition-all shadow-xl shadow-yellow-500/20 flex items-center justify-center gap-4"
          >
            <i className="fas fa-redo"></i> Play Another Show
          </button>
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
