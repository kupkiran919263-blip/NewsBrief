import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isPlaying }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!svgRef.current || !analyser) return;

    const svg = d3.select(svgRef.current);
    const width = 300;
    const height = 100;
    
    // Config
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Scales
    // We only use a subset of the frequency bin to avoid the high-end emptiness
    const usefulBins = Math.floor(bufferLength * 0.7); 
    const barWidth = (width / usefulBins) * 2.5;

    const renderFrame = () => {
      // If we stopped playing, stop the loop
      if (!isPlaying) {
         // Optional: flatten the bars nicely
         svg.selectAll('rect')
           .transition()
           .duration(500)
           .attr('height', 4)
           .attr('y', (height - 4) / 2)
           .attr('fill', '#334155');
         return;
      }

      try {
        analyser.getByteFrequencyData(dataArray);

        // Convert slice of TypedArray to standard Array for maximum D3 compatibility
        const displayData = Array.from(dataArray.slice(0, usefulBins));

        svg.selectAll('rect')
          .data(displayData)
          .join(
            enter => enter.append('rect')
              .attr('x', (d, i) => i * (barWidth + 1))
              .attr('width', barWidth)
              .attr('rx', 2)
              .attr('fill', '#334155'), // Initial color
            update => update,
            exit => exit.remove()
          )
          .attr('height', (d) => {
            const val = d as number;
            return Math.max(4, (val / 255) * height);
          })
          .attr('y', (d) => {
            const val = d as number;
            const h = Math.max(4, (val / 255) * height);
            return (height - h) / 2; // Center vertically
          })
          .attr('fill', (d) => {
            const val = d as number;
            const t = Math.min(1, (val / 255) * 1.5 + 0.2); 
            // Manual RGB interpolation (Indigo to Cyan) to avoid dependency on d3-scale-chromatic
            // Indigo-500: 99, 102, 241
            // Cyan-400: 34, 211, 238
            const r = 99 + (34 - 99) * t;
            const g = 102 + (211 - 102) * t;
            const b = 241 + (238 - 241) * t;
            return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
          });

        animationRef.current = requestAnimationFrame(renderFrame);
      } catch (e) {
        console.error("Visualizer render error:", e);
        // Stop animation on error to prevent infinite crash loop
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      }
    };

    renderFrame();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [analyser, isPlaying]);

  return (
    <svg 
      ref={svgRef} 
      viewBox="0 0 300 100" 
      className="w-full h-32 opacity-90" 
      preserveAspectRatio="none"
    />
  );
};

export default Visualizer;