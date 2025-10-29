import React from 'react';

interface TrashCanBackgroundProps {
  className?: string;
}

export const TrashCanBackground: React.FC<TrashCanBackgroundProps> = ({ className = '' }) => {
  // Generate random trash can positions, sizes, and rotations
  const trashCans = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    rotation: (Math.random() - 0.5) * 60, // -30 to 30 degrees
    fontSize: 1 + Math.random() * 2, // 1rem to 3rem
  }));

  return (
    <div className={`absolute inset-0 pointer-events-none select-none ${className}`}>
      {trashCans.map((trash) => (
        <div
          key={trash.id}
          className="absolute pointer-events-none select-none opacity-10"
          style={{
            left: `${trash.left}%`,
            top: `${trash.top}%`,
            transform: `rotate(${trash.rotation}deg)`,
            fontSize: `${trash.fontSize}rem`,
          }}
        >
          🗑️
        </div>
      ))}
    </div>
  );
};