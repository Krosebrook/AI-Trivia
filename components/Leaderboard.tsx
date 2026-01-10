
import React from 'react';
import { LeaderboardEntry } from '../types';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  onClose: () => void;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ entries, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-fadeIn p-4">
      <div className="bg-gray-800 w-full max-w-md rounded-3xl border border-gray-700 shadow-2xl overflow-hidden transform transition-all animate-stamp">
        <div className="bg-gradient-to-r from-yellow-600 to-orange-600 p-6 text-center relative">
          <h2 className="text-2xl font-black uppercase tracking-widest text-white flex items-center justify-center gap-2 drop-shadow-md">
            <i className="fas fa-crown text-yellow-300"></i> Hall of Fame
          </h2>
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {entries.length === 0 ? (
            <div className="text-center text-gray-500 py-12 flex flex-col items-center gap-3">
              <i className="fas fa-ghost text-4xl opacity-30"></i>
              <p className="italic">No champions yet.<br/>Be the first to claim victory!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div 
                  key={index} 
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:scale-[1.02] ${
                    index === 0 ? 'bg-yellow-500/10 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.1)]' : 
                    index === 1 ? 'bg-gray-400/10 border-gray-400/30' : 
                    index === 2 ? 'bg-orange-700/10 border-orange-700/30' : 
                    'bg-gray-800 border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`
                      w-8 h-8 flex items-center justify-center rounded-full font-black text-sm shadow-lg
                      ${index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black border border-yellow-300' : 
                        index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-black border border-gray-300' : 
                        index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-700 text-white border border-orange-400' : 
                        'bg-gray-700 text-gray-400 border border-gray-600'}
                    `}>
                      {index + 1}
                    </span>
                    <div>
                      <p className={`font-bold text-base ${index === 0 ? 'text-yellow-400' : 'text-gray-200'}`}>
                        {entry.name}
                      </p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide flex items-center gap-1">
                         <i className="fas fa-tag text-[8px]"></i> {entry.topic}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-white">{entry.score} <span className="text-xs text-gray-500 font-normal">/ 5</span></p>
                    <p className="text-[10px] text-gray-500">{new Date(entry.date).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 bg-gray-900/50 border-t border-gray-800 text-center">
          <button 
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold uppercase tracking-widest text-xs transition-colors"
          >
            Close Leaderboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
