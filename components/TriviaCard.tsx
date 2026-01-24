
import React, { useState, useEffect } from 'react';
import { TriviaQuestion } from '../types';
import ReactionEffects from './ReactionEffects';

interface TriviaCardProps {
  question: TriviaQuestion;
  questionNumber: number;
  totalQuestions: number;
  reaction: 'neutral' | 'correct' | 'incorrect';
  revealAnswer: boolean;
  onOptionSelect: (option: string) => void;
  onHintRequest: () => void;
  isInteractionDisabled: boolean;
  hasUsedHint: boolean;
}

const TriviaCard: React.FC<TriviaCardProps> = ({ 
  question, 
  questionNumber, 
  totalQuestions, 
  reaction,
  revealAnswer,
  onOptionSelect,
  onHintRequest,
  isInteractionDisabled,
  hasUsedHint
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Reset local selection when question changes
  useEffect(() => {
    setSelectedOption(null);
  }, [question]);

  const handleSelect = (opt: string) => {
    if (isInteractionDisabled || revealAnswer || selectedOption) return;
    setSelectedOption(opt);
    onOptionSelect(opt);
  };

  if (!question) return null;

  return (
    <div className={`
      relative w-full max-w-2xl mx-auto mt-6 p-6 md:p-8 rounded-3xl 
      transition-all duration-500 transform overflow-hidden
      ${reaction === 'correct' ? 'bg-green-900/20 border-green-500/50 shadow-[0_0_40px_rgba(74,222,128,0.3)] scale-[1.02]' : 
        reaction === 'incorrect' ? 'bg-red-900/20 border-red-500/50 shadow-[0_0_40px_rgba(248,113,113,0.3)]' : 
        'bg-gray-800/80 border-gray-700 shadow-2xl'}
      border backdrop-blur-xl animate-fadeIn
    `}>
      {/* Background Visual Effects */}
      <ReactionEffects reaction={reaction} />

      {/* Content Container (z-10 to sit above effects background but below Stamp) */}
      <div className="relative z-10">
        {/* Question Number Badge */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex gap-2">
          <span className={`
            px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest border shadow-xl transition-colors duration-300
            ${reaction === 'correct' ? 'bg-green-900 text-green-200 border-green-500' : 
              reaction === 'incorrect' ? 'bg-red-900 text-red-200 border-red-500' : 
              'bg-gray-900 text-gray-400 border-gray-700'}
          `}>
            Question {questionNumber} / {totalQuestions}
          </span>
        </div>

        {/* Hint Button (Top Right) */}
        {!revealAnswer && !isInteractionDisabled && (
          <button
            onClick={onHintRequest}
            disabled={hasUsedHint}
            className={`
              absolute top-0 right-0 text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-lg border transition-all
              ${hasUsedHint 
                ? 'bg-transparent text-gray-500 border-gray-700 cursor-not-allowed' 
                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 hover:bg-indigo-500/40 hover:scale-105 shadow-lg shadow-indigo-500/20'}
            `}
          >
            {hasUsedHint ? <span className="flex items-center gap-1"><i className="fas fa-check"></i> Hint Used</span> : <span className="flex items-center gap-1"><i className="fas fa-magic"></i> Need Hint?</span>}
          </button>
        )}

        {/* Question Text */}
        <h3 className="text-xl md:text-2xl font-black text-center mb-8 text-gray-100 leading-tight drop-shadow-md mt-6">
          {question.question}
        </h3>

        {/* Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {question.options.map((opt, idx) => {
            const isCorrect = opt === question.answer;
            const isSelected = selectedOption === opt;
            
            // Determine style based on state
            let optionStyle = "border-gray-700 bg-gray-900/50 text-gray-300";
            let cursorStyle = "cursor-pointer hover:border-yellow-500/50 hover:bg-gray-800";
            let animationClass = "";

            if (revealAnswer) {
              cursorStyle = "cursor-default";
              if (isCorrect) {
                optionStyle = "border-green-500 bg-green-500/40 text-green-100 shadow-[0_0_15px_rgba(74,222,128,0.3)] font-bold scale-[1.02]";
              } else if (isSelected) {
                 optionStyle = "border-red-500 bg-red-500/40 text-red-100 opacity-60"; // Selected but wrong
              } else {
                 optionStyle = "border-gray-800 bg-gray-900/20 text-gray-600 opacity-30 grayscale";
              }
            } else if (isSelected) {
              optionStyle = "border-yellow-500 bg-yellow-500/20 text-yellow-200 font-bold shadow-[0_0_10px_rgba(234,179,8,0.2)]";
              // While waiting for AI response, make selected option pulse
              if (isInteractionDisabled && !revealAnswer) {
                animationClass = "animate-pulse";
              }
            } else if (isInteractionDisabled) {
               // When waiting for AI response, non-selected options pulse to show "Processing"
               cursorStyle = "cursor-not-allowed opacity-50";
               animationClass = "animate-pulse";
               optionStyle = "border-gray-700/50 bg-gray-900/30 text-transparent relative overflow-hidden";
            }

            return (
              <button 
                key={idx} 
                onClick={() => handleSelect(opt)}
                disabled={isInteractionDisabled || revealAnswer || selectedOption !== null}
                className={`
                  p-4 rounded-xl border-2 text-sm md:text-base text-center transition-all duration-300
                  flex items-center justify-center min-h-[60px] active:scale-[0.98]
                  ${optionStyle} ${cursorStyle} ${animationClass}
                `}
              >
                {/* Visual feedback for thinking state - Skeleton Bar for unselected items */}
                {isInteractionDisabled && !isSelected && !revealAnswer && (
                  <div className="absolute inset-0 bg-gray-700/50 animate-pulse rounded-lg m-1"></div>
                )}

                {/* Selected Item Spinner */}
                {isInteractionDisabled && !revealAnswer && isSelected && (
                   <span className="flex items-center gap-2">
                     <i className="fas fa-circle-notch fa-spin text-yellow-500"></i>
                     <span>Checking...</span>
                   </span>
                )}
                
                {/* Normal text display - hidden if unselected skeleton active */}
                {(!isInteractionDisabled || revealAnswer || isSelected) && opt}
              </button>
            );
          })}
        </div>
        
        {/* Explanation Section */}
        <div className={`
          overflow-hidden transition-all duration-700 ease-in-out
          ${revealAnswer ? 'max-h-60 opacity-100 mt-6' : 'max-h-0 opacity-0 mt-0'}
        `}>
          <div className="bg-black/60 rounded-xl p-4 border-l-4 border-yellow-500 relative backdrop-blur-sm">
             <div className="flex gap-3">
               <i className="fas fa-lightbulb text-yellow-500 mt-1 animate-pulse"></i>
               <div>
                 <p className="text-xs font-bold text-yellow-500 uppercase tracking-widest mb-1">Did you know?</p>
                 <p className="text-sm text-gray-300 leading-relaxed">
                   {question.explanation}
                 </p>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TriviaCard;
