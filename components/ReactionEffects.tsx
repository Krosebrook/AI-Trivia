
import React from 'react';

interface ReactionEffectsProps {
  reaction: 'neutral' | 'correct' | 'incorrect';
}

const ReactionEffects: React.FC<ReactionEffectsProps> = ({ reaction }) => {
  if (reaction === 'neutral') return null;

  return (
    <>
      <style>{`
        @keyframes fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
        }
        @keyframes rain {
          0% { transform: translateY(-20px) translateX(0); opacity: 0.6; }
          100% { transform: translateY(400px) translateX(-20px); opacity: 0; }
        }
        @keyframes popIn {
          0% { transform: translate(-50%, -50%) scale(0) rotate(-45deg); opacity: 0; }
          60% { transform: translate(-50%, -50%) scale(1.2) rotate(-5deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1) rotate(-12deg); opacity: 1; }
        }
        .animate-confetti { animation: fall 2.5s ease-out forwards; }
        .animate-rain { animation: rain 0.8s linear infinite; }
        .animate-stamp { animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>
      
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden rounded-3xl">
        {reaction === 'correct' && (
          <>
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-sm animate-confetti"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-${Math.random() * 20}%`,
                  backgroundColor: ['#FCD34D', '#34D399', '#60A5FA', '#F472B6', '#A78BFA'][Math.floor(Math.random() * 5)],
                  animationDelay: `${Math.random() * 1}s`,
                  animationDuration: `${1.5 + Math.random()}s`
                }}
              />
            ))}
            <div className="absolute inset-0 bg-green-500/10 mix-blend-overlay" />
          </>
        )}

        {reaction === 'incorrect' && (
          <>
            <div className="absolute inset-0 bg-gray-900/40 mix-blend-multiply" />
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-0.5 h-8 bg-blue-300/40 animate-rain"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-${Math.random() * 20}%`,
                  animationDelay: `${Math.random()}s`,
                  animationDuration: `${0.5 + Math.random() * 0.3}s`
                }}
              />
            ))}
          </>
        )}
      </div>

      {/* Stamp Overlay */}
      <div className="absolute top-1/2 left-1/2 z-50 pointer-events-none w-full flex justify-center">
        <div className={`
          border-[6px] border-double rounded-xl px-8 py-4 
          text-4xl md:text-6xl font-black uppercase tracking-[0.2em] 
          opacity-0 animate-stamp rotate-12 backdrop-blur-sm shadow-2xl
          ${reaction === 'correct' 
            ? 'border-green-400 text-green-100 bg-green-900/80 shadow-green-500/50' 
            : 'border-red-500 text-red-100 bg-red-900/80 shadow-red-500/50'}
        `}>
          {reaction === 'correct' ? 'CORRECT!' : 'MISSED!'}
        </div>
      </div>
    </>
  );
};

export default ReactionEffects;
