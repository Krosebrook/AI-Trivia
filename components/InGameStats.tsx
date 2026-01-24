
import React from 'react';
import { LiveStats } from '../types';

interface InGameStatsProps {
  stats: LiveStats;
}

const InGameStats: React.FC<InGameStatsProps> = ({ stats }) => {
  return (
    <div className="bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-xl p-3 flex gap-4 md:gap-8 items-center justify-center animate-fadeIn shadow-lg">
      <div className="text-center">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Streak</p>
        <div className="flex items-center justify-center gap-2">
          <i className={`fas fa-fire ${stats.currentStreak > 2 ? 'text-orange-500 animate-pulse' : 'text-gray-600'}`}></i>
          <span className="text-xl font-black text-white">{stats.currentStreak}</span>
        </div>
      </div>

      <div className="w-[1px] h-8 bg-gray-700"></div>

      <div className="text-center">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Avg Time</p>
        <div className="flex items-center justify-center gap-2">
          <i className="fas fa-stopwatch text-blue-400"></i>
          <span className="text-xl font-black text-white">{(stats.avgResponseTime / 1000).toFixed(1)}s</span>
        </div>
      </div>

      <div className="w-[1px] h-8 bg-gray-700"></div>

      <div className="text-center">
        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Best Streak</p>
        <span className="text-xl font-black text-gray-300">{stats.longestStreak}</span>
      </div>
    </div>
  );
};

export default InGameStats;
