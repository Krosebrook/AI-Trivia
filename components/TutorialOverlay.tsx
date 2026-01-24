
import React, { useState } from 'react';

interface TutorialOverlayProps {
  onComplete: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to AI Trivia Night!",
      icon: "fa-microphone-lines",
      text: "Experience a fully interactive voice-powered trivia game hosted by AI personalities.",
      highlight: ""
    },
    {
      title: "Pick Your Host",
      icon: "fa-user-ninja",
      text: "Each host has a unique personality, voice, and reaction style. Choose one that fits your vibe!",
      highlight: ""
    },
    {
      title: "Customize Your Game",
      icon: "fa-sliders",
      text: "Select a topic that interests you and set the difficulty level before entering the studio.",
      highlight: ""
    },
    {
      title: "Voice or Touch",
      icon: "fa-fingerprint",
      text: "You can TAP the options OR just SAY your answer out loud. The host is listening!",
      highlight: ""
    },
    {
      title: "Need a hand?",
      icon: "fa-life-ring",
      text: "Press 'H' or tap the 'Hint' button to ask the host for a subtle clue without giving it away.",
      highlight: ""
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="max-w-md w-full bg-gray-800 rounded-3xl border border-yellow-500/30 shadow-[0_0_50px_rgba(234,179,8,0.2)] p-8 text-center relative overflow-hidden">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 h-1 bg-yellow-500 transition-all duration-300" style={{ width: `${((step + 1) / steps.length) * 100}%` }}></div>

        <div className="mb-6 mt-4">
           <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-yellow-500 text-yellow-400 text-3xl animate-bounce-subtle">
             <i className={`fas ${steps[step].icon}`}></i>
           </div>
           <h2 className="text-2xl font-black text-white mb-2">{steps[step].title}</h2>
           <p className="text-gray-300 leading-relaxed">{steps[step].text}</p>
        </div>

        <button 
          onClick={handleNext}
          className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-black uppercase tracking-widest rounded-xl text-lg shadow-lg transform transition-transform active:scale-95"
        >
          {step === steps.length - 1 ? "Let's Play!" : "Next"}
        </button>
        
        <div className="mt-4 flex justify-center gap-2">
           {steps.map((_, i) => (
             <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-yellow-500' : 'bg-gray-600'}`}></div>
           ))}
        </div>
      </div>
    </div>
  );
};

export default TutorialOverlay;
