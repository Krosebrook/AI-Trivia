
import React from 'react';
import { AppSettings } from '../types';
import { HOST_PERSONALITIES } from '../constants';

interface SettingsModalProps {
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onUpdate, onClose }) => {
  const handleChange = (key: keyof AppSettings, value: any) => {
    onUpdate({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn p-4">
      <div className="bg-gray-800 w-full max-w-md rounded-3xl border border-gray-700 shadow-2xl overflow-hidden p-6 space-y-6">
        <div className="flex justify-between items-center border-b border-gray-700 pb-4">
          <h2 className="text-2xl font-black uppercase text-white flex items-center gap-2">
            <i className="fas fa-sliders"></i> Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        {/* Audio Levels */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Audio Levels</h3>
          
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Host Voice Volume</span>
              <span>{Math.round(settings.hostVolume * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0" max="1" step="0.05"
              value={settings.hostVolume}
              onChange={(e) => handleChange('hostVolume', parseFloat(e.target.value))}
              className="w-full accent-yellow-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Sound Effects</span>
              <span>{Math.round(settings.sfxVolume * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0" max="1" step="0.05"
              value={settings.sfxVolume}
              onChange={(e) => handleChange('sfxVolume', parseFloat(e.target.value))}
              className="w-full accent-orange-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* Defaults */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Preferences</h3>
          
          <div className="space-y-2">
            <label className="text-xs text-gray-300">Default Host Personality</label>
            <select 
              value={settings.defaultHostId}
              onChange={(e) => handleChange('defaultHostId', e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm focus:border-yellow-500 outline-none"
            >
              {HOST_PERSONALITIES.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <button 
             onClick={() => handleChange('hasSeenTutorial', false)}
             className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-xs uppercase font-bold rounded-lg border border-gray-600"
          >
            Replay Tutorial
          </button>
        </div>

        <button 
          onClick={onClose}
          className="w-full py-3 bg-yellow-500 text-black font-black uppercase rounded-xl hover:bg-yellow-400"
        >
          Save & Close
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;
