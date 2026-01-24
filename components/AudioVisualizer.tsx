
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isSpeaking: boolean;
  color: string;
  mode: 'bars' | 'wave' | 'orb';
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isSpeaking, color, mode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime = Date.now();
    let phase = 0;

    const draw = () => {
      const time = (Date.now() - startTime) / 1000;
      phase += 0.05;
      
      // Clear with fade effect for trails if desired, or full clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;
      const centerX = width / 2;

      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      if (mode === 'bars') {
        const barCount = 12;
        const spacing = 4;
        const barWidth = (width - (barCount - 1) * spacing) / barCount;
        
        for (let i = 0; i < barCount; i++) {
          const x = i * (barWidth + spacing);
          let h = 4;
          if (isSpeaking) {
             const noise = Math.sin(time * 10 + i) * Math.cos(time * 5 + i * 0.5);
             h = 4 + Math.abs(noise) * 25;
          }
          const y = centerY - h / 2;
          ctx.fillRect(x, y, barWidth, h);
        }
      } 
      else if (mode === 'wave') {
        ctx.beginPath();
        ctx.lineWidth = 3;
        for (let x = 0; x < width; x++) {
          let y = centerY;
          if (isSpeaking) {
             // Superposition of sine waves
             const y1 = Math.sin(x * 0.05 + time * 5) * 10;
             const y2 = Math.sin(x * 0.1 - time * 3) * 5;
             y = centerY + (y1 + y2) * (isSpeaking ? 1 : 0.1);
          } else {
             y = centerY + Math.sin(x * 0.05 + time) * 2;
          }
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      else if (mode === 'orb') {
        const baseRadius = 15;
        let radius = baseRadius;
        
        if (isSpeaking) {
           radius = baseRadius + Math.sin(time * 15) * 5 + Math.random() * 5;
        }

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Rings
        if (isSpeaking) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }
      }
      
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSpeaking, color, mode]);

  return (
    <canvas 
      ref={canvasRef} 
      width={120} 
      height={60} 
      className="bg-transparent"
    />
  );
};

export default AudioVisualizer;
