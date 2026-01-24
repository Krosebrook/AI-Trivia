
import React from 'react';
import { GameHistoryEntry } from '../types';

interface HistoryModalProps {
  history: GameHistoryEntry[];
  onClose: () => void;
  onClear: () => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ history, onClose, onClear }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-fadeIn p-4">
      <div className="bg-gray-800 w-full max-w-lg rounded-3xl border border-gray-700 shadow-2xl flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
          <h2 className="text-2xl font-black uppercase text-white flex items-center gap-2">
            <i className="fas fa-clock-rotate-left text-blue-400"></i> Game History
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {history.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <i className="fas fa-scroll text-4xl mb-3 opacity-30"></i>
              <p>No games played yet.</p>
            </div>
          ) : (
            history.slice().reverse().map((entry) => (
              <div key={entry.id} className="bg-gray-900/50 border border-gray-700 p-4 rounded-xl flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-gray-500 uppercase">{entry.difficulty}</span>
                    <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                    <span className="text-xs font-bold text-yellow-500 uppercase">{entry.topic}</span>
                  </div>
                  <div className="text-sm text-gray-300">
                    Host: <span className="font-bold text-gray-200">{entry.hostName}</span>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">
                    {new Date(entry.date).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-black ${entry.score >= 4 ? 'text-green-400' : entry.score >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {entry.score}/5
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-800/50 flex gap-4">
           {history.length > 0 && (
             <button 
               onClick={onClear}
               className="px-4 py-2 text-xs font-bold text-red-400 hover:text-red-300 uppercase"
             >
               Clear History
             </button>
           )}
           <button 
             onClick={onClose}
             className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 text-white font-bold uppercase rounded-xl transition-colors"
           >
             Close
           </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
