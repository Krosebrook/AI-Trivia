
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isSpeaking: boolean;
  color: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isSpeaking, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime = Date.now();

    const draw = () => {
      const time = (Date.now() - startTime) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barCount = 12;
      const spacing = 4;
      const barWidth = (canvas.width - (barCount - 1) * spacing) / barCount;
      
      ctx.fillStyle = color;
      
      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + spacing);
        let height = 4; // minimum height
        
        if (isSpeaking) {
          // Create some organic looking motion
          const amplitude = 30;
          const freq = 5;
          const phase = i * 0.5;
          height = 4 + Math.abs(Math.sin(time * freq + phase)) * amplitude;
        }
        
        const y = (canvas.height - height) / 2;
        ctx.fillRect(x, y, barWidth, height);
      }
      
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSpeaking, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={120} 
      height={40} 
      className="bg-transparent"
    />
  );
};

export default AudioVisualizer;
