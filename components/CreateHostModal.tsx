
import React, { useState } from 'react';
import { HostPersonality } from '../types';

interface CreateHostModalProps {
  onSave: (host: HostPersonality) => void;
  onClose: () => void;
}

const CreateHostModal: React.FC<CreateHostModalProps> = ({ onSave, onClose }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [voiceName, setVoiceName] = useState<'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'>('Puck');
  const [prompt, setPrompt] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(Math.floor(Math.random() * 1000));

  const handleSubmit = () => {
    if (!name || !description || !prompt) return;
    
    const newHost: HostPersonality = {
      id: `custom-${Date.now()}`,
      name,
      description,
      voiceName,
      prompt: `You are ${name}. ${prompt}`,
      avatar: `https://picsum.photos/seed/${avatarSeed}/300/300`,
      isCustom: true
    };
    
    onSave(newHost);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md animate-fadeIn p-4">
      <div className="bg-gray-800 w-full max-w-lg rounded-3xl border border-gray-700 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800">
          <h2 className="text-xl font-black uppercase text-white flex items-center gap-2">
            <i className="fas fa-robot text-purple-400"></i> Create AI Host
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
           {/* Preview Avatar */}
           <div className="flex justify-center mb-4">
             <div className="relative group cursor-pointer" onClick={() => setAvatarSeed(Math.floor(Math.random() * 10000))}>
               <img 
                 src={`https://picsum.photos/seed/${avatarSeed}/300/300`} 
                 alt="Preview" 
                 className="w-24 h-24 rounded-full border-4 border-purple-500 shadow-lg"
               />
               <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                 <i className="fas fa-random text-white"></i>
               </div>
             </div>
           </div>

           <div>
             <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Name</label>
             <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 outline-none" placeholder="e.g. Robo Quizmaster" />
           </div>

           <div>
             <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Voice</label>
             <div className="grid grid-cols-5 gap-2">
               {['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].map(v => (
                 <button 
                   key={v}
                   onClick={() => setVoiceName(v as any)}
                   className={`p-2 rounded-lg text-xs font-bold border ${voiceName === v ? 'bg-purple-500/20 border-purple-500 text-purple-300' : 'bg-gray-700 border-transparent text-gray-400'}`}
                 >
                   {v}
                 </button>
               ))}
             </div>
           </div>

           <div>
             <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tagline</label>
             <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 outline-none" placeholder="Short description for the menu" />
           </div>

           <div>
             <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Personality Prompt</label>
             <textarea 
               value={prompt} 
               onChange={e => setPrompt(e.target.value)} 
               className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:border-purple-500 outline-none h-32 text-sm" 
               placeholder="Describe how the AI should behave. E.g. 'You are a pirate who loves gold and trivia. Use pirate slang.'"
             />
             <p className="text-[10px] text-gray-500 mt-1">This prompt will shape the AI's behavior.</p>
           </div>
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-800">
          <button 
            onClick={handleSubmit}
            disabled={!name || !description || !prompt}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold uppercase rounded-xl transition-colors shadow-lg"
          >
            Create Host
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateHostModal;
